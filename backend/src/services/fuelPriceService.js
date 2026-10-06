/**
 * Fuel price observations.
 *
 * Diesel is the one input to freight that genuinely moves day to day and can be
 * observed without guessing: it is printed on every pump board. This service
 * stores dated observations and reads back the most recent usable one.
 *
 * PROVENANCE RULE
 * ---------------
 * Every row is an observation someone actually made, with a source and a date.
 * This service never interpolates, extrapolates, or invents a price. If there is
 * no observation it returns available:false and says why - it does not guess
 * today's price from last month's.
 *
 * SOURCE PRECEDENCE
 * -----------------
 *   OFFICIAL_API  > ADMIN_ENTERED > USER_REPORTED
 * A farmer reading a pump board is real data, but an admin working from an oil
 * marketing company's published price is better, and an official feed is better
 * still. Ties break on the more recent observation.
 */

const { query } = require('../config/db');

/** How old a diesel observation may be before it stops being "current". */
const MAX_AGE_DAYS = Number(process.env.FUEL_PRICE_MAX_AGE_DAYS) || 14;

/** Ranking used when several observations exist for the same day. */
const SOURCE_RANK = { OFFICIAL_API: 3, ADMIN_ENTERED: 2, USER_REPORTED: 1 };

/**
 * pg returns DATE as a local-midnight Date. toISOString() would shift it back a
 * day in IST and overstate the age of every observation.
 * @param {Date|string} value
 * @returns {string|null} YYYY-MM-DD
 */
const toLocalDateString = (value) => {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/**
 * Whole days between an observation date and today, in local time.
 * @param {string} dateStr - YYYY-MM-DD
 * @returns {number}
 */
const ageInDays = (dateStr) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const then = new Date(`${dateStr}T00:00:00`);
  return Math.round((today - then) / 86400000);
};

/**
 * Records one fuel price observation.
 *
 * Re-submitting the same fuel/state/district/day/source corrects the earlier
 * value rather than creating a duplicate, so a typo can be fixed.
 *
 * @param {object} input
 * @param {number} input.pricePerLitre
 * @param {string} [input.fuelType] - diesel (default), petrol, cng
 * @param {string} [input.state]
 * @param {string} [input.district]
 * @param {string} [input.city]
 * @param {string} [input.source] - OFFICIAL_API | ADMIN_ENTERED | USER_REPORTED
 * @param {string} [input.sourceNote] - where the observer got it
 * @param {string} [input.observedOn] - YYYY-MM-DD, defaults to today
 * @param {number|null} [input.recordedBy] - users.id
 * @returns {Promise<object>} the stored row
 * @throws {Error} INVALID_FUEL_PRICE / FUTURE_OBSERVATION
 */
const recordObservation = async ({
  pricePerLitre,
  fuelType = 'diesel',
  state = 'Maharashtra',
  district = null,
  city = null,
  source = 'USER_REPORTED',
  sourceNote = null,
  observedOn = null,
  recordedBy = null
} = {}) => {
  const price = Number(pricePerLitre);
  // The DB CHECK is the backstop; this gives the user a usable message first.
  if (!Number.isFinite(price) || price <= 20 || price >= 300) {
    const err = new Error(
      'Enter the pump price per litre - a diesel price should be between ₹20 and ₹300.'
    );
    err.code = 'INVALID_FUEL_PRICE';
    throw err;
  }

  if (!SOURCE_RANK[source]) {
    const err = new Error(`source must be one of ${Object.keys(SOURCE_RANK).join(', ')}`);
    err.code = 'INVALID_FUEL_SOURCE';
    throw err;
  }

  const day = observedOn || toLocalDateString(new Date());
  if (ageInDays(day) < 0) {
    const err = new Error('An observation cannot be dated in the future.');
    err.code = 'FUTURE_OBSERVATION';
    throw err;
  }

  const result = await query(
    `INSERT INTO fuel_prices
       (fuel_type, price_per_litre, city, district, state, source, source_note,
        observed_on, recorded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (fuel_type, state, COALESCE(district, ''), observed_on, source)
     DO UPDATE SET price_per_litre = EXCLUDED.price_per_litre,
                   city = EXCLUDED.city,
                   source_note = EXCLUDED.source_note,
                   recorded_by = EXCLUDED.recorded_by
     RETURNING *`,
    [fuelType, price, city, district, state, source, sourceNote, day, recordedBy]
  );

  const row = result.rows[0];
  return {
    id: row.id,
    fuelType: row.fuel_type,
    pricePerLitre: Number(row.price_per_litre),
    state: row.state,
    district: row.district,
    city: row.city,
    source: row.source,
    sourceNote: row.source_note,
    observedOn: toLocalDateString(row.observed_on)
  };
};

/**
 * Most recent usable observation for a place.
 *
 * Prefers an observation for the given district, then the state. Within the same
 * date, the better source wins.
 *
 * @param {object} [input]
 * @param {string} [input.fuelType]
 * @param {string} [input.state]
 * @param {string} [input.district]
 * @returns {Promise<object>} { available, pricePerLitre, observedOn, ageInDays, ... }
 */
const getCurrentPrice = async ({
  fuelType = 'diesel',
  state = 'Maharashtra',
  district = null
} = {}) => {
  const result = await query(
    `SELECT price_per_litre, district, city, state, source, source_note, observed_on
       FROM fuel_prices
      WHERE fuel_type = $1
        AND state = $2
        AND observed_on >= CURRENT_DATE - ($3::int || ' days')::interval
      ORDER BY
        -- an observation for this district beats a state-level one
        CASE WHEN $4::text IS NOT NULL AND district = $4::text THEN 0 ELSE 1 END,
        observed_on DESC,
        CASE source WHEN 'OFFICIAL_API' THEN 3 WHEN 'ADMIN_ENTERED' THEN 2 ELSE 1 END DESC
      LIMIT 1`,
    [fuelType, state, MAX_AGE_DAYS, district]
  );

  if (!result.rows.length) {
    return {
      available: false,
      reason: 'NO_OBSERVATION',
      message:
        `No ${fuelType} price has been recorded for ${state} in the last ` +
        `${MAX_AGE_DAYS} days. Record today's pump price to index freight to it.`,
      maxAgeDays: MAX_AGE_DAYS
    };
  }

  const row = result.rows[0];
  const observedOn = toLocalDateString(row.observed_on);
  const age = ageInDays(observedOn);

  return {
    available: true,
    fuelType,
    pricePerLitre: Number(row.price_per_litre),
    state: row.state,
    district: row.district,
    city: row.city,
    source: row.source,
    sourceNote: row.source_note,
    observedOn,
    ageInDays: age,
    // Same figure, described for a farmer: a two-week-old diesel price is still
    // informative, but it is not today's.
    freshness: age === 0 ? 'TODAY' : age <= 3 ? 'RECENT' : 'AGEING',
    maxAgeDays: MAX_AGE_DAYS
  };
};

/**
 * Recent observation history, for a chart or an audit.
 * @param {object} [input]
 * @returns {Promise<Array>}
 */
const getHistory = async ({ fuelType = 'diesel', state = 'Maharashtra', limit = 30 } = {}) => {
  const result = await query(
    `SELECT price_per_litre, district, source, observed_on
       FROM fuel_prices
      WHERE fuel_type = $1 AND state = $2
      ORDER BY observed_on DESC
      LIMIT $3`,
    [fuelType, state, Math.min(365, Math.max(1, Number(limit) || 30))]
  );

  return result.rows.map((r) => ({
    pricePerLitre: Number(r.price_per_litre),
    district: r.district,
    source: r.source,
    observedOn: toLocalDateString(r.observed_on)
  }));
};

module.exports = {
  recordObservation,
  getCurrentPrice,
  getHistory,
  toLocalDateString,
  ageInDays,
  MAX_AGE_DAYS,
  SOURCE_RANK
};
