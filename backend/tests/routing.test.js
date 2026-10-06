/**
 * Routing service tests.
 *
 * Network-free: these exercise the haversine maths, the coordinate guards, and
 * above all the requirement that a straight-line fallback is never presented as a
 * road route.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const routing = require('../src/services/routingService');

/** A farm near Hingna, Nagpur district. */
const FARM = { lat: 21.0046, lon: 79.0477 };
/** Nagpur APMC (Kalamna). */
const NAGPUR = { lat: 21.15, lon: 79.12 };
/** Amravati APMC, roughly 130 km west. */
const AMRAVATI = { lat: 20.932, lon: 77.752 };

test('routing: haversine matches a known separation', () => {
  const km = routing.haversineKm(FARM, NAGPUR);
  assert.ok(km > 16 && km < 20, `expected roughly 18 km, got ${km}`);
});

test('routing: haversine is symmetric', () => {
  assert.equal(
    Math.round(routing.haversineKm(FARM, AMRAVATI) * 100),
    Math.round(routing.haversineKm(AMRAVATI, FARM) * 100)
  );
});

test('routing: haversine of a point with itself is zero', () => {
  assert.equal(routing.haversineKm(FARM, FARM), 0);
});

test('routing: a longer separation yields a larger distance', () => {
  assert.ok(routing.haversineKm(FARM, AMRAVATI) > routing.haversineKm(FARM, NAGPUR));
});

test('routing: the fallback is explicitly labelled as an estimate', () => {
  const result = routing.straightLineEstimate(FARM, NAGPUR);

  assert.equal(result.method, 'STRAIGHT_LINE_ESTIMATE');
  assert.equal(result.isRoadRoute, false, 'an estimate must never claim to be a road route');
  assert.equal(result.provider, null);
  assert.ok(result.degradedReason, 'the caller must be told why it degraded');
  assert.equal(result.routeGeometry, null, 'an estimate has no route geometry to draw');
});

test('routing: the fallback inflates the straight line by the detour factor', () => {
  const result = routing.straightLineEstimate(FARM, NAGPUR);
  assert.ok(
    result.distanceKm > result.straightLineKm,
    'road distance is always longer than the crow flies'
  );
  // Tolerance of 0.1 km: distanceKm is derived from the full-precision haversine,
  // whereas straightLineKm is already rounded for display, so re-deriving from the
  // rounded value can differ in the last digit.
  const expected = result.straightLineKm * result.detourFactorApplied;
  assert.ok(
    Math.abs(result.distanceKm - expected) <= 0.1,
    `${result.distanceKm} should be about ${expected.toFixed(2)}`
  );
});

test('routing: the fallback reports the assumed speed behind its travel time', () => {
  const result = routing.straightLineEstimate(FARM, AMRAVATI);
  assert.ok(result.assumedSpeedKmph > 0, 'an estimated duration must disclose its assumption');
  assert.equal(
    result.travelTimeMinutes,
    Math.round((result.distanceKm / result.assumedSpeedKmph) * 60)
  );
});

test('routing: the degradation reason is carried through', () => {
  const result = routing.straightLineEstimate(FARM, NAGPUR, 'ROUTING_TIMEOUT');
  assert.equal(result.degradedReason, 'ROUTING_TIMEOUT');
});

test('routing: coordinate validation', () => {
  assert.equal(routing.isValidCoordinate({ lat: 21.0, lon: 79.0 }), true);
  assert.equal(routing.isValidCoordinate({ lat: -33.9, lon: 18.4 }), true);

  assert.equal(routing.isValidCoordinate(null), false);
  assert.equal(routing.isValidCoordinate({}), false);
  assert.equal(routing.isValidCoordinate({ lat: 21 }), false);
  assert.equal(routing.isValidCoordinate({ lat: 'abc', lon: 79 }), false);
  assert.equal(routing.isValidCoordinate({ lat: 91, lon: 79 }), false, 'latitude beyond the pole');
  assert.equal(routing.isValidCoordinate({ lat: 21, lon: 181 }), false, 'longitude off the globe');
  // (0,0) is in the Gulf of Guinea: as farm coordinates it means "unset".
  assert.equal(routing.isValidCoordinate({ lat: 0, lon: 0 }), false);
});

test('routing: missing farm coordinates raise a specific error', async () => {
  await assert.rejects(
    () => routing.getRoute(null, NAGPUR),
    (error) => error.code === 'MISSING_FARM_COORDINATES'
  );
  await assert.rejects(
    () => routing.getRoute({ lat: 0, lon: 0 }, NAGPUR),
    (error) => error.code === 'MISSING_FARM_COORDINATES'
  );
});

test('routing: missing market coordinates raise a specific error', async () => {
  await assert.rejects(
    () => routing.getRoute(FARM, { lat: null, lon: null }),
    (error) => error.code === 'MISSING_MARKET_COORDINATES'
  );
});

test('routing: provider "none" degrades without any network call', async () => {
  const previous = process.env.ROUTING_PROVIDER;
  process.env.ROUTING_PROVIDER = 'none';
  routing.clearRouteCache();

  try {
    const result = await routing.getRoute(FARM, NAGPUR);
    assert.equal(result.method, 'STRAIGHT_LINE_ESTIMATE');
    assert.equal(result.isRoadRoute, false);
    assert.equal(result.degradedReason, 'ROUTING_DISABLED');
    assert.ok(result.distanceKm > 0);
    assert.ok(result.travelTimeMinutes > 0);
  } finally {
    if (previous === undefined) delete process.env.ROUTING_PROVIDER;
    else process.env.ROUTING_PROVIDER = previous;
    routing.clearRouteCache();
  }
});

test('routing: many destinations are all resolved, keyed by id', async () => {
  const previous = process.env.ROUTING_PROVIDER;
  process.env.ROUTING_PROVIDER = 'none';
  routing.clearRouteCache();

  try {
    const destinations = [
      { id: 1, ...NAGPUR },
      { id: 2, ...AMRAVATI },
      { id: 3, lat: 20.745, lon: 78.602 }
    ];
    const routes = await routing.getRoutes(FARM, destinations);

    assert.equal(routes.size, 3);
    for (const destination of destinations) {
      const route = routes.get(destination.id);
      assert.ok(route, `destination ${destination.id} must be present`);
      assert.ok(route.distanceKm > 0);
    }
  } finally {
    if (previous === undefined) delete process.env.ROUTING_PROVIDER;
    else process.env.ROUTING_PROVIDER = previous;
    routing.clearRouteCache();
  }
});

test('routing: one bad destination does not void the rest', async () => {
  const previous = process.env.ROUTING_PROVIDER;
  process.env.ROUTING_PROVIDER = 'none';
  routing.clearRouteCache();

  try {
    const routes = await routing.getRoutes(FARM, [
      { id: 1, ...NAGPUR },
      { id: 2, lat: null, lon: null },
      { id: 3, ...AMRAVATI }
    ]);

    assert.equal(routes.size, 3);
    assert.ok(routes.get(1).distanceKm > 0, 'a good market must still be routed');
    assert.ok(routes.get(3).distanceKm > 0);

    const broken = routes.get(2);
    assert.equal(broken.distanceKm, null, 'an unroutable market must not get a fabricated distance');
    assert.equal(broken.degradedReason, 'MISSING_MARKET_COORDINATES');
  } finally {
    if (previous === undefined) delete process.env.ROUTING_PROVIDER;
    else process.env.ROUTING_PROVIDER = previous;
    routing.clearRouteCache();
  }
});

test('routing: an empty destination list yields an empty map', async () => {
  const routes = await routing.getRoutes(FARM, []);
  assert.equal(routes.size, 0);
});

test('routing: status reports the configured provider', () => {
  const previous = process.env.ROUTING_PROVIDER;
  process.env.ROUTING_PROVIDER = 'osrm';
  try {
    const status = routing.getRoutingStatus();
    assert.equal(status.provider, 'osrm');
    assert.equal(status.configured, true);
    assert.ok(status.fallbackDetourFactor >= 1);
  } finally {
    if (previous === undefined) delete process.env.ROUTING_PROVIDER;
    else process.env.ROUTING_PROVIDER = previous;
  }
});

test('routing: OpenRouteService without a key is reported as unconfigured', () => {
  const previousProvider = process.env.ROUTING_PROVIDER;
  const previousKey = process.env.ORS_API_KEY;
  process.env.ROUTING_PROVIDER = 'openrouteservice';
  delete process.env.ORS_API_KEY;

  try {
    assert.equal(routing.getRoutingStatus().configured, false);
  } finally {
    if (previousProvider === undefined) delete process.env.ROUTING_PROVIDER;
    else process.env.ROUTING_PROVIDER = previousProvider;
    if (previousKey !== undefined) process.env.ORS_API_KEY = previousKey;
  }
});
