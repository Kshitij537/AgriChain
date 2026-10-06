/**
 * ============================================================================
 * DEMO / SEEDED DATA - NOT REAL GOVERNMENT OBSERVATIONS
 * ============================================================================
 * Generates a synthetic daily price history so the price model, the
 * recommendation engine and the end-to-end demo can be built and tested before
 * real provider observations are available for a market.
 *
 * Every row written by this script carries source = 'DEMO_SEED'. Nothing in the
 * system may present a DEMO_SEED row as a government observation:
 *   - the API reports source and freshness on every price
 *   - any model trained on this data is versioned '...-demo'
 *
 * Delete demo rows once real data is flowing:
 *   DELETE FROM market_prices WHERE source = 'DEMO_SEED';
 *
 * The generator is deterministic (fixed seed) so results are reproducible.
 *
 * Usage:  npm run seed:demo-prices -- [days]
 * ============================================================================
 */

require('dotenv').config();
const { pool, query } = require('../config/db');

const SOURCE = 'DEMO_SEED';
const DEFAULT_DAYS = 270;

/**
 * Per-crop price behaviour, in rupees per quintal.
 *
 * These are plausible Vidarbha ranges chosen to exercise the model, not
 * measurements. `seasonalAmplitude` drives an annual cycle; `volatility` sets
 * day-to-day noise; perishable crops swing harder than grains, which is the
 * one real-world property the generator deliberately reproduces.
 */
const CROP_BEHAVIOUR = {
  tomato:  { basePrice: 2600, seasonalAmplitude: 900, volatility: 0.055, trendPerYear:  120 },
  onion:   { basePrice: 2200, seasonalAmplitude: 700, volatility: 0.040, trendPerYear:  180 },
  potato:  { basePrice: 1800, seasonalAmplitude: 420, volatility: 0.030, trendPerYear:   90 },
  chilli:  { basePrice: 6800, seasonalAmplitude: 1400, volatility: 0.045, trendPerYear:  250 },
  spinach: { basePrice: 1500, seasonalAmplitude: 500, volatility: 0.070, trendPerYear:   60 }
};

/**
 * Deterministic pseudo-random generator (mulberry32) so a rebuild of the demo
 * dataset produces identical numbers.
 * @param {number} seed
 * @returns {Function} () => float in [0, 1)
 */
const makeRng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Stable per-market price basis: a large terminal market such as Nagpur pays
 * a little more than a small rural yard, and that gap persists over time.
 * @param {string} marketCode
 * @returns {number} multiplier around 1.0
 */
const marketBasis = (marketCode) => {
  const rng = makeRng(
    marketCode.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  );
  return 0.93 + rng() * 0.14;
};

/**
 * Generates one crop/market series ending today.
 * @param {object} args
 * @returns {Array} rows ready for insert
 */
const generateSeries = ({ marketId, marketCode, crop, days }) => {
  const behaviour = CROP_BEHAVIOUR[crop];
  const basis = marketBasis(`${marketCode}:${crop}`);
  const rng = makeRng(
    `${marketCode}:${crop}`.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 7)
  );

  const rows = [];
  // Mean-reverting walk: today's deviation decays toward zero, so the series
  // stays in a believable band instead of drifting off.
  let deviation = 0;

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - i);

    const dayOfYear = Math.floor(
      (date - Date.UTC(date.getUTCFullYear(), 0, 0)) / 86400000
    );
    const seasonal =
      behaviour.seasonalAmplitude * Math.sin((2 * Math.PI * dayOfYear) / 365);
    const trend = (behaviour.trendPerYear * (days - i)) / 365;

    // Gaussian-ish shock from two uniforms, then mean reversion.
    const shock = (rng() + rng() - 1) * behaviour.volatility;
    deviation = deviation * 0.82 + shock;

    const modal = Math.max(
      200,
      (behaviour.basePrice + seasonal + trend) * basis * (1 + deviation)
    );

    // Markets are closed on Sundays; no arrivals, no price observation.
    if (date.getUTCDay() === 0) continue;

    const spread = 0.08 + rng() * 0.07;
    rows.push({
      marketId,
      crop,
      variety: 'Local',
      observationDate: date.toISOString().slice(0, 10),
      minPrice: Math.round(modal * (1 - spread)),
      maxPrice: Math.round(modal * (1 + spread)),
      modalPrice: Math.round(modal),
      arrivalQuantity: Math.round(40 + rng() * 260)
    });
  }

  return rows;
};

const run = async (days = DEFAULT_DAYS) => {
  console.log('='.repeat(70));
  console.log('DEMO SEED - synthetic prices, NOT government observations');
  console.log('='.repeat(70));

  const marketsResult = await query(
    'SELECT id, market_code FROM markets WHERE active = TRUE ORDER BY id'
  );
  if (!marketsResult.rows.length) {
    throw new Error('No markets found. Run `npm run seed:market` first.');
  }

  const crops = Object.keys(CROP_BEHAVIOUR);
  let total = 0;

  for (const market of marketsResult.rows) {
    for (const crop of crops) {
      const rows = generateSeries({
        marketId: market.id,
        marketCode: market.market_code,
        crop,
        days
      });

      // Batched multi-row insert: one statement per crop/market series.
      const values = [];
      const params = [];
      rows.forEach((row, index) => {
        const o = index * 8;
        values.push(
          `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8}, 'INR_PER_QUINTAL', '${SOURCE}')`
        );
        params.push(
          row.marketId, row.crop, row.variety, row.observationDate,
          row.minPrice, row.maxPrice, row.modalPrice, row.arrivalQuantity
        );
      });

      if (!values.length) continue;

      await query(
        `INSERT INTO market_prices
           (market_id, crop, variety, observation_date, min_price, max_price,
            modal_price, arrival_quantity, price_unit, source)
         VALUES ${values.join(', ')}
         ON CONFLICT (market_id, crop, variety, observation_date, source)
         DO UPDATE SET modal_price = EXCLUDED.modal_price`,
        params
      );
      total += rows.length;
    }
    process.stdout.write(`  ${market.market_code} `);
  }

  console.log(`\n[Demo Seed] ✅ ${total} synthetic observations written (source='${SOURCE}')`);
  console.log(`[Demo Seed] ${crops.length} crops × ${marketsResult.rows.length} markets × ~${days} days`);
  console.log('[Demo Seed] Remove with: DELETE FROM market_prices WHERE source = \'DEMO_SEED\';');
};

if (require.main === module) {
  const days = parseInt(process.argv[2], 10) || DEFAULT_DAYS;
  run(days)
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Demo Seed] ❌ Failed:', err.message);
      pool.end().finally(() => process.exit(1));
    });
}

module.exports = { run, CROP_BEHAVIOUR, generateSeries };
