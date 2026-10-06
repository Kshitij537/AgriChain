/**
 * Sell-now vs wait tests.
 *
 * The decision must be defensible in both directions: never advise holding a crop
 * that cannot survive the wait, and never advise holding on a forecast gain too
 * small to be worth the risk.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const sellTiming = require('../src/services/sellTimingService');

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

/** A market row as marketService would produce it. */
const market = (overrides = {}) => ({
  marketId: 1,
  marketName: 'Nagpur APMC',
  expectedMoney: 12500,
  transportCost: 900,
  distanceKm: 35,
  travelTimeMinutes: 60,
  spoilageRisk: 'low',
  estimatedLossPercent: 3,
  estimatedLossValue: 450,
  safeDays: 4,
  ...overrides
});

/** An available forecast. */
const prediction = (overrides = {}) => ({
  available: true,
  currentPrice: 3000,
  predictedPrice: 3120,
  predictedChange: 120,
  horizonDays: 1,
  modelVersion: 'price_xgb_v1_h1-demo',
  confidence: 'medium',
  ...overrides
});

const spoilageInput = (overrides = {}) => ({
  cropType: 'tomato',
  quantityKg: 500,
  harvestDate: daysAgo(0),
  storageType: 'open',
  temperatureC: 30,
  humidity: 70,
  ...overrides
});

test('timing: high spoilage risk forces SELL_NOW regardless of the forecast', () => {
  // Even a strongly rising forecast must not outvote a crop about to rot.
  const result = sellTiming.decideSellTiming({
    market: market({ spoilageRisk: 'high', safeDays: 0 }),
    prediction: prediction({ predictedPrice: 4000, predictedChange: 1000 }),
    spoilageInput: spoilageInput(),
    quantityKg: 500
  });
  assert.equal(result.decision, 'SELL_NOW');
  assert.equal(result.basis, 'SPOILAGE_CONSTRAINT');
  assert.equal(result.recommendedWindow, 'Today');
});

test('timing: zero safe days forces SELL_NOW', () => {
  const result = sellTiming.decideSellTiming({
    market: market({ spoilageRisk: 'moderate', safeDays: 0 }),
    prediction: prediction(),
    spoilageInput: spoilageInput(),
    quantityKg: 500
  });
  assert.equal(result.decision, 'SELL_NOW');
});

test('timing: waiting is never advised without a forecast', () => {
  // The brief's rule: no unsupported financial advice. With no model output there
  // is no evidence for holding, so the answer cannot be WAIT.
  const result = sellTiming.decideSellTiming({
    market: market(),
    prediction: { available: false, reason: 'ML_SERVICE_UNAVAILABLE' },
    spoilageInput: spoilageInput(),
    quantityKg: 500
  });
  assert.equal(result.decision, 'SELL_SOON');
  assert.equal(result.basis, 'NO_FORECAST');
  assert.equal(result.priceForecastAvailable, false);
  assert.equal(result.unavailableReason, 'ML_SERVICE_UNAVAILABLE');
});

test('timing: a null prediction object is handled like an absent forecast', () => {
  const result = sellTiming.decideSellTiming({
    market: market(), prediction: null, spoilageInput: spoilageInput(), quantityKg: 500
  });
  assert.equal(result.decision, 'SELL_SOON');
  assert.equal(result.basis, 'NO_FORECAST');
});

test('timing: a falling forecast never produces WAIT', () => {
  const result = sellTiming.decideSellTiming({
    market: market(),
    prediction: prediction({ predictedPrice: 2850, predictedChange: -150 }),
    spoilageInput: spoilageInput(),
    quantityKg: 500
  });
  assert.notEqual(result.decision, 'WAIT');
  assert.ok(result.holdComparison.netGainFromWaiting <= 0);
});

test('timing: a large gain on a sturdy crop with time in hand can justify WAIT', () => {
  // Onion: low perishability, so a few days of holding costs little.
  const result = sellTiming.decideSellTiming({
    market: market({ spoilageRisk: 'low', safeDays: 30, estimatedLossPercent: 0.5, estimatedLossValue: 60 }),
    prediction: prediction({ currentPrice: 2000, predictedPrice: 2400, predictedChange: 400 }),
    spoilageInput: spoilageInput({ cropType: 'onion', harvestDate: daysAgo(0) }),
    quantityKg: 500
  });
  assert.equal(result.decision, 'WAIT');
  assert.equal(result.basis, 'FORECAST_EXCEEDS_SPOILAGE');
  assert.ok(result.holdComparison.netGainFromWaiting > 0);
});

test('timing: a trivial gain is refused even when holding is safe', () => {
  // A ₹2/quintal rise on 500 kg is ₹10 - noise, not a reason to hold produce.
  const result = sellTiming.decideSellTiming({
    market: market({ spoilageRisk: 'low', safeDays: 30, estimatedLossPercent: 0.2, estimatedLossValue: 20 }),
    prediction: prediction({ currentPrice: 2000, predictedPrice: 2002, predictedChange: 2 }),
    spoilageInput: spoilageInput({ cropType: 'onion' }),
    quantityKg: 500
  });
  assert.equal(result.decision, 'SELL_SOON');
  assert.equal(result.basis, 'GAIN_BELOW_THRESHOLD');
});

test('timing: not enough safe days to reach the forecast horizon blocks WAIT', () => {
  const result = sellTiming.decideSellTiming({
    market: market({ spoilageRisk: 'moderate', safeDays: 1 }),
    prediction: prediction({ horizonDays: 3, currentPrice: 2000, predictedPrice: 2500 }),
    spoilageInput: spoilageInput({ cropType: 'tomato', harvestDate: daysAgo(1) }),
    quantityKg: 500
  });
  assert.notEqual(result.decision, 'WAIT');
  assert.equal(result.basis, 'SPOILAGE_CONSTRAINT');
});

test('timing: the hold comparison exposes both branches in rupees', () => {
  const result = sellTiming.decideSellTiming({
    market: market(), prediction: prediction(), spoilageInput: spoilageInput(), quantityKg: 500
  });
  const c = result.holdComparison;
  assert.ok(Number.isFinite(c.sellNowExpectedMoney), 'sell-now branch must be priced');
  assert.ok(Number.isFinite(c.holdExpectedMoney), 'hold branch must be priced');
  assert.equal(c.netGainFromWaiting, c.holdExpectedMoney - c.sellNowExpectedMoney);
  assert.ok(Number.isFinite(c.additionalSpoilagePercent), 'the cost of waiting must be quantified');
  assert.equal(c.modelVersion, 'price_xgb_v1_h1-demo', 'the forecast must be traceable to a model');
});

test('timing: every decision carries a reason and a window', () => {
  const scenarios = [
    { market: market({ spoilageRisk: 'high', safeDays: 0 }), prediction: prediction() },
    { market: market(), prediction: { available: false, reason: 'MODEL_NOT_TRAINED' } },
    { market: market(), prediction: prediction({ predictedPrice: 2900 }) },
    {
      market: market({ safeDays: 30, estimatedLossPercent: 0.5, estimatedLossValue: 60 }),
      prediction: prediction({ currentPrice: 2000, predictedPrice: 2400 })
    }
  ];

  for (const scenario of scenarios) {
    const result = sellTiming.decideSellTiming({
      ...scenario,
      spoilageInput: spoilageInput({ cropType: 'onion' }),
      quantityKg: 500
    });
    assert.ok(result.reason && result.reason.length > 20, `reason too thin: ${result.reason}`);
    assert.ok(result.recommendedWindow, 'every decision needs a window');
    assert.ok(['SELL_NOW', 'SELL_SOON', 'WAIT'].includes(result.decision));
    assert.equal(result.engine, 'RULE_BASED', 'V1 timing is explicitly rule-based');
    assert.equal(result.engineVersion, 'sell_timing_v1');
  }
});

test('timing: no reason ever promises a price', () => {
  // Guards against unsupported financial guarantees.
  const forbidden = /guarantee|guaranteed|will definitely|certain(ly)? (rise|increase)|assured/i;
  const scenarios = [
    { market: market({ spoilageRisk: 'high', safeDays: 0 }), prediction: prediction() },
    { market: market(), prediction: { available: false, reason: 'X' } },
    {
      market: market({ safeDays: 30, estimatedLossPercent: 0.5, estimatedLossValue: 60 }),
      prediction: prediction({ currentPrice: 2000, predictedPrice: 2400 })
    }
  ];
  for (const scenario of scenarios) {
    const result = sellTiming.decideSellTiming({
      ...scenario, spoilageInput: spoilageInput({ cropType: 'onion' }), quantityKg: 500
    });
    assert.doesNotMatch(result.reason, forbidden, `reason makes a promise: ${result.reason}`);
  }
});

test('timing: no market yields advice rather than a crash', () => {
  const result = sellTiming.decideSellTiming({
    market: null, prediction: prediction(), spoilageInput: spoilageInput(), quantityKg: 500
  });
  assert.equal(result.decision, 'SELL_SOON');
  assert.equal(result.confidence, 'low');
});

test('timing: shifting the harvest date backwards ages the crop', () => {
  assert.equal(sellTiming.shiftHarvestDateEarlier('2026-09-20', 3), '2026-09-17');
  assert.equal(sellTiming.shiftHarvestDateEarlier('2026-09-20', 0), '2026-09-20');
  // An invalid date must not produce "Invalid Date" in a payload.
  assert.match(sellTiming.shiftHarvestDateEarlier('nonsense', 1), /^\d{4}-\d{2}-\d{2}$/);
  assert.match(sellTiming.shiftHarvestDateEarlier(null, 2), /^\d{4}-\d{2}-\d{2}$/);
});

test('timing: identical inputs give identical decisions (deterministic)', () => {
  const args = {
    market: market(), prediction: prediction(), spoilageInput: spoilageInput(), quantityKg: 500
  };
  const first = sellTiming.decideSellTiming(args);
  for (let i = 0; i < 5; i += 1) {
    const again = sellTiming.decideSellTiming(args);
    assert.equal(again.decision, first.decision);
    assert.equal(again.reason, first.reason);
  }
});
