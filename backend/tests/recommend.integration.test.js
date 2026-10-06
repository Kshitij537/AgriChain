/**
 * End-to-end integration test for POST /api/market/recommend.
 *
 * Exercises the real Express app over real HTTP, through the whole pipeline:
 *
 *   request -> validation -> farm lookup + ownership -> candidate markets
 *   -> observed prices -> forecast -> routing -> freight -> weather
 *   -> spoilage -> net return -> ranking -> sell/wait -> response
 *
 * DETERMINISM
 * Every external dependency is neutralised so the assertions are stable and the
 * suite runs offline:
 *   routing  -> ROUTING_PROVIDER=none (deterministic haversine + detour factor)
 *   ML       -> weather/forecast stubbed at the module boundary
 *   weather  -> getCurrentWeather replaced with a fixed reading
 *   Gemini   -> never called by this endpoint
 *
 * PostgreSQL is NOT stubbed: the market schema, the seeded markets and the price
 * observations are the thing under test. The suite creates its own user, farm and
 * price rows, and removes them afterwards, so it neither depends on nor damages
 * existing data. If the database is unreachable the whole suite skips rather than
 * failing, so `npm test` still works on a machine without Postgres.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// --- Deterministic environment, set BEFORE the app is required --------------
process.env.ROUTING_PROVIDER = 'none';
process.env.MARKET_APPLY_SELLING_COSTS = 'false'; // isolate the core waterfall
process.env.MARKET_SEARCH_RADIUS_KM = '200';
process.env.MARKET_MAX_CANDIDATES = '8';
process.env.NDVI_DAILY_REFRESH_ENABLED = 'false';
process.env.PRICE_PREDICTION_ENABLED = 'false';   // overridden per-test where needed

require('dotenv').config();

const { pool, query } = require('../src/config/db');
const weatherService = require('../src/services/weatherService');
const pricePredictionService = require('../src/services/pricePredictionService');
const routingService = require('../src/services/routingService');

/**
 * Fixed ambient reading. Replacing the export works because marketService holds
 * the module object and resolves the property at call time.
 */
weatherService.getCurrentWeather = async () => ({
  temp: 32,
  humidity: 65,
  condition: 'Clear',
  description: 'Clear sky',
  windSpeed: 12,
  precipitation: 0,
  timestamp: new Date().toISOString()
});

const app = require('../src/app');

// --- Test fixtures ---------------------------------------------------------

/** Farm location: Hingna, Nagpur district. */
const FARM = { lat: 21.0046, lon: 79.0477 };

const TEST_USER_EMAIL = 'market-integration-test@agrichain.local';
const TEST_CROP = 'tomato';

const state = {
  available: false,
  server: null,
  baseUrl: null,
  userId: null,
  otherUserId: null,
  farmId: null,
  otherFarmId: null,
  marketIds: [],
  priceRowIds: []
};

/**
 * Markets planted for this suite, chosen to encode the product's central claim:
 * ZZ_FAR quotes the highest price but is far away, so it must LOSE to ZZ_NEAR.
 */
const TEST_MARKETS = [
  { code: 'zz_test_near', name: 'ZZ Test Near Mandi', district: 'ZZ Test', lat: 21.05, lon: 79.10, price: 3000 },
  { code: 'zz_test_mid', name: 'ZZ Test Mid Mandi', district: 'ZZ Test', lat: 21.30, lon: 79.40, price: 3100 },
  { code: 'zz_test_far', name: 'ZZ Test Far Mandi', district: 'ZZ Test', lat: 20.30, lon: 78.10, price: 3400 }
];

/**
 * Minimal HTTP client. Avoids adding supertest as a dependency for one suite.
 * @param {string} method
 * @param {string} path
 * @param {object|null} body
 * @param {object} [headers]
 * @returns {Promise<{status:number, body:object}>}
 */
const request = (method, path, body = null, headers = {}) =>
  new Promise((resolve, reject) => {
    const payload = body === null ? null : JSON.stringify(body);
    const req = http.request(
      `${state.baseUrl}${path}`,
      {
        method,
        headers: {
          ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
          ...headers
        }
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: raw ? JSON.parse(raw) : null });
          } catch (error) {
            reject(new Error(`Non-JSON response (${res.statusCode}): ${raw.slice(0, 200)}`));
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });

/** Creates the users, farms, markets and price observations this suite needs. */
const seedFixtures = async () => {
  const user = await query(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ('Market Integration Test', $1, 'not-a-real-hash')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [TEST_USER_EMAIL]
  );
  state.userId = user.rows[0].id;

  const otherUser = await query(
    `INSERT INTO users (full_name, email, password_hash)
     VALUES ('Market Integration Other', $1, 'not-a-real-hash')
     ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
     RETURNING id`,
    [`other-${TEST_USER_EMAIL}`]
  );
  state.otherUserId = otherUser.rows[0].id;

  const farm = await query(
    `INSERT INTO farms (user_id, name, location, latitude, longitude, area_hectares, crop_type)
     VALUES ($1, 'ZZ Integration Test Farm', 'Hingna', $2, $3, 1.5, 'Tomato')
     RETURNING id`,
    [state.userId, FARM.lat, FARM.lon]
  );
  state.farmId = farm.rows[0].id;

  // A farm belonging to someone else, for the authorisation test.
  const otherFarm = await query(
    `INSERT INTO farms (user_id, name, location, latitude, longitude, crop_type)
     VALUES ($1, 'ZZ Integration Other Farm', 'Hingna', $2, $3, 'Tomato')
     RETURNING id`,
    [state.otherUserId, FARM.lat, FARM.lon]
  );
  state.otherFarmId = otherFarm.rows[0].id;

  // A farm with no coordinates, for the missing-location test.
  const noCoords = await query(
    `INSERT INTO farms (user_id, name, crop_type) VALUES ($1, 'ZZ Integration No Coords', 'Tomato')
     RETURNING id`,
    [state.userId]
  );
  state.noCoordsFarmId = noCoords.rows[0].id;

  const today = new Date();
  const observationDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (const market of TEST_MARKETS) {
    const inserted = await query(
      `INSERT INTO markets (market_code, name, state, district, latitude, longitude,
                            coordinate_source, active)
       VALUES ($1, $2, 'ZZ Test State', $3, $4, $5, 'CITY_CENTROID', TRUE)
       ON CONFLICT (market_code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [market.code, market.name, market.district, market.lat, market.lon]
    );
    const marketId = inserted.rows[0].id;
    state.marketIds.push(marketId);

    const price = await query(
      `INSERT INTO market_prices
         (market_id, crop, variety, observation_date, min_price, max_price, modal_price,
          arrival_quantity, price_unit, source)
       VALUES ($1, $2, 'Integration', $3, $4, $5, $6, 100, 'INR_PER_QUINTAL', 'DEMO_SEED')
       ON CONFLICT (market_id, crop, variety, observation_date, source)
         DO UPDATE SET modal_price = EXCLUDED.modal_price
       RETURNING id`,
      [marketId, TEST_CROP, observationDate, market.price - 200, market.price + 200, market.price]
    );
    state.priceRowIds.push(price.rows[0].id);
  }

  // Keep the seeded Vidarbha markets out of this suite's ranking so the
  // assertions depend only on the fixtures above.
  await query(
    `UPDATE markets SET active = FALSE WHERE market_code NOT LIKE 'zz_test_%'`
  );
};

/** Removes everything seedFixtures created and restores the seeded markets. */
const cleanupFixtures = async () => {
  try {
    await query(`UPDATE markets SET active = TRUE WHERE market_code NOT LIKE 'zz_test_%'`);
    await query(`DELETE FROM market_recommendations WHERE farm_id = ANY($1::int[])`,
      [[state.farmId, state.otherFarmId, state.noCoordsFarmId].filter(Boolean)]);
    await query(`DELETE FROM price_predictions WHERE market_id = ANY($1::int[])`, [state.marketIds]);
    await query(`DELETE FROM market_prices WHERE market_id = ANY($1::int[])`, [state.marketIds]);
    await query(`DELETE FROM markets WHERE market_code LIKE 'zz_test_%'`);
    await query(`DELETE FROM farms WHERE user_id = ANY($1::int[])`,
      [[state.userId, state.otherUserId].filter(Boolean)]);
    await query(`DELETE FROM users WHERE email IN ($1, $2)`,
      [TEST_USER_EMAIL, `other-${TEST_USER_EMAIL}`]);
  } catch (error) {
    console.warn(`[Integration] Cleanup warning: ${error.message}`);
  }
};

test.before(async () => {
  try {
    await query('SELECT 1 FROM markets LIMIT 1');
    await seedFixtures();
    state.available = true;
  } catch (error) {
    console.warn(
      `\n[Integration] SKIPPING: database not available (${error.message}).\n` +
      '  Start PostgreSQL and run `npm run seed:market` to enable these tests.\n'
    );
    return;
  }

  await new Promise((resolve) => {
    state.server = app.listen(0, '127.0.0.1', () => {
      state.baseUrl = `http://127.0.0.1:${state.server.address().port}`;
      resolve();
    });
  });
});

test.after(async () => {
  if (state.server) await new Promise((resolve) => state.server.close(resolve));
  if (state.available) await cleanupFixtures();
  routingService.clearRouteCache();
  await pool.end().catch(() => {});
});

/** Standard request body for the happy path. */
const recommendBody = (overrides = {}) => ({
  crop: TEST_CROP,
  quantityKg: 500,
  farmId: state.farmId,
  userId: state.userId,
  harvestDate: new Date().toISOString().slice(0, 10),
  ...overrides
});

// ---------------------------------------------------------------------------
// The happy path
// ---------------------------------------------------------------------------

test('integration: the full pipeline returns a complete recommendation', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('POST', '/api/market/recommend', recommendBody());

  assert.equal(status, 200, JSON.stringify(body));
  assert.equal(body.success, true);

  const data = body.data;

  // --- the request is echoed back, resolved ---
  assert.equal(data.request.crop, 'tomato');
  assert.equal(data.request.quantityKg, 500);
  assert.equal(data.request.farm.id, state.farmId);
  assert.equal(data.request.farm.latitude, FARM.lat);

  // --- a winner exists and is fully described ---
  const rec = data.recommendation;
  assert.ok(rec.marketId, 'a market must be chosen');
  assert.ok(rec.marketName);
  assert.ok(rec.currentPrice > 0);
  assert.ok(Number.isFinite(rec.expectedMoney));
  assert.ok(rec.distanceKm > 0);
  assert.ok(rec.travelTimeMinutes > 0);
  assert.ok(rec.transportCost > 0);
  assert.ok(['low', 'moderate', 'high'].includes(rec.spoilageRisk));
  assert.ok(['SELL_NOW', 'SELL_SOON', 'WAIT'].includes(rec.decision));
  assert.ok(rec.recommendedSellingWindow);
  assert.ok(rec.reason && rec.reason.length > 30, 'the choice must be explained');

  // --- every candidate is reported ---
  assert.ok(Array.isArray(data.markets));
  assert.equal(data.markets.length, TEST_MARKETS.length);

  // --- provenance is attached ---
  assert.equal(data.dataQuality.containsDemoData, true);
  assert.deepEqual(data.dataQuality.priceSources, ['DEMO_SEED']);
  assert.equal(data.dataQuality.spoilageEngine, 'RULE_BASED_BASELINE');
  assert.equal(data.dataQuality.netReturnEngineVersion, 'net_return_v1');
  assert.equal(data.engineVersion, 'market_recommend_v1');
  assert.ok(data.generatedAt);
});

test('integration: THE CORE CLAIM - the highest-price mandi does not win', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { body } = await request('POST', '/api/market/recommend', recommendBody());
  const markets = body.data.markets.filter((m) => m.evaluated);

  const highestPrice = markets.reduce((best, m) => (m.currentPrice > best.currentPrice ? m : best));
  assert.equal(highestPrice.currentPrice, 3400, 'precondition: ZZ Test Far quotes the most');

  assert.notEqual(
    body.data.recommendation.marketId,
    highestPrice.marketId,
    'the far, highest-priced mandi must not be recommended'
  );
  assert.equal(body.data.recommendation.marketName, 'ZZ Test Near Mandi');
  assert.equal(highestPrice.isHighestPriceButNotBest, true);

  // And the explanation must actually name that trade-off.
  assert.match(body.data.recommendation.reason, /ZZ Test Far Mandi/);
  assert.match(body.data.recommendation.reason, /freight/i);
});

test('integration: markets are ordered by expected money, descending', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { body } = await request('POST', '/api/market/recommend', recommendBody());
  const evaluated = body.data.markets.filter((m) => m.evaluated);

  for (let i = 1; i < evaluated.length; i += 1) {
    assert.ok(
      evaluated[i - 1].expectedMoney >= evaluated[i].expectedMoney,
      `rank ${i + 1} out-earns rank ${i}`
    );
    assert.equal(evaluated[i].rank, i + 1);
  }
  assert.equal(evaluated[0].recommended, true);
  assert.equal(evaluated[0].deltaVsBest, 0);
});

test('integration: each market row reconciles to its own expected money', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // The response a farmer sees must add up. Selling costs are disabled for this
  // suite, so the waterfall is gross - spoilage - freight exactly.
  const { body } = await request('POST', '/api/market/recommend', recommendBody());

  for (const market of body.data.markets.filter((m) => m.evaluated)) {
    const expected =
      market.grossSaleValue - market.estimatedLossValue - market.transportCost - market.otherCosts;
    assert.ok(
      Math.abs(expected - market.expectedMoney) <= 2,
      `${market.marketName}: ${market.grossSaleValue} - ${market.estimatedLossValue} - ` +
      `${market.transportCost} - ${market.otherCosts} = ${expected}, but expectedMoney is ${market.expectedMoney}`
    );
    assert.ok(
      Math.abs(market.estimatedLossKg + market.saleableQuantityKg - 500) < 0.5,
      'loss plus saleable must equal the load'
    );
  }
});

test('integration: the recommendation is persisted as an audit trail', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { body } = await request('POST', '/api/market/recommend', recommendBody());
  assert.ok(body.data.recommendationId, 'a recommendation id must be returned');

  const stored = await query(
    `SELECT crop, quantity_kg, expected_money, decision, engine_version, response_payload
     FROM market_recommendations WHERE id = $1`,
    [body.data.recommendationId]
  );
  assert.equal(stored.rows.length, 1);
  const row = stored.rows[0];
  assert.equal(row.crop, 'tomato');
  assert.equal(Number(row.quantity_kg), 500);
  assert.equal(Number(row.expected_money), body.data.recommendation.expectedMoney);
  assert.equal(row.decision, body.data.recommendation.decision);
  assert.equal(row.engine_version, 'market_recommend_v1');
  assert.ok(row.response_payload, 'the full response must be recoverable');
});

test('integration: history returns the stored recommendation', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  await request('POST', '/api/market/recommend', recommendBody());
  const { status, body } = await request(
    'GET', `/api/market/history/${state.farmId}?userId=${state.userId}`
  );

  assert.equal(status, 200);
  assert.ok(body.data.length >= 1);
  assert.equal(body.data[0].crop, 'tomato');
  assert.ok(body.data[0].marketName);
});

// ---------------------------------------------------------------------------
// Degradation
// ---------------------------------------------------------------------------

test('integration: routing failure degrades to a LABELLED estimate, not a lie', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // ROUTING_PROVIDER=none is set for the whole suite, so this is the degraded path.
  const { status, body } = await request('POST', '/api/market/recommend', recommendBody());

  assert.equal(status, 200, 'a routing outage must not fail the recommendation');
  assert.equal(body.data.dataQuality.routingDegraded, true);

  for (const market of body.data.markets.filter((m) => m.evaluated)) {
    assert.equal(market.routeMethod, 'STRAIGHT_LINE_ESTIMATE');
    assert.equal(market.isRoadRoute, false, 'an estimate must never claim to be a road route');
    assert.ok(market.routeDegradedReason, 'the reason must be stated');
  }

  assert.ok(
    body.data.recommendation.confidenceFactors.some((f) => /straight-line/i.test(f)),
    'the farmer must be told the distance is an estimate'
  );
});

test('integration: no price forecast still yields a recommendation', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // PRICE_PREDICTION_ENABLED=false for this suite.
  //
  // Cold storage is requested deliberately: a same-day tomato in the open has
  // zero safe days left, and the spoilage constraint correctly short-circuits the
  // decision before the forecast is even consulted. To isolate the no-forecast
  // branch the crop has to be able to wait in the first place.
  const { status, body } = await request(
    'POST', '/api/market/recommend', recommendBody({ storageType: 'cold' })
  );

  assert.equal(status, 200, 'an ML outage must not fail the recommendation');
  assert.equal(body.data.dataQuality.pricePredictionAvailable, false);
  assert.equal(body.data.recommendation.predictedPrice, null, 'no price may be invented');
  assert.equal(body.data.dataQuality.priceModelVersion, null);

  // With no forecast there is no evidence for waiting.
  assert.notEqual(body.data.recommendation.decision, 'WAIT');
  assert.equal(body.data.timing.basis, 'NO_FORECAST');
  assert.equal(body.data.timing.priceForecastAvailable, false);
  assert.ok(
    body.data.recommendation.confidenceFactors.some((f) => /forecast/i.test(f)),
    'the missing forecast must be disclosed'
  );
});

test('integration: a perishable crop out of safe days overrides the forecast', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // The inverse of the test above: spoilage must decide regardless of any forecast.
  //
  // The harvest is dated two days back deliberately. A SAME-day harvest sits on
  // the safe-days boundary, because daysSinceHarvest is a fraction that grows
  // through the day - so that fixture passed in the afternoon and failed in the
  // morning. Two days puts a tomato in open storage decisively out of its window
  // whatever the clock says.
  const harvestDate = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
  const { body } = await request(
    'POST', '/api/market/recommend', recommendBody({ storageType: 'open', harvestDate })
  );

  assert.equal(body.data.timing.basis, 'SPOILAGE_CONSTRAINT');
  assert.equal(body.data.recommendation.decision, 'SELL_NOW');
  assert.equal(body.data.timing.holdComparison, null, 'there is nothing to compare: it cannot wait');
  assert.ok(
    body.data.markets.find((m) => m.recommended).safeDays < 1,
    'precondition: the load really is out of safe days'
  );
});

test('integration: weather failure falls back without fabricating a reading', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const original = weatherService.getCurrentWeather;
  weatherService.getCurrentWeather = async () => {
    throw new Error('simulated weather outage');
  };

  try {
    const { status, body } = await request('POST', '/api/market/recommend', recommendBody());
    assert.equal(status, 200, 'a weather outage must not fail the recommendation');
    assert.equal(body.data.dataQuality.weatherAvailable, false);
    assert.equal(body.data.conditions.available, false);
    assert.equal(body.data.conditions.reason, 'WEATHER_API_FAILED');
    assert.equal(body.data.conditions.temperatureC, undefined, 'no temperature may be invented');
    assert.ok(
      body.data.recommendation.confidenceFactors.some((f) => /weather/i.test(f)),
      'the missing weather must be disclosed'
    );
  } finally {
    weatherService.getCurrentWeather = original;
  }
});

test('integration: a forecast, when available, is surfaced with its model version', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  // Stub the prediction client rather than requiring a running ML service.
  const original = pricePredictionService.predictPricesForMarkets;
  pricePredictionService.predictPricesForMarkets = async (crop, marketIds) => {
    const results = new Map();
    for (const marketId of marketIds) {
      results.set(marketId, {
        available: true,
        crop,
        marketId,
        currentPrice: 3000,
        predictedPrice: 3060,
        predictedChange: 60,
        horizonDays: 1,
        targetDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        modelVersion: 'price_xgb_v1_h1-test',
        confidence: 'medium',
        providesPredictionIntervals: false,
        engine: 'ML_MODEL'
      });
    }
    return results;
  };

  try {
    // Cold storage again, so the timing engine reaches the compare-both-branches
    // path rather than short-circuiting on spoilage.
    const { body } = await request(
      'POST', '/api/market/recommend', recommendBody({ storageType: 'cold' })
    );

    assert.equal(body.data.dataQuality.pricePredictionAvailable, true);
    assert.equal(body.data.dataQuality.priceModelVersion, 'price_xgb_v1_h1-test');
    assert.equal(body.data.recommendation.predictedPrice, 3060);

    const winner = body.data.markets.find((m) => m.recommended);
    assert.equal(winner.predictionModelVersion, 'price_xgb_v1_h1-test');
    assert.equal(winner.predictionConfidence, 'medium');

    // Timing now has evidence to reason about, and shows both branches.
    assert.ok(body.data.timing.holdComparison, 'the hold comparison must be present');
    assert.equal(body.data.timing.holdComparison.comparisonBasis, 'BOTH_BRANCHES_REPRICED');
  } finally {
    pricePredictionService.predictPricesForMarkets = original;
  }
});

// ---------------------------------------------------------------------------
// Breakeven
// ---------------------------------------------------------------------------

test('integration: production cost produces breakeven and profit', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { body } = await request(
    'POST', '/api/market/recommend', recommendBody({ productionCost: 8000 })
  );

  const breakeven = body.data.breakeven;
  assert.equal(breakeven.available, true);
  assert.equal(breakeven.productionCostAvailable, true);
  assert.equal(breakeven.breakEvenPricePerKg, 16); // 8000 / 500
  assert.equal(
    breakeven.expectedProfit,
    body.data.recommendation.expectedMoney - 8000
  );
});

test('integration: no production cost means no invented profit', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { body } = await request('POST', '/api/market/recommend', recommendBody());

  assert.equal(body.data.breakeven.available, false);
  assert.equal(body.data.breakeven.productionCostAvailable, false);
  assert.equal(body.data.breakeven.reason, 'PRODUCTION_COST_MISSING');
  assert.equal(body.data.breakeven.expectedProfit, undefined);
});

// ---------------------------------------------------------------------------
// Errors and authorisation
// ---------------------------------------------------------------------------

test('integration: validation errors are reported together with codes', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('POST', '/api/market/recommend', {
    quantityKg: -5, harvestDate: 'nope'
  });

  assert.equal(status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_FAILED');
  const codes = body.error.fields.map((f) => f.code);
  assert.ok(codes.includes('QUANTITY_NEGATIVE'));
  assert.ok(codes.includes('CROP_REQUIRED'));
  assert.ok(codes.includes('HARVEST_DATE_INVALID'));
});

test('integration: zero and negative quantity are refused', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  for (const [quantityKg, code] of [[0, 'QUANTITY_ZERO'], [-100, 'QUANTITY_NEGATIVE']]) {
    const { status, body } = await request('POST', '/api/market/recommend', recommendBody({ quantityKg }));
    assert.equal(status, 400);
    assert.equal(body.error.fields[0].code, code);
  }
});

test('integration: a crop with no price data answers honestly, never a fabricated one', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('POST', '/api/market/recommend', recommendBody({ crop: 'wheat' }));

  // Deliberately a 200, not a 4xx: "no mandi is quoting wheat" is an answer, and
  // the farmer still has the direct-buyer channel to fall back on. What must never
  // happen is a number appearing where there is no price behind it.
  assert.equal(status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.recommendation, null, 'no mandi may be recommended without a price');
  assert.deepEqual(body.data.markets, [], 'no mandi rows may be invented');
  assert.equal(body.data.dataQuality.mandiDataAvailable, false);
  assert.equal(body.data.dataQuality.containsDemoData, false);
  assert.match(body.data.warning, /wheat/, 'the farmer must be told which crop has no rates');

  // The shape must stay identical to a successful answer, otherwise consumers
  // (the audit writer, the frontend) break on the fields they always read.
  assert.equal(body.data.request.crop, 'wheat');
  assert.ok(body.data.engineVersion, 'engineVersion is part of every answer');
  assert.ok(body.data.request.farm.latitude, 'the echoed request must still resolve the farm');
});

test('integration: a farm with no coordinates returns a clear 422', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request(
    'POST', '/api/market/recommend', recommendBody({ farmId: state.noCoordsFarmId })
  );

  assert.equal(status, 422);
  assert.equal(body.error.code, 'MISSING_FARM_COORDINATES');
  assert.match(body.error.message, /location|boundary/i, 'the message must say how to fix it');
});

test('integration: a non-existent farm returns 404', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('POST', '/api/market/recommend', recommendBody({ farmId: 999999 }));
  assert.equal(status, 404);
  assert.equal(body.error.code, 'FARM_NOT_FOUND');
});

test('integration: another farmer\'s field cannot be used', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request(
    'POST', '/api/market/recommend', recommendBody({ farmId: state.otherFarmId })
  );

  assert.equal(status, 403);
  assert.equal(body.error.code, 'FARM_FORBIDDEN');
});

test('integration: a forged token is rejected outright', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request(
    'POST', '/api/market/recommend', recommendBody(), { Authorization: 'Bearer not.a.real.token' }
  );

  assert.equal(status, 403);
  assert.equal(body.error.code, 'AUTH_INVALID');
});

test('integration: every response carries a request id for log correlation', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const ok = await request('POST', '/api/market/recommend', recommendBody());
  assert.ok(ok.body.data.requestId, 'a success must be traceable');

  const bad = await request('POST', '/api/market/recommend', { crop: 'tomato' });
  assert.ok(bad.body.error.requestId, 'a failure must be traceable');
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

test('integration: identical requests produce identical rupee figures', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const first = await request('POST', '/api/market/recommend', recommendBody());
  const second = await request('POST', '/api/market/recommend', recommendBody());

  assert.equal(
    first.body.data.recommendation.expectedMoney,
    second.body.data.recommendation.expectedMoney,
    'the same question must get the same answer'
  );
  assert.equal(
    first.body.data.recommendation.marketId,
    second.body.data.recommendation.marketId
  );
  assert.deepEqual(
    first.body.data.markets.filter((m) => m.evaluated).map((m) => m.expectedMoney),
    second.body.data.markets.filter((m) => m.evaluated).map((m) => m.expectedMoney)
  );
});

test('integration: a larger load earns more money and costs less freight per kg', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const small = await request('POST', '/api/market/recommend', recommendBody({ quantityKg: 200 }));
  const large = await request('POST', '/api/market/recommend', recommendBody({ quantityKg: 900 }));

  assert.ok(
    large.body.data.recommendation.expectedMoney > small.body.data.recommendation.expectedMoney,
    'more produce must mean more money'
  );

  const smallWinner = small.body.data.markets.find((m) => m.recommended);
  const largeWinner = large.body.data.markets.find((m) => m.recommended);
  assert.ok(
    largeWinner.transportCost / 900 < smallWinner.transportCost / 200,
    'freight per kg must fall as the load grows'
  );
});

// ---------------------------------------------------------------------------
// Supporting endpoints
// ---------------------------------------------------------------------------

test('integration: GET /api/market/prices reports provenance on every row', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request(
    'GET', `/api/market/prices?crop=tomato&lat=${FARM.lat}&lon=${FARM.lon}`
  );

  assert.equal(status, 200);
  assert.ok(body.data.length > 0);
  assert.equal(body.meta.containsDemoData, true);
  assert.equal(body.meta.distanceBasis, 'STRAIGHT_LINE');

  for (const row of body.data) {
    assert.ok(row.source, 'every price must state its source');
    assert.ok(row.observationDate, 'every price must state when it was observed');
    assert.ok(['FRESH', 'RECENT', 'STALE', 'EXPIRED'].includes(row.freshness));
    assert.equal(row.isDemoData, true);
  }

  // Distance-ordered when coordinates are given.
  const distances = body.data.map((r) => r.straightLineKm);
  for (let i = 1; i < distances.length; i += 1) {
    assert.ok(distances[i] >= distances[i - 1], `not distance-ordered: ${distances}`);
  }
});

test('integration: GET /api/market/health reports data provenance honestly', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('GET', '/api/market/health');

  assert.equal(status, 200);

  const provenance = body.data.dataProvenance;
  // Provider-agnostic now: "is any of this real" no longer means "is it AGMARKNET".
  assert.equal(typeof provenance.hasRealProviderData, 'boolean');
  assert.ok(Array.isArray(provenance.realSources));
  assert.ok(provenance.realSources.includes('MANDI_API'));

  // A deployment with no real observations must say so; one with them must not
  // carry a warning claiming otherwise.
  if (provenance.hasRealProviderData) {
    assert.equal(provenance.warning, null);
  } else {
    assert.ok(provenance.warning, 'a demo-only deployment must warn about it');
  }

  // The price provider identifies itself, states that it needs no key, and reports
  // how much of our mandi grid it can actually price.
  const provider = body.data.priceProvider;
  assert.equal(provider.provider, 'mandi_api');
  assert.equal(provider.requiresApiKey, false, 'the provider must be keyless');
  assert.ok(provider.coverage, 'coverage must be reported, not left to be guessed');
  assert.equal(typeof provider.coverage.ingestibleMarkets, 'number');
  assert.ok(provider.coverage.totalMarkets >= provider.coverage.ingestibleMarkets);

  assert.equal(body.data.engines.spoilage.isMachineLearning, false);
  assert.equal(body.data.engines.spoilage.engine, 'RULE_BASED_BASELINE');
  assert.equal(body.data.engines.transport.engine, 'DETERMINISTIC_CONFIG');
});

test('integration: GET /api/crops marks which crops can be recommended', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('GET', '/api/crops');

  assert.equal(status, 200);
  const tomato = body.data.find((c) => c.crop === 'tomato');
  assert.ok(tomato, 'tomato must be listed');
  assert.equal(tomato.hasMarketPriceData, true);
  assert.ok(tomato.shelfLifeDays > 0);
  assert.ok(tomato.perishability);
});

test('integration: GET /api/market/channels never invents a rupee figure', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('GET', '/api/market/channels?crop=tomato&quantityKg=500');

  assert.equal(status, 200);
  for (const channel of body.data) {
    if (channel.dataAvailable) continue;
    assert.equal(
      channel.netReturn, null,
      `${channel.id} has no price feed, so it must not quote a return`
    );
    assert.ok(channel.unavailableReason, 'the absence must be explained');
  }
});

test('integration: POST /api/spoilage/predict declares its rule-based engine', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const { status, body } = await request('POST', '/api/spoilage/predict', {
    crop: 'tomato',
    quantityKg: 500,
    harvestDate: new Date().toISOString().slice(0, 10),
    distanceKm: 80,
    temperatureC: 33,
    humidity: 68,
    pricePerQuintal: 3000
  });

  assert.equal(status, 200);
  assert.equal(body.data.engine, 'RULE_BASED_BASELINE');
  assert.equal(body.data.isMachineLearning, false);
  assert.equal(body.data.modelVersion, 'spoilage_baseline_v1');
  assert.ok(body.data.estimatedLossPercent >= 0);
  assert.ok(body.data.estimatedLossValue > 0, 'a supplied price must value the loss');
  assert.ok(Array.isArray(body.data.factors) && body.data.factors.length > 0);
});

test('integration: existing endpoints still work (no regression)', async (t) => {
  if (!state.available) return t.skip('database unavailable');

  const health = await request('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'Server is running');

  const spoilageHealth = await request('GET', '/api/spoilage/health');
  assert.equal(spoilageHealth.status, 200);

  const spoilageOptions = await request('GET', '/api/spoilage/options');
  assert.equal(spoilageOptions.status, 200);
  assert.ok(spoilageOptions.body.data.crops.length > 0);

  const farms = await request('GET', `/api/farms/user?userId=${state.userId}`);
  assert.equal(farms.status, 200);
  assert.equal(farms.body.success, true);
});
