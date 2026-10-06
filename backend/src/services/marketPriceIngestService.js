/**
 * Market price ingestion - provider agnostic.
 *
 * Replaces the AGMARKNET-specific ingestion. Reads observations through the
 * MarketPriceProvider abstraction and writes them to market_prices, so swapping
 * or adding a provider never touches this file.
 *
 * PROVENANCE RULES
 * ----------------
 * 1. Only rows the provider actually returned are written. Nothing is
 *    synthesised, interpolated or back-filled. If the provider is unreachable,
 *    zero rows are written and the run is recorded as FAILED.
 * 2. market_prices.source records the PROVIDER we fetched from (e.g. MANDI_API),
 *    never the ultimate origin of the data. An aggregator is not a government
 *    source, and its coverage and mistakes are its own.
 * 3. A market is ingested only through an explicit market_provider_map row with
 *    match_type EXACT or VERIFIED. Attributing one mandi's prices to a different
 *    mandi - even one in the same district - would corrupt every ranking that
 *    mandi appears in, so FUZZY mappings are recorded for review and not used.
 *
 * WHY MARKET-BY-MARKET
 * --------------------
 * The mandi_api /prices endpoint caps at 200 records and ignores limit/offset/
 * page, so there is no way to pull a state whole. A market-scoped query, though,
 * returns that market's full history. Iterating mapped markets is therefore both
 * necessary and better: it yields history, not just today.
 */

const { query, pool } = require('../config/db');
const { getProvider } = require('./providers');
const { namesMatch } = require('./providers/mandiApiProvider');
const marketPriceService = require('./marketPriceService');

/** Match types trusted for ingestion. FUZZY is recorded but never ingested. */
const TRUSTED_MATCH_TYPES = ['EXACT', 'VERIFIED'];

/**
 * Mapped markets for a provider, joined to our market rows.
 *
 * @param {object} input
 * @param {string} input.provider
 * @param {string} [input.state]
 * @param {Array<number>} [input.marketIds] - restrict to these markets
 * @returns {Promise<Array>}
 */
const getMappedMarkets = async ({ provider, state = null, marketIds = null }) => {
  const params = [provider, TRUSTED_MATCH_TYPES];
  let extra = '';

  if (state) {
    params.push(state);
    extra += ` AND pm.provider_state = $${params.length}`;
  }
  if (Array.isArray(marketIds) && marketIds.length) {
    params.push(marketIds);
    extra += ` AND m.id = ANY($${params.length}::int[])`;
  }

  const result = await query(
    `SELECT pm.market_id, pm.provider_market, pm.provider_district, pm.provider_state,
            pm.match_type, m.market_code, m.name AS market_name, m.district
       FROM market_provider_map pm
       JOIN markets m ON m.id = pm.market_id
      WHERE pm.provider = $1
        AND pm.active = TRUE
        AND pm.match_type = ANY($2::text[])
        AND m.active = TRUE
        ${extra}
      ORDER BY m.name`,
    params
  );

  return result.rows;
};

/**
 * Provider commodity spellings for each of our crops.
 *
 * Returns a Map of crop -> [provider commodity, ...]. One crop legitimately maps
 * to several spellings (chilli arrives as both "Green Chilli" and "Chilly Red").
 *
 * @param {object} input
 * @param {string} input.provider
 * @param {Array<string>} [input.crops] - restrict to these crops
 * @returns {Promise<Map<string, Array<string>>>}
 */
const getCommodityMap = async ({ provider, crops = null }) => {
  const params = [provider];
  let extra = '';
  if (Array.isArray(crops) && crops.length) {
    params.push(crops.map((c) => String(c).toLowerCase()));
    extra = ` AND lower(crop) = ANY($${params.length}::text[])`;
  }

  const result = await query(
    `SELECT crop, provider_commodity
       FROM commodity_provider_map
      WHERE provider = $1 AND active = TRUE ${extra}
      ORDER BY crop, provider_commodity`,
    params
  );

  const map = new Map();
  for (const row of result.rows) {
    const key = row.crop.toLowerCase();
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row.provider_commodity);
  }
  return map;
};

/**
 * Writes one canonical observation.
 *
 * The unique constraint is (market_id, crop, variety, observation_date, source),
 * so re-ingesting the same day corrects the row rather than duplicating it - and
 * a market's several varieties on one day are all preserved, because collapsing
 * them would invent a blended price nobody quoted.
 *
 * @param {object} input
 * @returns {Promise<'inserted'|'updated'>}
 */
const upsertObservation = async ({ marketId, crop, source, record }) => {
  const result = await query(
    `INSERT INTO market_prices
       (market_id, crop, variety, observation_date, min_price, max_price,
        modal_price, price_unit, source, fetched_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, COALESCE($10::timestamp, CURRENT_TIMESTAMP))
     ON CONFLICT (market_id, crop, variety, observation_date, source)
     DO UPDATE SET min_price = EXCLUDED.min_price,
                   max_price = EXCLUDED.max_price,
                   modal_price = EXCLUDED.modal_price,
                   price_unit = EXCLUDED.price_unit,
                   fetched_at = EXCLUDED.fetched_at
     RETURNING (xmax = 0) AS inserted`,
    [
      marketId,
      crop,
      record.variety || 'Other',
      record.observationDate,
      record.minPrice,
      record.maxPrice,
      record.modalPrice,
      record.priceUnit || 'INR_PER_QUINTAL',
      source,
      record.fetchedAt
    ]
  );

  return result.rows[0] && result.rows[0].inserted ? 'inserted' : 'updated';
};

/**
 * Opens an ingestion run row, so a partial or failed run leaves evidence.
 * @param {object} input
 * @returns {Promise<number>} run id
 */
const startRun = async ({ provider, state }) => {
  const result = await query(
    `INSERT INTO price_ingest_runs (provider, state) VALUES ($1, $2) RETURNING id`,
    [provider, state]
  );
  return result.rows[0].id;
};

/**
 * Closes an ingestion run row.
 * @param {number} runId
 * @param {object} summary
 */
const finishRun = async (runId, summary) => {
  await query(
    `UPDATE price_ingest_runs
        SET finished_at = CURRENT_TIMESTAMP,
            markets_attempted = $2, crops_attempted = $3, records_fetched = $4,
            rows_inserted = $5, rows_updated = $6, rows_skipped = $7,
            requests_made = $8, requests_failed = $9,
            status = $10, error_summary = $11
      WHERE id = $1`,
    [
      runId, summary.marketsAttempted, summary.cropsAttempted, summary.recordsFetched,
      summary.rowsInserted, summary.rowsUpdated, summary.rowsSkipped,
      summary.requestsMade, summary.requestsFailed, summary.status,
      summary.errors.length ? summary.errors.slice(0, 20).join(' | ') : null
    ]
  );
};

/**
 * Ingests prices for every mapped market × mapped crop.
 *
 * @param {object} [input]
 * @param {string} [input.state]
 * @param {Array<string>} [input.crops] - restrict to these crop keys
 * @param {Array<number>} [input.marketIds] - restrict to these markets
 * @param {boolean} [input.history] - pull full history instead of the latest day
 * @param {object} [input.provider] - injected provider (tests)
 * @returns {Promise<object>} summary
 */
const ingestPrices = async ({
  state = 'Maharashtra',
  crops = null,
  marketIds = null,
  history = true,
  provider = null
} = {}) => {
  const priceProvider = provider || getProvider();

  const summary = {
    provider: priceProvider.id,
    source: priceProvider.sourceLabel,
    state,
    mode: history ? 'HISTORY' : 'LATEST',
    marketsAttempted: 0,
    marketsWithData: 0,
    cropsAttempted: 0,
    recordsFetched: 0,
    rowsInserted: 0,
    rowsUpdated: 0,
    rowsSkipped: 0,
    requestsMade: 0,
    requestsFailed: 0,
    status: 'SUCCESS',
    errors: [],
    perMarket: []
  };

  const [markets, commodityMap] = await Promise.all([
    getMappedMarkets({ provider: priceProvider.id, state, marketIds }),
    getCommodityMap({ provider: priceProvider.id, crops })
  ]);

  summary.marketsAttempted = markets.length;
  summary.cropsAttempted = commodityMap.size;

  if (!markets.length) {
    // Not an error: a deployment with no verified mapping simply has nothing to
    // ingest, and saying so beats reporting a successful no-op.
    summary.status = 'FAILED';
    summary.errors.push(
      `No ${priceProvider.id} market mappings with match_type in ` +
      `(${TRUSTED_MATCH_TYPES.join(', ')}). Run: npm run map:markets`
    );
    return summary;
  }

  if (!commodityMap.size) {
    summary.status = 'FAILED';
    summary.errors.push(
      `No ${priceProvider.id} commodity mappings. Run: npm run map:markets`
    );
    return summary;
  }

  const runId = await startRun({ provider: priceProvider.id, state });

  let rateLimitHit = false;

  for (const market of markets) {
    if (rateLimitHit) break;

    const marketSummary = {
      marketCode: market.market_code,
      marketName: market.market_name,
      providerMarket: market.provider_market,
      records: 0,
      inserted: 0,
      updated: 0,
      crops: [],
      failures: []
    };

    for (const [crop, commodities] of commodityMap.entries()) {
      if (rateLimitHit) break;
      for (const commodity of commodities) {
        summary.requestsMade += 1;

        let records;
        try {
          records = history
            ? await priceProvider.getPriceHistory({
              state: market.provider_state, commodity, market: market.provider_market
            })
            : await priceProvider.getPrices({
              state: market.provider_state, commodity, market: market.provider_market
            });
        } catch (error) {
          summary.requestsFailed += 1;
          const message = `${market.market_code}/${commodity}: ${error.code || 'ERROR'} ${error.message}`;
          marketSummary.failures.push(message);
          summary.errors.push(message);

          // Rate limiting ends the pass. Continuing would issue dozens more
          // requests that are certain to fail, spend the next window's budget, and
          // fill the error log with noise that hides the one real cause.
          if (error.rateLimited || error.code === 'PROVIDER_RATE_LIMITED') {
            summary.rateLimited = true;
            summary.retryAfterSeconds = error.retryAfterSeconds || null;
            rateLimitHit = true;
            break;
          }
          continue;
        }

        if (!records.length) continue;

        for (const record of records) {
          summary.recordsFetched += 1;
          marketSummary.records += 1;

          // The upstream market filter is a PARTIAL match, so a query for one
          // market can return rows for another. Compared on the boilerplate-
          // stripped form: "Chandrapur(Ganjwad) " and "Chandrapur(Ganjwad) APMC"
          // are one mandi spelled twice and must both be kept, while "APMC Hingna"
          // returned for a Nagpur query must be rejected rather than attributed.
          if (record.providerMarket && !namesMatch(record.providerMarket, market.provider_market)) {
            summary.rowsSkipped += 1;
            marketSummary.skippedOtherMarket = (marketSummary.skippedOtherMarket || 0) + 1;
            continue;
          }

          try {
            const outcome = await upsertObservation({
              marketId: market.market_id,
              crop,
              source: priceProvider.sourceLabel,
              record
            });
            if (outcome === 'inserted') {
              summary.rowsInserted += 1;
              marketSummary.inserted += 1;
            } else {
              summary.rowsUpdated += 1;
              marketSummary.updated += 1;
            }
          } catch (error) {
            summary.rowsSkipped += 1;
            summary.errors.push(`${market.market_code}/${crop}: ${error.message}`);
          }
        }

        if (!marketSummary.crops.includes(crop)) marketSummary.crops.push(crop);
      }
    }

    if (marketSummary.records > 0) summary.marketsWithData += 1;
    summary.perMarket.push(marketSummary);
  }

  if (summary.rowsInserted + summary.rowsUpdated === 0) {
    summary.status = 'FAILED';
  } else if (summary.requestsFailed > 0 || rateLimitHit) {
    summary.status = 'PARTIAL';
  }

  if (rateLimitHit) {
    const caps = priceProvider.capabilities ? priceProvider.capabilities() : {};
    summary.errors.unshift(
      `Stopped early: ${priceProvider.id} rate limit reached`
      + (caps.rateLimitRequests
        ? ` (${caps.rateLimitRequests} requests / ${Math.round((caps.rateLimitWindowMs || 0) / 60000)} min per IP)`
        : '')
      + '. Re-run after the window to ingest the remaining markets.'
    );
  }

  summary.runId = runId;
  await finishRun(runId, summary);
  return summary;
};

/**
 * Coverage report: which of our markets this provider can actually price.
 *
 * Exists because "why is there no price for Wardha" must have an auditable
 * answer rather than an empty table.
 *
 * @param {object} [input]
 * @returns {Promise<object>}
 */
const getCoverage = async ({ provider = null, state = 'Maharashtra' } = {}) => {
  const providerId = provider || getProvider().id;

  const result = await query(
    `SELECT m.market_code, m.name, m.district,
            pm.provider_market, pm.match_type, pm.active AS mapping_active,
            (SELECT count(*) FROM market_prices mp
              WHERE mp.market_id = m.id AND mp.source = $2) AS provider_rows,
            (SELECT max(mp.observation_date) FROM market_prices mp
              WHERE mp.market_id = m.id AND mp.source = $2) AS latest_observation
       FROM markets m
       LEFT JOIN market_provider_map pm
         ON pm.market_id = m.id AND pm.provider = $1
      WHERE m.active = TRUE AND m.state = $3
      ORDER BY m.name`,
    [providerId, getProvider(providerId).sourceLabel, state]
  );

  const markets = result.rows.map((r) => ({
    marketCode: r.market_code,
    name: r.name,
    district: r.district,
    mapped: Boolean(r.provider_market),
    providerMarket: r.provider_market,
    matchType: r.match_type,
    ingestible: Boolean(r.provider_market) && TRUSTED_MATCH_TYPES.includes(r.match_type),
    providerRows: Number(r.provider_rows),
    latestObservation: r.latest_observation
      ? marketPriceService.toLocalDateString(r.latest_observation)
      : null
  }));

  const ingestible = markets.filter((m) => m.ingestible);
  const withData = markets.filter((m) => m.providerRows > 0);

  return {
    provider: providerId,
    state,
    totalMarkets: markets.length,
    mappedMarkets: markets.filter((m) => m.mapped).length,
    ingestibleMarkets: ingestible.length,
    marketsWithProviderData: withData.length,
    // Stated plainly: this is the fraction of our mandi grid this provider can
    // price at all, and it is the honest ceiling on the recommendation engine.
    coveragePercent: markets.length
      ? Math.round((ingestible.length / markets.length) * 1000) / 10
      : 0,
    unmapped: markets.filter((m) => !m.mapped).map((m) => m.name),
    markets
  };
};

module.exports = {
  ingestPrices,
  getCoverage,
  getMappedMarkets,
  getCommodityMap,
  upsertObservation,
  TRUSTED_MATCH_TYPES
};
