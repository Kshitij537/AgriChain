/**
 * Request validation tests.
 *
 * Validation is the cheapest safety net in the system: it runs before any
 * external call, and it is the only thing standing between a typo and a
 * confident-looking recommendation built on nonsense.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const validator = require('../src/validators/marketValidator');

const codesOf = (result) => result.errors.map((e) => e.code);

// ---------------------------------------------------------------------------
// Quantity
// ---------------------------------------------------------------------------

test('validator: valid quantities are accepted', () => {
  for (const value of [1, 500, 2500.5, '500', 100000]) {
    const result = validator.validateQuantity(value);
    assert.equal(result.valid, true, `${value} should be valid`);
    assert.equal(result.value, Number(value));
  }
});

test('validator: zero quantity is rejected with its own code', () => {
  const result = validator.validateQuantity(0);
  assert.equal(result.valid, false);
  assert.equal(result.error.code, 'QUANTITY_ZERO');
});

test('validator: negative quantity is rejected with its own code', () => {
  const result = validator.validateQuantity(-5);
  assert.equal(result.valid, false);
  assert.equal(result.error.code, 'QUANTITY_NEGATIVE');
});

test('validator: missing quantity is rejected', () => {
  for (const value of [undefined, null, '']) {
    assert.equal(validator.validateQuantity(value).error.code, 'QUANTITY_REQUIRED');
  }
});

test('validator: non-numeric quantity is rejected', () => {
  assert.equal(validator.validateQuantity('many').error.code, 'QUANTITY_INVALID');
  assert.equal(validator.validateQuantity({}).error.code, 'QUANTITY_INVALID');
});

test('validator: an implausibly large quantity is caught as a unit mistake', () => {
  // A farmer entering grams instead of kilograms is a realistic error.
  const result = validator.validateQuantity(500000);
  assert.equal(result.valid, false);
  assert.equal(result.error.code, 'QUANTITY_TOO_LARGE');
  assert.match(result.error.message, /kilograms/i, 'the message must explain the unit');
});

// ---------------------------------------------------------------------------
// Crop
// ---------------------------------------------------------------------------

test('validator: known crops resolve to their profile key', () => {
  assert.deepEqual(validator.validateCrop('tomato'), { valid: true, value: 'tomato' });
  assert.equal(validator.validateCrop('Tomato').value, 'tomato');
  assert.equal(validator.validateCrop('  ONION  ').value, 'onion');
});

test('validator: an unsupported crop is rejected and lists what is supported', () => {
  const result = validator.validateCrop('dragonfruit');
  assert.equal(result.valid, false);
  assert.equal(result.error.code, 'CROP_NOT_SUPPORTED');
  assert.match(result.error.message, /tomato/, 'the farmer must be told what they can pick');
});

test('validator: a missing crop is rejected', () => {
  for (const value of [undefined, null, '', '   ', 123]) {
    assert.equal(validator.validateCrop(value).error.code, 'CROP_REQUIRED');
  }
});

// ---------------------------------------------------------------------------
// Harvest date
// ---------------------------------------------------------------------------

test('validator: harvest date is optional', () => {
  for (const value of [undefined, null, '']) {
    const result = validator.validateHarvestDate(value);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  }
});

test('validator: a valid harvest date normalises to ISO', () => {
  const today = new Date().toISOString().slice(0, 10);
  assert.equal(validator.validateHarvestDate(today).value, today);
});

test('validator: an unparseable harvest date is rejected', () => {
  for (const value of ['not-a-date', 'yesterday', '99/99/9999']) {
    const result = validator.validateHarvestDate(value);
    assert.equal(result.valid, false, `${value} should be rejected`);
    assert.equal(result.error.code, 'HARVEST_DATE_INVALID');
  }
});

test('validator: a harvest date far in the future is rejected', () => {
  const future = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10);
  assert.equal(validator.validateHarvestDate(future).error.code, 'HARVEST_DATE_TOO_FAR_FUTURE');
});

test('validator: a near-future harvest date is allowed (planning ahead)', () => {
  const soon = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  assert.equal(validator.validateHarvestDate(soon).valid, true);
});

test('validator: a harvest date over a year old is rejected', () => {
  const ancient = new Date(Date.now() - 400 * 86400000).toISOString().slice(0, 10);
  assert.equal(validator.validateHarvestDate(ancient).error.code, 'HARVEST_DATE_TOO_OLD');
});

// ---------------------------------------------------------------------------
// Production cost
// ---------------------------------------------------------------------------

test('validator: production cost is optional', () => {
  for (const value of [undefined, null, '']) {
    const result = validator.validateProductionCost(value);
    assert.equal(result.valid, true);
    assert.equal(result.value, null);
  }
});

test('validator: a valid production cost is accepted', () => {
  assert.equal(validator.validateProductionCost(16000).value, 16000);
  assert.equal(validator.validateProductionCost('8000').value, 8000);
});

test('validator: a negative production cost is rejected', () => {
  assert.equal(validator.validateProductionCost(-100).error.code, 'PRODUCTION_COST_NEGATIVE');
});

test('validator: a non-numeric production cost is rejected', () => {
  assert.equal(validator.validateProductionCost('a lot').error.code, 'PRODUCTION_COST_INVALID');
});

test('validator: a per-kg figure typed into the total cost field is rejected', () => {
  // The real case this guards: ₹52 entered against a 1,000 kg batch, which the
  // breakeven engine turns into ₹0.05/kg and reports as ~₹47,000 of profit.
  const result = validator.validateProductionCostPerKg(52, 1000);
  assert.equal(result.valid, false);
  assert.equal(result.error.code, 'PRODUCTION_COST_IMPLAUSIBLE');
  // The message must name the likely intent and do the conversion, or the farmer
  // has no way to know what to type instead.
  assert.match(result.error.message, /52,000/);
  assert.match(result.error.message, /0\.05 per kg/);
});

test('validator: realistic total production costs pass the per-kg check', () => {
  for (const [cost, quantityKg] of [
    [30000, 1000],   // soybean, ₹30/kg
    [16000, 1000],   // ₹16/kg
    [5000, 350],     // chilli, ₹14.3/kg
    [1000, 1000],    // exactly the ₹1/kg floor
    [10000, 40]      // small lot, ₹250/kg
  ]) {
    assert.equal(
      validator.validateProductionCostPerKg(cost, quantityKg).valid, true,
      `₹${cost} for ${quantityKg} kg should be accepted`
    );
  }
});

test('validator: the per-kg check stays quiet when either side is absent', () => {
  // Production cost is optional, and a missing quantity is already reported by
  // its own validator - this check must not pile on a second error for it.
  for (const [cost, quantityKg] of [[null, 1000], [52, null], [null, null], [0, 1000]]) {
    assert.equal(validator.validateProductionCostPerKg(cost, quantityKg).valid, true);
  }
});

test('validator: an implausible production cost fails the whole recommend request', () => {
  const result = validator.validateRecommendRequest({
    crop: 'soybean',
    quantityKg: 1000,
    farmId: 42,
    harvestDate: new Date().toISOString().slice(0, 10),
    productionCost: 52
  });
  assert.equal(result.valid, false);
  assert.ok(codesOf(result).includes('PRODUCTION_COST_IMPLAUSIBLE'));
});

// ---------------------------------------------------------------------------
// Farm id
// ---------------------------------------------------------------------------

test('validator: numeric and prefixed farm ids both resolve', () => {
  assert.equal(validator.validateFarmId(39).value, 39);
  assert.equal(validator.validateFarmId('39').value, 39);
  // The brief's example uses the "farm_123" form.
  assert.equal(validator.validateFarmId('farm_123').value, 123);
  assert.equal(validator.validateFarmId('farm-7').value, 7);
});

test('validator: a missing farm id is rejected', () => {
  for (const value of [undefined, null, '']) {
    assert.equal(validator.validateFarmId(value).error.code, 'FARM_ID_REQUIRED');
  }
});

test('validator: a non-positive or unparseable farm id is rejected', () => {
  for (const value of [0, -1, 'abc', 'farm_abc']) {
    assert.equal(validator.validateFarmId(value).error.code, 'FARM_ID_INVALID', `${value}`);
  }
});

// ---------------------------------------------------------------------------
// Whole request
// ---------------------------------------------------------------------------

test('validator: the brief\'s example request is accepted', () => {
  const result = validator.validateRecommendRequest({
    crop: 'tomato',
    quantityKg: 500,
    farmId: 'farm_123',
    harvestDate: new Date().toISOString().slice(0, 10),
    productionCost: 16000
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.value.crop, 'tomato');
  assert.equal(result.value.quantityKg, 500);
  assert.equal(result.value.farmId, 123);
  assert.equal(result.value.productionCost, 16000);
});

test('validator: every error is collected, not just the first', () => {
  // A farmer fixing a form should see everything wrong with it at once.
  const result = validator.validateRecommendRequest({
    quantityKg: -1,
    harvestDate: 'nonsense',
    productionCost: -50
  });
  assert.equal(result.valid, false);
  const codes = codesOf(result);
  assert.ok(codes.includes('CROP_REQUIRED'));
  assert.ok(codes.includes('QUANTITY_NEGATIVE'));
  assert.ok(codes.includes('FARM_ID_REQUIRED'));
  assert.ok(codes.includes('HARVEST_DATE_INVALID'));
  assert.ok(codes.includes('PRODUCTION_COST_NEGATIVE'));
  assert.equal(codes.length, 5);
});

test('validator: optional refinements are defaulted, never rejected', () => {
  const result = validator.validateRecommendRequest({
    crop: 'tomato', quantityKg: 500, farmId: 39,
    storageType: 'teleportation_chamber',
    predictionDays: 99
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.storageType, 'open', 'an unknown storage type falls back to open');
  assert.equal(result.value.predictionDays, 1, 'an unsupported horizon falls back to 1 day');
  assert.equal(result.value.includeRouteGeometry, false);
});

test('validator: a known storage type is preserved', () => {
  const result = validator.validateRecommendRequest({
    crop: 'tomato', quantityKg: 500, farmId: 39, storageType: 'cold'
  });
  assert.equal(result.value.storageType, 'cold');
});

test('validator: snake_case field names are accepted alongside camelCase', () => {
  const result = validator.validateRecommendRequest({
    crop: 'tomato',
    quantityKg: 500,
    farm_id: 39,
    harvest_date: new Date().toISOString().slice(0, 10),
    production_cost: 9000
  });
  assert.equal(result.valid, true, JSON.stringify(result.errors));
  assert.equal(result.value.farmId, 39);
  assert.equal(result.value.productionCost, 9000);
});

// ---------------------------------------------------------------------------
// Price query
// ---------------------------------------------------------------------------

test('validator: a price query needs only a crop', () => {
  const result = validator.validatePriceQuery({ crop: 'tomato' });
  assert.equal(result.valid, true);
  assert.equal(result.value.latitude, null);
  assert.equal(result.value.longitude, null);
});

test('validator: coordinates are parsed when supplied', () => {
  const result = validator.validatePriceQuery({ crop: 'tomato', lat: '21.05', lon: '78.95' });
  assert.equal(result.valid, true);
  assert.equal(result.value.latitude, 21.05);
  assert.equal(result.value.longitude, 78.95);
});

test('validator: a malformed coordinate is rejected rather than ignored', () => {
  const result = validator.validatePriceQuery({ crop: 'tomato', lat: 'here', lon: '78.95' });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'COORDINATES_INVALID');
});

test('validator: a price query with an invalid crop fails', () => {
  const result = validator.validatePriceQuery({ crop: 'moonfruit' });
  assert.equal(result.valid, false);
  assert.equal(result.errors[0].code, 'CROP_NOT_SUPPORTED');
});
