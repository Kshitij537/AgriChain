/**
 * Freight rate resolution: deciding which ₹/km a load is priced at, and saying
 * where that number came from.
 *
 * transportCostService owns the freight FORMULA and remains the only place that
 * computes a cost. This service owns the RATE that goes into it, because "what
 * does a truck cost per km today" is an evidence question, not an arithmetic one.
 *
 * PRECEDENCE - best evidence first
 * -------------------------------
 *   1. TRANSPORTER_QUOTE      a named, phone-reachable transporter quoted this
 *                             rate on this date. Real money, real business.
 *   2. ESTIMATE_FUEL_INDEXED  our baseline estimate, moved by the ratio of the
 *                             latest observed diesel price to the diesel price
 *                             the baseline was set against. The baseline is still
 *                             an estimate; the MOVEMENT is real and dated.
 *   3. CONFIGURED_ESTIMATE    the static transport_config rate, unsourced.
 *
 * WHY INDEXATION AND NOT DERIVATION
 * ---------------------------------
 * It is tempting to compute rate = diesel / mileage + fixed_cost and call the
 * result "derived from real data". It is not: nobody has told us the operator's
 * fixed cost per km, so that term would be invented, and a fuel-only rate
 * understates freight badly - which would bias the ranking toward distant mandis.
 * Indexing a labelled estimate to real diesel movement claims exactly as much as
 * we can support and no more.
 *
 * Indexation requires transport_config.baseline_diesel_price, which is
 * deliberately not seeded. Until an operator sets it, this service reports
 * CONFIGURED_ESTIMATE rather than pretending to index against a guess.
 */

const { query } = require('../config/db');
const fuelPriceService = require('./fuelPriceService');

/** How old a transporter quote may be before it is no longer used. */
const QUOTE_MAX_AGE_DAYS = Number(process.env.FREIGHT_QUOTE_MAX_AGE_DAYS) || 45;

/**
 * Guard rails on indexation. Diesel moving 8% should move freight 8%; a stale or
 * mistyped baseline producing a 3x swing must not silently reprice every mandi.
 */
const MIN_INDEX_FACTOR = 0.6;
const MAX_INDEX_FACTOR = 1.6;

/**
 * Most recent usable quote for a vehicle class.
 *
 * A quote for the farmer's own district beats a state-wide one: freight rates are
 * corridor-specific.
 *
 * @param {object} input
 * @param {string} input.vehicleType
 * @param {string} [input.state]
 * @param {string} [input.district]
 * @returns {Promise<object|null>}
 */
const findQuote = async ({ vehicleType, state = 'Maharashtra', district = null }) => {
  const result = await query(
    `SELECT rate_per_km, loading_cost, unloading_cost, minimum_charge,
            return_trip_factor, transporter_name, transporter_phone,
            google_place_id, district, quoted_on, valid_until, notes
       FROM transport_rate_quotes
      WHERE vehicle_type = $1
        AND state = $2
        AND active = TRUE
        AND quoted_on >= CURRENT_DATE - ($3::int || ' days')::interval
        AND (valid_until IS NULL OR valid_until >= CURRENT_DATE)
      ORDER BY
        CASE WHEN $4::text IS NOT NULL AND district = $4::text THEN 0 ELSE 1 END,
        quoted_on DESC
      LIMIT 1`,
    [vehicleType, state, QUOTE_MAX_AGE_DAYS, district]
  );

  if (!result.rows.length) return null;

  const r = result.rows[0];
  return {
    ratePerKm: Number(r.rate_per_km),
    loadingCost: r.loading_cost === null ? null : Number(r.loading_cost),
    unloadingCost: r.unloading_cost === null ? null : Number(r.unloading_cost),
    minimumCharge: r.minimum_charge === null ? null : Number(r.minimum_charge),
    returnTripFactor: r.return_trip_factor === null ? null : Number(r.return_trip_factor),
    transporterName: r.transporter_name,
    transporterPhone: r.transporter_phone,
    googlePlaceId: r.google_place_id,
    district: r.district,
    quotedOn: fuelPriceService.toLocalDateString(r.quoted_on),
    validUntil: fuelPriceService.toLocalDateString(r.valid_until),
    notes: r.notes,
    ageInDays: fuelPriceService.ageInDays(fuelPriceService.toLocalDateString(r.quoted_on))
  };
};

/**
 * Resolves the effective freight rate for one vehicle, with full provenance.
 *
 * Returns the same field names regardless of which source won, so the caller
 * never has to branch on source to read a rate.
 *
 * @param {object} input
 * @param {object} input.vehicle - a transport_config row
 * @param {string} [input.state]
 * @param {string} [input.district] - the farm's district
 * @param {object} [input.fuel] - injected current-price result (tests)
 * @param {object|null} [input.quote] - injected quote (tests)
 * @returns {Promise<object>}
 */
const resolveRate = async ({
  vehicle,
  state = 'Maharashtra',
  district = null,
  fuel = null,
  quote = undefined
} = {}) => {
  if (!vehicle) {
    const err = new Error('vehicle config is required to resolve a freight rate');
    err.code = 'MISSING_VEHICLE';
    throw err;
  }

  const baselineRate = Number(vehicle.rate_per_km);
  const configuredFallback = {
    ratePerKm: baselineRate,
    loadingCost: Number(vehicle.loading_cost),
    unloadingCost: Number(vehicle.unloading_cost),
    minimumCharge: Number(vehicle.minimum_charge),
    returnTripFactor: Number(vehicle.return_trip_factor) || 1,
    rateSource: 'CONFIGURED_ESTIMATE',
    isRealRate: false,
    rateSourceNote: vehicle.rate_source_note
      || 'Indicative rate held in transport_config. Not a quoted or observed figure.',
    evidence: null
  };

  // --- 1. A real quote from a real transporter wins outright ----------------
  const found = quote === undefined
    ? await findQuote({ vehicleType: vehicle.vehicle_type, state, district })
    : quote;

  if (found) {
    return {
      // A quote may cover only the per-km rate; anything it does not state falls
      // back to configuration rather than being treated as zero.
      ratePerKm: found.ratePerKm,
      loadingCost: found.loadingCost ?? configuredFallback.loadingCost,
      unloadingCost: found.unloadingCost ?? configuredFallback.unloadingCost,
      minimumCharge: found.minimumCharge ?? configuredFallback.minimumCharge,
      returnTripFactor: found.returnTripFactor ?? configuredFallback.returnTripFactor,
      rateSource: 'TRANSPORTER_QUOTE',
      isRealRate: true,
      rateSourceNote:
        `Quoted by ${found.transporterName} on ${found.quotedOn}` +
        (found.district ? ` for ${found.district}` : ''),
      evidence: {
        transporterName: found.transporterName,
        transporterPhone: found.transporterPhone,
        googlePlaceId: found.googlePlaceId,
        quotedOn: found.quotedOn,
        validUntil: found.validUntil,
        ageInDays: found.ageInDays,
        partialQuote: found.loadingCost === null || found.minimumCharge === null,
        notes: found.notes
      }
    };
  }

  // --- 2. Index the baseline estimate to observed diesel movement -----------
  const baselineDiesel = vehicle.baseline_diesel_price === null
    || vehicle.baseline_diesel_price === undefined
    ? null
    : Number(vehicle.baseline_diesel_price);

  if (!baselineDiesel || baselineDiesel <= 0) {
    return {
      ...configuredFallback,
      rateSourceNote:
        `${configuredFallback.rateSourceNote} Set baseline_diesel_price on this ` +
        'vehicle to index it to observed diesel prices.'
    };
  }

  const current = fuel || await fuelPriceService.getCurrentPrice({ fuelType: 'diesel', state, district });
  if (!current.available) {
    return {
      ...configuredFallback,
      rateSourceNote: `${configuredFallback.rateSourceNote} ${current.message}`
    };
  }

  const rawFactor = current.pricePerLitre / baselineDiesel;
  const clamped = Math.min(MAX_INDEX_FACTOR, Math.max(MIN_INDEX_FACTOR, rawFactor));
  const factorClamped = clamped !== rawFactor;

  // Rounded to paise: a rate is money, and an unrounded float here would show up
  // as a different total on every recomputation.
  const indexedRate = Math.round(baselineRate * clamped * 100) / 100;

  return {
    ratePerKm: indexedRate,
    loadingCost: configuredFallback.loadingCost,
    unloadingCost: configuredFallback.unloadingCost,
    minimumCharge: configuredFallback.minimumCharge,
    returnTripFactor: configuredFallback.returnTripFactor,
    rateSource: 'ESTIMATE_FUEL_INDEXED',
    // Still not a real rate: a real diesel movement applied to an estimated base.
    isRealRate: false,
    rateSourceNote:
      `Baseline ₹${baselineRate}/km (estimate, set against ₹${baselineDiesel}/L diesel) ` +
      `adjusted for diesel observed at ₹${current.pricePerLitre}/L on ${current.observedOn}` +
      (factorClamped ? ' (adjustment capped)' : ''),
    evidence: {
      baselineRatePerKm: baselineRate,
      baselineDieselPrice: baselineDiesel,
      observedDieselPrice: current.pricePerLitre,
      observedOn: current.observedOn,
      observationAgeInDays: current.ageInDays,
      observationSource: current.source,
      observationFreshness: current.freshness,
      indexFactor: Math.round(clamped * 1000) / 1000,
      indexFactorRaw: Math.round(rawFactor * 1000) / 1000,
      indexFactorClamped: factorClamped,
      mileageKmpl: vehicle.mileage_kmpl === null || vehicle.mileage_kmpl === undefined
        ? null
        : Number(vehicle.mileage_kmpl)
    }
  };
};

/**
 * Records a quote obtained from a real transporter.
 *
 * @param {object} input
 * @returns {Promise<object>} the stored quote
 * @throws {Error} INVALID_QUOTE_RATE / MISSING_TRANSPORTER
 */
const recordQuote = async ({
  vehicleType,
  ratePerKm,
  loadingCost = null,
  unloadingCost = null,
  minimumCharge = null,
  returnTripFactor = null,
  transporterName,
  transporterPhone = null,
  googlePlaceId = null,
  district = null,
  state = 'Maharashtra',
  quotedOn = null,
  validUntil = null,
  notes = null,
  recordedBy = null
} = {}) => {
  const rate = Number(ratePerKm);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 500) {
    const err = new Error('rate_per_km must be a realistic per-kilometre rate in rupees.');
    err.code = 'INVALID_QUOTE_RATE';
    throw err;
  }

  // A rate with no transporter behind it is indistinguishable from an invented
  // one, which is the entire problem this table exists to solve.
  if (!transporterName || !String(transporterName).trim()) {
    const err = new Error('transporterName is required: a quote must be attributable.');
    err.code = 'MISSING_TRANSPORTER';
    throw err;
  }

  const vehicleExists = await query(
    'SELECT 1 FROM transport_config WHERE vehicle_type = $1',
    [vehicleType]
  );
  if (!vehicleExists.rows.length) {
    const err = new Error(`Unknown vehicle_type "${vehicleType}".`);
    err.code = 'UNKNOWN_VEHICLE_TYPE';
    throw err;
  }

  const result = await query(
    `INSERT INTO transport_rate_quotes
       (vehicle_type, rate_per_km, loading_cost, unloading_cost, minimum_charge,
        return_trip_factor, transporter_name, transporter_phone, google_place_id,
        district, state, quoted_on, valid_until, notes, recorded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
             COALESCE($12::date, CURRENT_DATE), $13, $14, $15)
     RETURNING *`,
    [vehicleType, rate, loadingCost, unloadingCost, minimumCharge, returnTripFactor,
      String(transporterName).trim(), transporterPhone, googlePlaceId, district, state,
      quotedOn, validUntil, notes, recordedBy]
  );

  const r = result.rows[0];
  return {
    id: r.id,
    vehicleType: r.vehicle_type,
    ratePerKm: Number(r.rate_per_km),
    transporterName: r.transporter_name,
    transporterPhone: r.transporter_phone,
    district: r.district,
    quotedOn: fuelPriceService.toLocalDateString(r.quoted_on),
    validUntil: fuelPriceService.toLocalDateString(r.valid_until)
  };
};

module.exports = {
  resolveRate,
  findQuote,
  recordQuote,
  QUOTE_MAX_AGE_DAYS,
  MIN_INDEX_FACTOR,
  MAX_INDEX_FACTOR
};
