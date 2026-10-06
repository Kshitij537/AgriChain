/**
 * Market price read layer.
 *
 * Owns every read of market_prices and attaches provenance and freshness to
 * each one. Market prices are perishable information: a four-week-old quote
 * presented as "the price" would send a farmer to the wrong mandi, so no price
 * leaves this service without saying where it came from and how old it is.
 *
 * Freshness thresholds are configurable:
 *   MARKET_PRICE_FRESH_DAYS   (default 2)
 *   MARKET_PRICE_RECENT_DAYS  (default 7)
 *   MARKET_PRICE_STALE_DAYS   (default 30)
 */

const { query } = require('../config/db');

/**
 * Formats a DATE column as YYYY-MM-DD in the server's own timezone.
 *
 * node-postgres parses a DATE as local midnight, so `toISOString()` rewinds it
 * past the UTC boundary for any timezone east of Greenwich: a 24 Sep observation
 * read in IST serialises as "2026-09-23". That silently adds a day to every
 * price's apparent age and can push a FRESH quote into RECENT, so date fields
 * must be built from local components instead.
 *
 * @param {Date|string|null} value
 * @returns {string|null} YYYY-MM-DD
 */
const toLocalDateString = (value) => {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  return String(value).slice(0, 10);
};

/**
 * Provenance values permitted in market_prices.source.
 *
 * MANDI_API names the PROVIDER we fetched from, not the ultimate origin of the
 * data. The provider aggregates a government dataset, but its freshness, coverage
 * and mistakes are its own, so labelling its rows as a government source would
 * claim more than we can vouch for.
 *
 * AGMARKNET is retained as a legacy label: it is no longer produced by any
 * ingestion path, but rows written by the retired data.gov.in integration must
 * keep meaning what they meant when they were written.
 */
const SOURCE = {
  MANDI_API: 'MANDI_API',
  AGMARKNET: 'AGMARKNET',
  DEMO_SEED: 'DEMO_SEED'
};

/** Sources that represent a real observation rather than demonstration data. */
const REAL_SOURCES = [SOURCE.MANDI_API, SOURCE.AGMARKNET];

const FRESHNESS = {
  FRESH: 'FRESH',
  RECENT: 'RECENT',
  STALE: 'STALE',
  EXPIRED: 'EXPIRED'
};

const thresholds = () => ({
  fresh: parseInt(process.env.MARKET_PRICE_FRESH_DAYS, 10) || 2,
  recent: parseInt(process.env.MARKET_PRICE_RECENT_DAYS, 10) || 7,
  stale: parseInt(process.env.MARKET_PRICE_STALE_DAYS, 10) || 30
});

/**
 * Whole days between an observation date and today.
 * @param {Date|string} observationDate
 * @returns {number}
 */
const ageInDays = (observationDate) => {
  const observed = new Date(observationDate);
  if (Number.isNaN(observed.getTime())) return Number.MAX_SAFE_INTEGER;
  const today = new Date();
  observed.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - observed) / 86400000));
};

/**
 * Classifies how usable an observation is given its age.
 * @param {Date|string} observationDate
 * @returns {string} one of FRESHNESS
 */
const classifyFreshness = (observationDate) => {
  const age = ageInDays(observationDate);
  const limits = thresholds();
  if (age <= limits.fresh) return FRESHNESS.FRESH;
  if (age <= limits.recent) return FRESHNESS.RECENT;
  if (age <= limits.stale) return FRESHNESS.STALE;
  return FRESHNESS.EXPIRED;
};

/**
 * Shapes a market_prices row into the API contract, with provenance attached.
 * @param {object} row
 * @returns {object}
 */
const decorate = (row) => {
  if (!row) return null;
  const observationDate = toLocalDateString(row.observation_date);

  return {
    marketId: row.market_id,
    marketCode: row.market_code,
    marketName: row.market_name,
    district: row.district,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    crop: row.crop,
    variety: row.variety,
    // Kept as strings from pg NUMERIC; converted with utils/money at the point
    // of arithmetic, never with parseFloat into a binary float.
    minPrice: row.min_price,
    maxPrice: row.max_price,
    modalPrice: row.modal_price,
    arrivalQuantity: row.arrival_quantity,
    priceUnit: row.price_unit,
    source: row.source,
    isDemoData: row.source === SOURCE.DEMO_SEED,
    observationDate,
    fetchedAt: row.fetched_at,
    ageInDays: ageInDays(observationDate),
    freshness: classifyFreshness(observationDate)
  };
};

/**
 * Preferred source order: a real observation always beats a demo row, and a
 * newer observation beats an older one.
 */
const SOURCE_PRIORITY_SQL = `CASE mp.source
  WHEN 'MANDI_API' THEN 0
  WHEN 'AGMARKNET' THEN 1
  ELSE 2 END`;

/**
 * Latest price for one crop at one market.
 * @param {string} crop
 * @param {number} marketId
 * @returns {Promise<object|null>}
 */
const getLatestPrice = async (crop, marketId) => {
  const result = await query(
    `SELECT mp.*, m.market_code, m.name AS market_name, m.district,
            m.latitude, m.longitude
     FROM market_prices mp
     JOIN markets m ON m.id = mp.market_id
     WHERE mp.crop = $1 AND mp.market_id = $2
     ORDER BY mp.observation_date DESC, ${SOURCE_PRIORITY_SQL}
     LIMIT 1`,
    [crop, marketId]
  );
  return decorate(result.rows[0]);
};

/**
 * Latest price for a crop at every active market that has one.
 *
 * Uses DISTINCT ON to take exactly one row per market - the newest, preferring
 * real data over demo data.
 *
 * @param {string} crop
 * @param {object} [options] - { marketIds }
 * @returns {Promise<Array>}
 */
const getLatestPricesForCrop = async (crop, { marketIds = null } = {}) => {
  const params = [crop];
  let marketFilter = '';
  if (Array.isArray(marketIds) && marketIds.length) {
    params.push(marketIds);
    marketFilter = `AND mp.market_id = ANY($${params.length}::int[])`;
  }

  const result = await query(
    `SELECT DISTINCT ON (mp.market_id)
            mp.*, m.market_code, m.name AS market_name, m.district,
            m.latitude, m.longitude
     FROM market_prices mp
     JOIN markets m ON m.id = mp.market_id
     WHERE mp.crop = $1 AND m.active = TRUE ${marketFilter}
     ORDER BY mp.market_id, mp.observation_date DESC, ${SOURCE_PRIORITY_SQL}`,
    params
  );

  return result.rows.map(decorate);
};

/**
 * Chronological price history, oldest first - the shape the ML feature builder
 * needs for lag and rolling-window features.
 *
 * @param {string} crop
 * @param {number} marketId
 * @param {number} [days]
 * @returns {Promise<Array>}
 */
const getPriceHistory = async (crop, marketId, days = 120) => {
  const result = await query(
    `SELECT mp.*, m.market_code, m.name AS market_name, m.district,
            m.latitude, m.longitude
     FROM market_prices mp
     JOIN markets m ON m.id = mp.market_id
     WHERE mp.crop = $1 AND mp.market_id = $2
       AND mp.observation_date >= CURRENT_DATE - ($3::int || ' days')::interval
     ORDER BY mp.observation_date ASC`,
    [crop, marketId, days]
  );
  return result.rows.map(decorate);
};

/**
 * Summarises what price data exists, for health checks and the training
 * pipeline's "do I have enough history?" gate.
 * @returns {Promise<object>}
 */
const getCoverageSummary = async () => {
  const result = await query(
    `SELECT crop, source,
            COUNT(*)::int AS observations,
            COUNT(DISTINCT market_id)::int AS markets,
            MIN(observation_date) AS earliest,
            MAX(observation_date) AS latest
     FROM market_prices
     GROUP BY crop, source
     ORDER BY crop, source`
  );

  return result.rows.map((row) => ({
    crop: row.crop,
    source: row.source,
    isDemoData: row.source === SOURCE.DEMO_SEED,
    observations: row.observations,
    markets: row.markets,
    earliest: toLocalDateString(row.earliest),
    latest: toLocalDateString(row.latest),
    freshness: row.latest ? classifyFreshness(row.latest) : FRESHNESS.EXPIRED
  }));
};

module.exports = {
  SOURCE,
  REAL_SOURCES,
  FRESHNESS,
  toLocalDateString,
  getLatestPrice,
  getLatestPricesForCrop,
  getPriceHistory,
  getCoverageSummary,
  classifyFreshness,
  ageInDays
};
