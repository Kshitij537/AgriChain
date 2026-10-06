/**
 * Transport Controller
 *
 * HTTP layer for transporter discovery. Validates input, resolves the mandi and
 * (when given) the farm, calls transportService, and maps error codes onto HTTP
 * status codes.
 *
 * DESIGN NOTE — why this never returns 5xx for a Google failure
 * ------------------------------------------------------------
 * A Google Places outage is not a failure of this endpoint. The farmer still gets
 * the thing that matters most — AgriChain's own estimated trip cost — plus an
 * honest explanation of why the business listings are missing. Returning 500
 * would make the frontend treat a partial success as a crash and would risk
 * taking the Market page down with it. So Google problems come back as 200 with
 * `available: false` and a reason; only a bad request or an unknown mandi is an
 * actual error status.
 */

const transportService = require('../services/transportService');
const marketService = require('../services/marketService');
const fuelPriceService = require('../services/fuelPriceService');
const freightRateService = require('../services/freightRateService');
const transportCostService = require('../services/transportCostService');
const { query } = require('../config/db');

/** Short correlation id, matching the market controller's convention. */
const newRequestId = () => Math.random().toString(36).slice(2, 8);

const STATUS_BY_CODE = {
  INVALID_FUEL_PRICE: 400,
  INVALID_FUEL_SOURCE: 400,
  FUTURE_OBSERVATION: 400,
  INVALID_QUOTE_RATE: 400,
  MISSING_TRANSPORTER: 400,
  UNKNOWN_VEHICLE_TYPE: 404,
  MARKET_NOT_FOUND: 404,
  MISSING_MARKET_COORDINATES: 422,
  MARKET_REQUIRED: 400,
  INVALID_COORDINATES: 400,
  INVALID_QUANTITY: 400,
  FARM_NOT_FOUND: 404
};

/**
 * Sends a structured error, matching the shape used across this backend.
 * @param {object} res
 * @param {Error} error
 * @param {string} requestId
 */
const sendError = (res, error, requestId) => {
  const code = error.code || 'INTERNAL_ERROR';
  const status = STATUS_BY_CODE[code] || 500;

  if (status >= 500) {
    console.error(`[Transport Controller] [${requestId}] ${code}: ${error.message}`);
  } else {
    console.warn(`[Transport Controller] [${requestId}] ${code}: ${error.message}`);
  }

  return res.status(status).json({
    success: false,
    error: { code, message: error.message || 'Unexpected server error', requestId }
  });
};

/**
 * Resolves the mandi from whichever identifier the caller supplied.
 *
 * Accepts a marketId/market code, or explicit coordinates plus a name for
 * markets that are not in our table. The farmer is never asked for coordinates —
 * the frontend passes the id of the market the recommendation engine chose.
 *
 * @param {object} params - req.query
 * @returns {Promise<object>} market summary
 * @throws {Error} MARKET_REQUIRED / MARKET_NOT_FOUND / INVALID_COORDINATES
 */
const resolveMarket = async (params) => {
  const marketRef = params.marketId || params.market || params.marketCode;

  if (marketRef) {
    const market = await marketService.getMarketById(marketRef);
    if (!market) {
      const error = new Error(`No market found matching "${marketRef}".`);
      error.code = 'MARKET_NOT_FOUND';
      throw error;
    }
    return market;
  }

  // Explicit coordinates path, for a market outside our master data.
  const latitude = Number(params.marketLatitude ?? params.lat);
  const longitude = Number(params.marketLongitude ?? params.lon);
  const name = params.marketName;

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    const error = new Error(
      'Provide marketId, or marketLatitude, marketLongitude and marketName.'
    );
    error.code = 'MARKET_REQUIRED';
    throw error;
  }
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
      (latitude === 0 && longitude === 0)) {
    const error = new Error('Market coordinates are not valid.');
    error.code = 'INVALID_COORDINATES';
    throw error;
  }

  return {
    id: null,
    marketCode: null,
    name: name || 'Selected market',
    district: params.marketDistrict || null,
    latitude,
    longitude
  };
};

/**
 * Resolves the farm whose location the trip estimate is measured from.
 *
 * Optional: without it the response still lists transporters, but
 * `tripEstimate` is null rather than being computed from a guessed distance.
 *
 * @param {object} params - req.query
 * @returns {Promise<object|null>}
 */
const resolveFarm = async (params) => {
  const farmRef = params.farmId;

  if (farmRef) {
    const farmId = parseInt(String(farmRef).replace(/^farm[_-]?/i, ''), 10);
    if (!Number.isFinite(farmId)) return null;

    const result = await query(
      'SELECT id, name, latitude, longitude FROM farms WHERE id = $1 LIMIT 1',
      [farmId]
    );
    if (!result.rows.length) return null;

    const row = result.rows[0];
    if (row.latitude === null || row.longitude === null) return null;
    return { id: row.id, name: row.name, latitude: row.latitude, longitude: row.longitude };
  }

  const latitude = Number(params.farmLatitude ?? params.farmLat);
  const longitude = Number(params.farmLongitude ?? params.farmLon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { id: null, name: null, latitude, longitude };
};

// ---------------------------------------------------------------------------
// GET /api/transport/search
// ---------------------------------------------------------------------------

/**
 * Finds transport businesses near the selected mandi.
 *
 * Query parameters:
 *   marketId                 markets.id or market_code (preferred)
 *   marketLatitude/Longitude explicit coordinates, with marketName
 *   farmId                   farm whose location the trip is measured from
 *   farmLatitude/Longitude   explicit farm coordinates instead of farmId
 *   quantityKg               drives vehicle selection for the cost estimate
 *   vehicleType              force a transport_config vehicle
 */
const search = async (req, res) => {
  const requestId = newRequestId();

  try {
    const market = await resolveMarket(req.query);
    const farm = await resolveFarm(req.query);

    const quantityRaw = req.query.quantityKg ?? req.query.quantity;
    let quantityKg = null;
    if (quantityRaw !== undefined && quantityRaw !== '') {
      const parsed = Number(quantityRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        const error = new Error('quantityKg must be a positive number.');
        error.code = 'INVALID_QUANTITY';
        throw error;
      }
      quantityKg = parsed;
    }

    console.log(
      `[Transport Controller] [${requestId}] search market=${market.marketCode || market.name} ` +
      `farmId=${farm ? farm.id : 'none'} qty=${quantityKg ?? 'n/a'}`
    );

    const result = await transportService.findTransporters({
      marketId: market.marketCode || market.id,
      market: market.id
        ? market
        : {
          id: null,
          marketCode: null,
          name: market.name,
          district: market.district,
          latitude: market.latitude,
          longitude: market.longitude
        },
      farm,
      quantityKg,
      vehicleType: req.query.vehicleType || null,
      requestId
    });

    // 200 even when Google failed: `available` and `reason` carry that, and the
    // trip estimate inside is still valid. See the note at the top of the file.
    return res.json({ success: true, data: { ...result, requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/transport/health
 * Reports whether Google Places is configured and what it does and does not
 * provide. Useful before a demo, and it never reveals the key.
 */
const healthCheck = async (req, res) => {
  const requestId = newRequestId();
  try {
    return res.json({
      success: true,
      data: { status: 'ok', ...transportService.getTransportStatus(), requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * POST /api/transport/fuel-price
 *
 * Records today's diesel price so freight stops being an unsourced guess. Any
 * authenticated user may submit one - the pump board is public information - but
 * the row is stamped with who reported it and at what confidence, and an admin or
 * official figure outranks a user-reported one.
 */
const recordFuelPrice = async (req, res) => {
  const requestId = newRequestId();
  try {
    const roles = req.user && req.user.roles ? req.user.roles : [];
    const isAdmin = Array.isArray(roles) ? roles.includes('admin') : false;

    // A caller cannot promote their own observation to OFFICIAL_API: that label
    // means "a government feed said so", and only ingestion may claim it.
    const requested = req.body.source;
    const source = isAdmin && requested === 'ADMIN_ENTERED' ? 'ADMIN_ENTERED' : 'USER_REPORTED';

    const saved = await fuelPriceService.recordObservation({
      pricePerLitre: req.body.pricePerLitre,
      fuelType: req.body.fuelType || 'diesel',
      state: req.body.state || 'Maharashtra',
      district: req.body.district || null,
      city: req.body.city || null,
      source,
      sourceNote: req.body.sourceNote || null,
      observedOn: req.body.observedOn || null,
      recordedBy: (req.user && req.user.id) || null
    });

    console.log(
      `[Transport Controller] [${requestId}] fuel observation ` +
      `${saved.fuelType} Rs${saved.pricePerLitre}/L ${saved.state} ${saved.observedOn} (${saved.source})`
    );

    return res.status(201).json({ success: true, data: saved });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * POST /api/transport/quotes
 *
 * Records a rate a real transporter actually quoted. This is the only input that
 * makes the freight figure a real rate rather than an indexed estimate, so the
 * transporter must be named.
 */
const recordQuote = async (req, res) => {
  const requestId = newRequestId();
  try {
    const saved = await freightRateService.recordQuote({
      vehicleType: req.body.vehicleType,
      ratePerKm: req.body.ratePerKm,
      loadingCost: req.body.loadingCost ?? null,
      unloadingCost: req.body.unloadingCost ?? null,
      minimumCharge: req.body.minimumCharge ?? null,
      returnTripFactor: req.body.returnTripFactor ?? null,
      transporterName: req.body.transporterName,
      transporterPhone: req.body.transporterPhone || null,
      googlePlaceId: req.body.googlePlaceId || null,
      district: req.body.district || null,
      state: req.body.state || 'Maharashtra',
      quotedOn: req.body.quotedOn || null,
      validUntil: req.body.validUntil || null,
      notes: req.body.notes || null,
      recordedBy: (req.user && req.user.id) || null
    });

    console.log(
      `[Transport Controller] [${requestId}] quote ${saved.vehicleType} ` +
      `Rs${saved.ratePerKm}/km from ${saved.transporterName} (${saved.quotedOn})`
    );

    return res.status(201).json({ success: true, data: saved });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/transport/rate-basis?district=Wardha
 *
 * What every vehicle is currently priced at and why. Exists so the provenance of
 * a freight figure can be inspected without reverse-engineering a ledger.
 */
const rateBasis = async (req, res) => {
  const requestId = newRequestId();
  try {
    const state = req.query.state || 'Maharashtra';
    const district = req.query.district || null;

    const vehicles = await transportCostService.loadVehicles();
    const diesel = await fuelPriceService.getCurrentPrice({ fuelType: 'diesel', state, district });

    const resolved = [];
    for (const vehicle of vehicles) {
      const rate = await freightRateService.resolveRate({ vehicle, state, district, fuel: diesel });
      resolved.push({
        vehicleType: vehicle.vehicle_type,
        label: vehicle.label,
        capacityKg: Number(vehicle.capacity_kg) || null,
        effectiveRatePerKm: rate.ratePerKm,
        baselineRatePerKm: Number(vehicle.rate_per_km),
        rateSource: rate.rateSource,
        isRealRate: rate.isRealRate,
        rateSourceNote: rate.rateSourceNote,
        evidence: rate.evidence
      });
    }

    return res.json({
      success: true,
      data: {
        state,
        district,
        diesel,
        vehicles: resolved,
        // Named explicitly so a caller can tell at a glance whether ANY freight
        // figure on this deployment is backed by a real quote.
        anyRealRate: resolved.some((v) => v.isRealRate),
        precedence: ['TRANSPORTER_QUOTE', 'ESTIMATE_FUEL_INDEXED', 'CONFIGURED_ESTIMATE'],
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * POST /api/transport/config/reload
 *
 * Clears the transport_config cache.
 *
 * WHY THIS ENDPOINT EXISTS
 * ------------------------
 * loadVehicles() caches vehicle configuration for 5 minutes, which is right for
 * a value read once per market per request. But rates are changed by SQL, outside
 * the application - that is the whole point of holding them in a table - so
 * without this a corrected rate or a newly declared diesel baseline silently does
 * not apply for up to five minutes, and the freight the farmer sees disagrees
 * with the database an admin is looking at.
 */
const reloadConfig = async (req, res) => {
  const requestId = newRequestId();
  try {
    transportCostService.clearVehicleCache();
    const vehicles = await transportCostService.loadVehicles();
    console.log(`[Transport Controller] [${requestId}] transport_config cache cleared`);
    return res.json({
      success: true,
      data: {
        reloaded: true,
        vehicleCount: vehicles.length,
        vehicles: vehicles.map((v) => ({
          vehicleType: v.vehicle_type,
          ratePerKm: Number(v.rate_per_km),
          baselineDieselPrice: v.baseline_diesel_price === null ? null : Number(v.baseline_diesel_price)
        }))
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/transport/fuel-price/history
 */
const fuelHistory = async (req, res) => {
  const requestId = newRequestId();
  try {
    const observations = await fuelPriceService.getHistory({
      fuelType: req.query.fuelType || 'diesel',
      state: req.query.state || 'Maharashtra',
      limit: req.query.limit
    });
    return res.json({ success: true, data: { observations, count: observations.length } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

module.exports = {
  recordFuelPrice,
  reloadConfig,
  recordQuote,
  rateBasis,
  fuelHistory,
  search,
  healthCheck,
  resolveMarket,
  resolveFarm
};
