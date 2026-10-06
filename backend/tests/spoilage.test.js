/**
 * Spoilage baseline tests.
 *
 * The engine is a documented rule set, not a fitted model, so these tests assert
 * the PROPERTIES that must hold for the market ranking to be trustworthy -
 * monotonicity in heat, time and distance, and correct ordering across crops -
 * rather than pinning exact percentages that a future calibration should be free
 * to change.
 *
 * They also assert that the engine never claims to be machine learning.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const spoilage = require('../src/services/spoilageService');

/** ISO date `days` ago. */
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

/** Baseline input: tomato harvested today, open storage, hot and dry. */
const base = (overrides = {}) => ({
  cropType: 'tomato',
  quantityKg: 500,
  harvestDate: daysAgo(0),
  storageType: 'open',
  temperatureC: 33,
  humidity: 68,
  ...overrides
});

test('spoilage: the engine identifies itself as a rule-based baseline', () => {
  const result = spoilage.assessSpoilageRisk(base());
  assert.equal(result.engine, 'RULE_BASED_BASELINE');
  assert.equal(result.modelVersion, 'spoilage_baseline_v1');
  assert.equal(result.isMachineLearning, false);
});

test('spoilage: the market estimate also declares it is not ML', () => {
  const result = spoilage.estimateSpoilageLossForMarket(base(), {
    name: 'Test', distanceKm: 40, pricePerQuintal: 2800
  });
  assert.equal(result.engine, 'RULE_BASED_BASELINE');
  assert.equal(result.isMachineLearning, false);
});

test('spoilage: loss rises with distance', () => {
  const losses = [10, 40, 80, 150, 250].map(
    (distanceKm) =>
      spoilage.estimateSpoilageLossForMarket(base(), { name: 'M', distanceKm })
        .estimatedLossPercent
  );
  for (let i = 1; i < losses.length; i += 1) {
    assert.ok(losses[i] >= losses[i - 1], `loss must not fall with distance: ${losses}`);
  }
  assert.ok(losses[losses.length - 1] > losses[0], `distance must matter: ${losses}`);
});

test('spoilage: loss rises with ambient temperature', () => {
  const losses = [15, 22, 30, 38, 45].map(
    (temperatureC) =>
      spoilage.estimateSpoilageLossForMarket(base({ temperatureC }), { name: 'M', distanceKm: 50 })
        .estimatedLossPercent
  );
  for (let i = 1; i < losses.length; i += 1) {
    assert.ok(losses[i] >= losses[i - 1], `loss must not fall as it gets hotter: ${losses}`);
  }
  assert.ok(losses[losses.length - 1] > losses[0], `temperature must matter: ${losses}`);
});

test('spoilage: loss rises with days since harvest', () => {
  const losses = [0, 1, 2, 4].map(
    (days) =>
      spoilage.estimateSpoilageLossForMarket(base({ harvestDate: daysAgo(days) }), {
        name: 'M', distanceKm: 40
      }).estimatedLossPercent
  );
  for (let i = 1; i < losses.length; i += 1) {
    assert.ok(losses[i] >= losses[i - 1], `loss must not fall as the crop ages: ${losses}`);
  }
  assert.ok(losses[losses.length - 1] > losses[0]);
});

test('spoilage: a perishable crop loses more than a grain on the same trip', () => {
  const trip = { name: 'M', distanceKm: 80 };
  const tomato = spoilage.estimateSpoilageLossForMarket(base({ cropType: 'tomato' }), trip);
  const spinach = spoilage.estimateSpoilageLossForMarket(base({ cropType: 'spinach' }), trip);
  const onion = spoilage.estimateSpoilageLossForMarket(base({ cropType: 'onion' }), trip);
  const wheat = spoilage.estimateSpoilageLossForMarket(base({ cropType: 'wheat' }), trip);

  assert.ok(spinach.estimatedLossPercent > tomato.estimatedLossPercent, 'spinach > tomato');
  assert.ok(tomato.estimatedLossPercent > onion.estimatedLossPercent, 'tomato > onion');

  // Onion and wheat both survive an 80 km same-day trip essentially intact, so
  // their LOSS figures are both ~0 - comparing them strictly would just be
  // comparing two zeros. The perishability ordering is still asserted, on the
  // risk score, where it is actually expressed at this trip length.
  assert.ok(onion.riskScore > wheat.riskScore, 'onion carries more risk than wheat');
  assert.ok(onion.estimatedLossPercent >= wheat.estimatedLossPercent, 'onion >= wheat');

  // And where the trip IS long enough to bite, onion must lose more than wheat.
  const longTrip = { name: 'Far', distanceKm: 900 };
  const onionFar = spoilage.estimateSpoilageLossForMarket(base({ cropType: 'onion' }), longTrip);
  const wheatFar = spoilage.estimateSpoilageLossForMarket(base({ cropType: 'wheat' }), longTrip);
  assert.ok(onionFar.estimatedLossPercent > wheatFar.estimatedLossPercent, 'onion > wheat over 900 km');
});

test('spoilage: a fresh nearby trip loses only a few percent, not tens', () => {
  // Guards the curve shape. A linear risk-to-loss conversion reported ~34% here,
  // which no farmer would recognise as their experience.
  const result = spoilage.estimateSpoilageLossForMarket(base(), {
    name: 'Nearby', distanceKm: 35
  });
  assert.ok(
    result.estimatedLossPercent < 10,
    `same-day tomato over 35 km should lose under 10%, got ${result.estimatedLossPercent}%`
  );
});

test('spoilage: cold storage reduces loss substantially', () => {
  const trip = { name: 'M', distanceKm: 60 };
  const open = spoilage.estimateSpoilageLossForMarket(
    base({ harvestDate: daysAgo(2), storageType: 'open' }), trip
  );
  const cold = spoilage.estimateSpoilageLossForMarket(
    base({ harvestDate: daysAgo(2), storageType: 'cold' }), trip
  );
  assert.ok(
    cold.estimatedLossPercent < open.estimatedLossPercent,
    `cold storage must help: open ${open.estimatedLossPercent}% vs cold ${cold.estimatedLossPercent}%`
  );
});

test('spoilage: loss is never negative and never exceeds the documented cap', () => {
  const extremes = [
    base({ harvestDate: daysAgo(0), temperatureC: 5, humidity: 90 }),
    base({ harvestDate: daysAgo(60), temperatureC: 48, humidity: 20 }),
    base({ harvestDate: daysAgo(365), temperatureC: 45, humidity: 95 })
  ];
  for (const input of extremes) {
    const result = spoilage.estimateSpoilageLossForMarket(input, { name: 'M', distanceKm: 300 });
    assert.ok(result.estimatedLossPercent >= 0, 'loss cannot be negative');
    assert.ok(
      result.estimatedLossPercent <= 90,
      `loss must respect the 90% cap, got ${result.estimatedLossPercent}%`
    );
  }
});

test('spoilage: loss kg and saleable kg always reconcile with the quantity', () => {
  for (const quantityKg of [1, 50, 500, 5000]) {
    const result = spoilage.estimateSpoilageLossForMarket(
      base({ quantityKg, harvestDate: daysAgo(1) }), { name: 'M', distanceKm: 70 }
    );
    assert.ok(
      Math.abs(result.estimatedLossKg + result.saleableQuantityKg - quantityKg) < 0.2,
      `${result.estimatedLossKg} + ${result.saleableQuantityKg} must equal ${quantityKg}`
    );
  }
});

test('spoilage: loss value is null unless a price is supplied', () => {
  const noPrice = spoilage.estimateSpoilageLossForMarket(base(), { name: 'M', distanceKm: 50 });
  assert.equal(noPrice.estimatedLossValue, null, 'a loss must never be valued at a guessed price');

  const withPrice = spoilage.estimateSpoilageLossForMarket(base({ harvestDate: daysAgo(1) }), {
    name: 'M', distanceKm: 50, pricePerQuintal: 2800
  });
  assert.ok(withPrice.estimatedLossValue > 0);
});

test('spoilage: loss value equals loss kg priced at the mandi rate', () => {
  const result = spoilage.estimateSpoilageLossForMarket(
    base({ harvestDate: daysAgo(1) }), { name: 'M', distanceKm: 50, pricePerQuintal: 3000 }
  );
  // ₹3000/quintal = ₹30/kg
  assert.ok(
    Math.abs(result.estimatedLossValue - result.estimatedLossKg * 30) <= 1,
    `${result.estimatedLossValue} should equal ${result.estimatedLossKg} kg x ₹30`
  );
});

test('spoilage: the precise loss percent is not integer-rounded', () => {
  // Money arithmetic needs the unrounded figure; the integer field is kept only
  // for backward compatibility with the existing SpoilageRisk page.
  const results = [20, 40, 60, 80, 100, 120].map((distanceKm) =>
    spoilage.assessSpoilageRisk(base({ harvestDate: daysAgo(1), distanceKm }))
  );
  assert.ok(
    results.some((r) => !Number.isInteger(r.loss.estimatedLossPercentPrecise)),
    'at least one scenario should produce a fractional loss percentage'
  );
  for (const r of results) {
    assert.ok(Number.isInteger(r.loss.estimatedLossPercent), 'the legacy field stays an integer');
  }
});

test('spoilage: contributing factors are returned, strongest first', () => {
  const result = spoilage.estimateSpoilageLossForMarket(
    base({ temperatureC: 42, harvestDate: daysAgo(3) }), { name: 'M', distanceKm: 200 }
  );
  assert.ok(Array.isArray(result.factors));
  assert.ok(result.factors.length > 0, 'a high-risk load must explain itself');
  assert.ok(result.factors.every((f) => typeof f === 'string'));

  const impacts = result.factorDetails.map((f) => f.impact);
  for (let i = 1; i < impacts.length; i += 1) {
    assert.ok(impacts[i - 1] >= impacts[i], `factors must be sorted by impact: ${impacts}`);
  }
});

test('spoilage: risk level bands track the risk score', () => {
  const low = spoilage.assessSpoilageRisk(base({ cropType: 'wheat', temperatureC: 20, humidity: 55 }));
  const high = spoilage.assessSpoilageRisk(
    base({ cropType: 'spinach', harvestDate: daysAgo(6), temperatureC: 42, distanceKm: 250 })
  );
  assert.equal(low.risk.level, 'low');
  assert.equal(high.risk.level, 'high');
  assert.ok(high.risk.score > low.risk.score);
});

test('spoilage: missing weather falls back to defaults without throwing', () => {
  const result = spoilage.assessSpoilageRisk({
    cropType: 'tomato',
    quantityKg: 500,
    harvestDate: daysAgo(1),
    storageType: 'open'
    // temperatureC and humidity deliberately absent
  });
  assert.ok(Number.isFinite(result.risk.score));
  assert.ok(Number.isFinite(result.loss.estimatedLossPercentPrecise));
  assert.equal(result.engine, 'RULE_BASED_BASELINE');
});

test('spoilage: a future harvest date counts as zero days elapsed', () => {
  const future = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const result = spoilage.assessSpoilageRisk(base({ harvestDate: future }));
  assert.equal(result.crop.daysSinceHarvest, 0, 'a future harvest cannot already be old');
});

test('spoilage: zero quantity produces zero loss quantity, not NaN', () => {
  const result = spoilage.estimateSpoilageLossForMarket(base({ quantityKg: 0 }), {
    name: 'M', distanceKm: 50, pricePerQuintal: 2800
  });
  assert.equal(result.estimatedLossKg, 0);
  assert.equal(result.saleableQuantityKg, 0);
  assert.equal(result.estimatedLossValue, 0);
});

test('spoilage: an unknown crop resolves to the default profile, not a crash', () => {
  const result = spoilage.assessSpoilageRisk(base({ cropType: 'moon_fruit' }));
  assert.ok(Number.isFinite(result.risk.score));
  assert.ok(result.crop.label);
});

test('spoilage: identical inputs give identical outputs (deterministic)', () => {
  const input = base({ harvestDate: daysAgo(1) });
  const trip = { name: 'M', distanceKm: 63, pricePerQuintal: 2750 };
  const first = spoilage.estimateSpoilageLossForMarket(input, trip);
  for (let i = 0; i < 5; i += 1) {
    const again = spoilage.estimateSpoilageLossForMarket(input, trip);
    assert.equal(again.estimatedLossPercent, first.estimatedLossPercent);
    assert.equal(again.estimatedLossValue, first.estimatedLossValue);
    assert.equal(again.riskScore, first.riskScore);
  }
});
