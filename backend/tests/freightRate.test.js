/**
 * Freight rate resolution tests.
 *
 * The point of this engine is that a ₹/km figure can never again appear without
 * saying where it came from. These tests assert the precedence, the honesty of
 * the labels, and that indexation cannot run wild.
 */

const test = require('node:test');
const assert = require('node:assert');

const freightRateService = require('../src/services/freightRateService');
const fuelPriceService = require('../src/services/fuelPriceService');
const transportCostService = require('../src/services/transportCostService');

/** A transport_config row, shaped as pg returns it (NUMERIC as string). */
const vehicle = (overrides = {}) => ({
  vehicle_type: 'large_truck',
  label: 'Large Truck (up to 16 t)',
  rate_per_km: '52.00',
  loading_cost: '800.00',
  unloading_cost: '600.00',
  minimum_charge: '4000.00',
  capacity_kg: '16000.00',
  return_trip_factor: '1.20',
  mileage_kmpl: '4.50',
  baseline_diesel_price: null,
  rate_source: 'CONFIGURED_ESTIMATE',
  rate_source_note: null,
  config_version: 'transport_v1',
  ...overrides
});

const freshDiesel = (price) => ({
  available: true,
  fuelType: 'diesel',
  pricePerLitre: price,
  observedOn: '2026-09-28',
  ageInDays: 0,
  source: 'USER_REPORTED',
  freshness: 'TODAY',
  state: 'Maharashtra'
});

// --- precedence ------------------------------------------------------------

test('freight rate: with no evidence at all the rate is labelled an estimate', async () => {
  const rate = await freightRateService.resolveRate({ vehicle: vehicle(), quote: null });

  assert.equal(rate.ratePerKm, 52);
  assert.equal(rate.rateSource, 'CONFIGURED_ESTIMATE');
  assert.equal(rate.isRealRate, false, 'an unsourced figure must never claim to be real');
  assert.match(rate.rateSourceNote, /baseline_diesel_price/, 'it must say how to improve');
});

test('freight rate: a real transporter quote wins over everything', async () => {
  const rate = await freightRateService.resolveRate({
    vehicle: vehicle({ baseline_diesel_price: '90.00' }),
    fuel: freshDiesel(120),   // a huge diesel move that would otherwise index the rate up
    quote: {
      ratePerKm: 47.5,
      loadingCost: 700,
      unloadingCost: 500,
      minimumCharge: 4000,
      returnTripFactor: 1.15,
      transporterName: 'Test Transport Co',
      transporterPhone: '0712 000 0000',
      quotedOn: '2026-09-27',
      ageInDays: 1
    }
  });

  assert.equal(rate.ratePerKm, 47.5, 'the quoted rate is used verbatim');
  assert.equal(rate.rateSource, 'TRANSPORTER_QUOTE');
  assert.equal(rate.isRealRate, true);
  assert.equal(rate.evidence.transporterName, 'Test Transport Co');
  assert.match(rate.rateSourceNote, /Test Transport Co/, 'the quote must be attributable');
});

test('freight rate: a partial quote keeps configured handling charges, not zero', async () => {
  const rate = await freightRateService.resolveRate({
    vehicle: vehicle(),
    quote: {
      ratePerKm: 45,
      loadingCost: null,
      unloadingCost: null,
      minimumCharge: null,
      returnTripFactor: null,
      transporterName: 'Rate Only Transport',
      quotedOn: '2026-09-28',
      ageInDays: 0
    }
  });

  // Treating an unstated charge as zero would understate freight and bias the
  // ranking toward distant mandis.
  assert.equal(rate.loadingCost, 800);
  assert.equal(rate.unloadingCost, 600);
  assert.equal(rate.minimumCharge, 4000);
  assert.equal(rate.returnTripFactor, 1.2);
  assert.equal(rate.evidence.partialQuote, true, 'the gap must be disclosed');
});

// --- indexation ------------------------------------------------------------

test('freight rate: indexation refuses to run without a declared baseline', async () => {
  const rate = await freightRateService.resolveRate({
    vehicle: vehicle({ baseline_diesel_price: null }),
    fuel: freshDiesel(98.2),
    quote: null
  });

  // Indexing against a guessed baseline would just be the invented number in
  // disguise, so the engine declines and says so.
  assert.equal(rate.rateSource, 'CONFIGURED_ESTIMATE');
  assert.equal(rate.ratePerKm, 52);
});

test('freight rate: indexation refuses to run without a diesel observation', async () => {
  const rate = await freightRateService.resolveRate({
    vehicle: vehicle({ baseline_diesel_price: '91.40' }),
    fuel: { available: false, reason: 'NO_OBSERVATION', message: 'none recorded' },
    quote: null
  });

  assert.equal(rate.rateSource, 'CONFIGURED_ESTIMATE');
  assert.match(rate.rateSourceNote, /none recorded/);
});

test('freight rate: diesel movement moves the rate proportionally', async () => {
  const rate = await freightRateService.resolveRate({
    vehicle: vehicle({ baseline_diesel_price: '91.40' }),
    fuel: freshDiesel(98.2),
    quote: null
  });

  assert.equal(rate.rateSource, 'ESTIMATE_FUEL_INDEXED');
  assert.equal(rate.isRealRate, false, 'a real movement on an estimated base is still an estimate');

  const expected = Math.round(52 * (98.2 / 91.4) * 100) / 100;
  assert.equal(rate.ratePerKm, expected);
  assert.ok(rate.ratePerKm > 52, 'diesel rose, so freight must rise');
  assert.equal(rate.evidence.observedDieselPrice, 98.2);
  assert.equal(rate.evidence.baselineDieselPrice, 91.4);
  assert.equal(rate.evidence.observedOn, '2026-09-28');
});

test('freight rate: a diesel fall lowers the rate too', async () => {
  const rate = await freightRateService.resolveRate({
    vehicle: vehicle({ baseline_diesel_price: '91.40' }),
    fuel: freshDiesel(85),
    quote: null
  });

  assert.equal(rate.rateSource, 'ESTIMATE_FUEL_INDEXED');
  assert.ok(rate.ratePerKm < 52, 'indexation must work in both directions');
});

test('freight rate: an absurd baseline cannot reprice every mandi', async () => {
  // A mistyped baseline of ₹9.14 would otherwise multiply freight by ~10.
  const rate = await freightRateService.resolveRate({
    vehicle: vehicle({ baseline_diesel_price: '9.14' }),
    fuel: freshDiesel(98.2),
    quote: null
  });

  assert.equal(rate.evidence.indexFactorClamped, true, 'the clamp must engage');
  assert.equal(rate.evidence.indexFactor, freightRateService.MAX_INDEX_FACTOR);
  assert.ok(rate.ratePerKm <= 52 * freightRateService.MAX_INDEX_FACTOR + 0.01);
  assert.match(rate.rateSourceNote, /capped/, 'a capped adjustment must say so');
});

// --- the cost formula consumes the resolved rate ---------------------------

test('freight rate: the resolved rate is what the cost formula prices with', async () => {
  const resolvedRate = {
    ratePerKm: 40,
    loadingCost: 800,
    unloadingCost: 600,
    minimumCharge: 4000,
    returnTripFactor: 1.2,
    rateSource: 'TRANSPORTER_QUOTE',
    isRealRate: true,
    rateSourceNote: 'Quoted by Test Co',
    evidence: { transporterName: 'Test Co' }
  };

  const cost = await transportCostService.calculateTransportCost({
    distanceKm: 66,
    quantityKg: 50000,
    vehicles: [vehicle()],
    resolvedRate
  });

  // 4 hires of a 16 t truck: 66 × 1.2 × 4 = 316.8 chargeable km. At ₹40/km that
  // is ₹12,672 of running - BELOW the ₹4,000 minimum charge on each of 4 hires,
  // so the floor binds at ₹16,000. Handling is (800 + 600) × 4 = ₹5,600.
  assert.equal(cost.trips, 4);
  assert.equal(cost.chargeableKm, 316.8);
  assert.equal(cost.breakdown.minimumChargeApplied, true, 'the floor must engage here');
  assert.equal(cost.breakdown.runningCost, 16000);
  assert.equal(cost.totalCost, 16000 + 5600);
  assert.equal(cost.vehicle.ratePerKm, 40, 'the reported rate must be the one used');
  assert.equal(cost.rateSource, 'TRANSPORTER_QUOTE');
  assert.equal(cost.isRealRate, true);

  // Above the floor, the resolved rate drives the figure directly: at ₹52/km,
  // 316.8 × 52 = ₹16,473.60 exceeds the ₹16,000 minimum.
  const higher = await transportCostService.calculateTransportCost({
    distanceKm: 66,
    quantityKg: 50000,
    vehicles: [vehicle()],
    resolvedRate: { ...resolvedRate, ratePerKm: 52 }
  });
  assert.equal(higher.breakdown.minimumChargeApplied, false);
  assert.equal(higher.breakdown.runningCost, 16474);
  assert.ok(higher.totalCost > cost.totalCost, 'a higher resolved rate must cost more');
});

test('freight rate: provenance travels with every freight figure', async () => {
  const cost = await transportCostService.calculateTransportCost({
    distanceKm: 40,
    quantityKg: 1000,
    vehicles: [vehicle({ vehicle_type: 'tempo', capacity_kg: '1000.00', rate_per_km: '18.00' })]
  });

  // Whatever the source turns out to be on this machine, it must be stated and
  // must not claim to be a real quote unless one exists.
  assert.ok(cost.rateSource, 'rateSource is mandatory');
  assert.equal(typeof cost.isRealRate, 'boolean');
  assert.ok(cost.rateSourceNote, 'a freight figure must carry an explanation');
});

// --- fuel observation validation -------------------------------------------

test('fuel price: an impossible pump price is rejected, not stored', async () => {
  await assert.rejects(
    () => fuelPriceService.recordObservation({ pricePerLitre: 9140 }),
    (err) => err.code === 'INVALID_FUEL_PRICE'
  );

  await assert.rejects(
    () => fuelPriceService.recordObservation({ pricePerLitre: 0 }),
    (err) => err.code === 'INVALID_FUEL_PRICE'
  );
});

test('fuel price: an observation cannot be dated in the future', async () => {
  // Built in LOCAL time deliberately. toISOString() returns the UTC date, which in
  // IST can still be today - the very timezone slip fuelPriceService guards
  // against - and the test would then assert nothing.
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const tomorrow = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await assert.rejects(
    () => fuelPriceService.recordObservation({ pricePerLitre: 95, observedOn: tomorrow }),
    (err) => err.code === 'FUTURE_OBSERVATION'
  );
});

test('fuel price: only recognised sources are accepted', async () => {
  await assert.rejects(
    () => fuelPriceService.recordObservation({ pricePerLitre: 95, source: 'TRUST_ME' }),
    (err) => err.code === 'INVALID_FUEL_SOURCE'
  );
});

test('freight rate: a quote must name the transporter', async () => {
  await assert.rejects(
    () => freightRateService.recordQuote({ vehicleType: 'large_truck', ratePerKm: 45 }),
    (err) => err.code === 'MISSING_TRANSPORTER',
    'an unattributable quote is indistinguishable from an invented one'
  );
});

test('freight rate: a quote rate must be realistic', async () => {
  await assert.rejects(
    () => freightRateService.recordQuote({
      vehicleType: 'large_truck', ratePerKm: 5000, transporterName: 'X'
    }),
    (err) => err.code === 'INVALID_QUOTE_RATE'
  );
});
