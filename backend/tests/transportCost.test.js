/**
 * Transport cost engine tests.
 *
 * Vehicle configuration is injected in every test, so these run without a
 * database and assert the formula rather than the current seeded rates.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const transport = require('../src/services/transportCostService');

/** Fixed test fleet, ascending capacity - the order loadVehicles returns. */
const VEHICLES = [
  {
    vehicle_type: 'tempo', label: 'Tempo', rate_per_km: '20', loading_cost: '200',
    unloading_cost: '100', minimum_charge: '600', capacity_kg: '1000',
    return_trip_factor: '1.00', config_version: 'test_v1'
  },
  {
    vehicle_type: 'small_truck', label: 'Mini Truck', rate_per_km: '25', loading_cost: '300',
    unloading_cost: '200', minimum_charge: '900', capacity_kg: '3000',
    return_trip_factor: '1.00', config_version: 'test_v1'
  }
];

/** Same fleet but with a return-leg charge, to isolate that factor. */
const VEHICLES_WITH_RETURN = [
  { ...VEHICLES[0], return_trip_factor: '1.50' }
];

test('transport: cost is distance x rate plus handling', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 100, quantityKg: 500, vehicles: VEHICLES
  });
  // 100 km x 20 = 2000 running, + 200 loading + 100 unloading = 2300
  assert.equal(result.totalCost, 2300);
  assert.equal(result.breakdown.runningCost, 2000);
  assert.equal(result.breakdown.loadingCost, 200);
  assert.equal(result.breakdown.unloadingCost, 100);
  assert.equal(result.vehicle.type, 'tempo');
});

test('transport: the smallest vehicle that fits is chosen', async () => {
  const small = await transport.calculateTransportCost({
    distanceKm: 50, quantityKg: 800, vehicles: VEHICLES
  });
  assert.equal(small.vehicle.type, 'tempo');

  const bigger = await transport.calculateTransportCost({
    distanceKm: 50, quantityKg: 2500, vehicles: VEHICLES
  });
  assert.equal(bigger.vehicle.type, 'small_truck');
});

test('transport: a load beyond every capacity becomes multiple trips', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 40, quantityKg: 7000, vehicles: VEHICLES
  });
  // Largest vehicle is 3000 kg, so 7000 kg needs 3 trips.
  assert.equal(result.vehicle.type, 'small_truck');
  assert.equal(result.trips, 3);
  // 40 km x 25 x 3 trips = 3000 running, handling (300+200) x 3 = 1500
  assert.equal(result.breakdown.runningCost, 3000);
  assert.equal(result.totalCost, 4500);
});

test('transport: the minimum charge floors a very short haul', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 5, quantityKg: 500, vehicles: VEHICLES
  });
  // 5 km x 20 = 100, below the 600 minimum, so 600 is billed.
  assert.equal(result.breakdown.minimumChargeApplied, true);
  assert.equal(result.breakdown.runningCost, 600);
  assert.equal(result.totalCost, 900); // 600 + 200 + 100
});

test('transport: the minimum charge does not apply to a long haul', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 100, quantityKg: 500, vehicles: VEHICLES
  });
  assert.equal(result.breakdown.minimumChargeApplied, false);
});

test('transport: the return-trip factor increases chargeable kilometres', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 100, quantityKg: 500, vehicles: VEHICLES_WITH_RETURN
  });
  // 100 km x 1.5 = 150 chargeable km x 20 = 3000
  assert.equal(result.chargeableKm, 150);
  assert.equal(result.breakdown.runningCost, 3000);
  assert.equal(result.vehicle.returnTripFactor, 1.5);
});

test('transport: the return trip can be excluded', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 100, quantityKg: 500, vehicles: VEHICLES_WITH_RETURN,
    includeReturnTrip: false
  });
  assert.equal(result.chargeableKm, 100);
  assert.equal(result.vehicle.returnTripFactor, 1);
});

test('transport: cost never falls as distance grows', async () => {
  // Non-decreasing rather than strictly increasing: below the minimum charge the
  // cost is flat by design (a 10 km and a 30 km hop both cost the 600 floor),
  // which is how transporters actually quote a short trip.
  const costs = [];
  for (const distanceKm of [10, 30, 60, 120, 200]) {
    const result = await transport.calculateTransportCost({
      distanceKm, quantityKg: 500, vehicles: VEHICLES
    });
    costs.push(result.totalCost);
  }
  for (let i = 1; i < costs.length; i += 1) {
    assert.ok(costs[i] >= costs[i - 1], `cost must never fall with distance: ${costs}`);
  }
  // Above the floor it must genuinely rise, or distance would not affect ranking.
  assert.ok(costs[costs.length - 1] > costs[2], `long hauls must cost more: ${costs}`);
});

test('transport: a specific vehicle can be forced', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 50, quantityKg: 200, vehicleType: 'small_truck', vehicles: VEHICLES
  });
  assert.equal(result.vehicle.type, 'small_truck');
});

test('transport: an unknown forced vehicle falls back to capacity selection', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 50, quantityKg: 200, vehicleType: 'helicopter', vehicles: VEHICLES
  });
  assert.equal(result.vehicle.type, 'tempo');
});

test('transport: zero distance still charges the minimum plus handling', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 0, quantityKg: 500, vehicles: VEHICLES
  });
  assert.equal(result.totalCost, 900);
});

test('transport: invalid quantity is rejected', async () => {
  await assert.rejects(
    () => transport.calculateTransportCost({ distanceKm: 50, quantityKg: 0, vehicles: VEHICLES }),
    (error) => error.code === 'INVALID_QUANTITY'
  );
  await assert.rejects(
    () => transport.calculateTransportCost({ distanceKm: 50, quantityKg: -10, vehicles: VEHICLES }),
    (error) => error.code === 'INVALID_QUANTITY'
  );
});

test('transport: invalid distance is rejected', async () => {
  await assert.rejects(
    () => transport.calculateTransportCost({ distanceKm: -5, quantityKg: 500, vehicles: VEHICLES }),
    (error) => error.code === 'INVALID_DISTANCE'
  );
  await assert.rejects(
    () => transport.calculateTransportCost({ distanceKm: null, quantityKg: 500, vehicles: VEHICLES }),
    (error) => error.code === 'INVALID_DISTANCE'
  );
});

test('transport: cost per kg falls as the load grows (freight is shared)', async () => {
  const light = await transport.calculateTransportCost({
    distanceKm: 60, quantityKg: 200, vehicles: VEHICLES
  });
  const heavy = await transport.calculateTransportCost({
    distanceKm: 60, quantityKg: 900, vehicles: VEHICLES
  });
  assert.ok(
    heavy.costPerKg < light.costPerKg,
    `per-kg freight should fall with volume: ${light.costPerKg} -> ${heavy.costPerKg}`
  );
});

test('transport: the engine reports itself as deterministic configuration', async () => {
  const result = await transport.calculateTransportCost({
    distanceKm: 50, quantityKg: 500, vehicles: VEHICLES
  });
  assert.equal(result.engine, 'DETERMINISTIC_CONFIG');
  assert.equal(result.configVersion, 'test_v1');
});

test('transport: trip counting', () => {
  const vehicle = { capacity_kg: '1000' };
  assert.equal(transport.tripsRequired(500, vehicle), 1);
  assert.equal(transport.tripsRequired(1000, vehicle), 1);
  assert.equal(transport.tripsRequired(1001, vehicle), 2);
  assert.equal(transport.tripsRequired(3000, vehicle), 3);
  // A config with no capacity cannot imply multiple trips.
  assert.equal(transport.tripsRequired(5000, { capacity_kg: null }), 1);
});
