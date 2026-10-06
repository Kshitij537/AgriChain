/**
 * Road routing service.
 *
 * Answers "how far is this mandi by road, and how long does the trip take?"
 *
 * Routing is a solved deterministic problem, so no ML is involved: the road
 * network is queried from OSRM (or OpenRouteService), both of which return the
 * distance a truck actually drives rather than the straight line a bird flies.
 *
 * WHY THE DISTINCTION MATTERS
 * ---------------------------
 * In Vidarbha the road distance is typically 20-40% longer than the great-circle
 * distance, and that difference is real money in freight. A straight-line figure
 * presented as a road distance would under-quote transport cost and could flip
 * the market ranking. So when routing is unavailable this service still returns
 * a usable number, but labels it:
 *
 *   method = 'OSRM_ROAD'              - real road route
 *   method = 'STRAIGHT_LINE_ESTIMATE' - haversine x detour factor, NOT a route
 *
 * Callers must surface that label; nothing here pretends an estimate is a route.
 *
 * CONFIGURATION
 * -------------
 *   ROUTING_PROVIDER      'osrm' (default) | 'openrouteservice' | 'none'
 *   OSRM_BASE_URL         default https://router.project-osrm.org
 *   ORS_BASE_URL          default https://api.openrouteservice.org
 *   ORS_API_KEY           required only for openrouteservice
 *   ROUTING_TIMEOUT_MS    default 8000
 *   ROUTING_CACHE_TTL_MS  default 86400000 (24h - roads do not move)
 *   ROUTING_DETOUR_FACTOR default 1.3 (fallback only)
 */

const axios = require('axios');

/** Mean Earth radius in km, for the haversine fallback. */
const EARTH_RADIUS_KM = 6371;

/**
 * How much longer a real road is than the straight line, used ONLY by the
 * fallback. 1.3 is the commonly cited circuity factor for Indian district road
 * networks. It is an admitted approximation, which is why the result is labelled.
 */
const DEFAULT_DETOUR_FACTOR = 1.3;

/** Average loaded truck speed on Vidarbha district roads, km/h (fallback only). */
const FALLBACK_AVERAGE_SPEED_KMPH = 35;

const METHOD = {
  OSRM: 'OSRM_ROAD',
  ORS: 'ORS_ROAD',
  ESTIMATE: 'STRAIGHT_LINE_ESTIMATE'
};

/**
 * Route cache. Farm and mandi coordinates are static, so a route computed once
 * stays valid; this keeps a 12-market recommendation from making 12 external
 * calls on every page load.
 */
const _cache = new Map();

const cacheTtlMs = () => parseInt(process.env.ROUTING_CACHE_TTL_MS, 10) || 24 * 60 * 60 * 1000;

/**
 * How long a straight-line FALLBACK is reused before the provider is retried.
 * Deliberately far shorter than cacheTtlMs - see the comment at its use site.
 */
const fallbackCacheMs = () => {
  const value = parseInt(process.env.ROUTING_FALLBACK_CACHE_MS, 10);
  return Number.isFinite(value) && value > 0 ? value : 10 * 1000;
};
const timeoutMs = () => parseInt(process.env.ROUTING_TIMEOUT_MS, 10) || 8000;
const detourFactor = () => {
  const value = parseFloat(process.env.ROUTING_DETOUR_FACTOR);
  return Number.isFinite(value) && value >= 1 ? value : DEFAULT_DETOUR_FACTOR;
};
const provider = () => (process.env.ROUTING_PROVIDER || 'osrm').trim().toLowerCase();

const cacheKey = (from, to, geometry) =>
  `${from.lat.toFixed(4)},${from.lon.toFixed(4)}>${to.lat.toFixed(4)},${to.lon.toFixed(4)}:${geometry ? 'g' : 'n'}`;

const getCached = (key) => {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > cacheTtlMs()) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
};

const setCached = (key, value) => _cache.set(key, { value, at: Date.now() });

/**
 * Validates a coordinate pair.
 * @param {object} point - { lat, lon }
 * @returns {boolean}
 */
const isValidCoordinate = (point) =>
  Boolean(point) &&
  Number.isFinite(Number(point.lat)) &&
  Number.isFinite(Number(point.lon)) &&
  Math.abs(Number(point.lat)) <= 90 &&
  Math.abs(Number(point.lon)) <= 180 &&
  !(Number(point.lat) === 0 && Number(point.lon) === 0);

/**
 * Great-circle distance between two points.
 * @param {object} from - { lat, lon }
 * @param {object} to - { lat, lon }
 * @returns {number} km
 */
const haversineKm = (from, to) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLon = toRad(to.lon - from.lon);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.lat)) * Math.cos(toRad(to.lat)) * Math.sin(dLon / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/**
 * Straight-line fallback, explicitly labelled as an estimate.
 *
 * @param {object} from - { lat, lon }
 * @param {object} to - { lat, lon }
 * @param {string} [reason] - why routing was unavailable
 * @returns {object} route result with isRoadRoute = false
 */
const straightLineEstimate = (from, to, reason = 'ROUTING_UNAVAILABLE') => {
  const straightKm = haversineKm(from, to);
  const distanceKm = Math.round(straightKm * detourFactor() * 10) / 10;
  return {
    distanceKm,
    straightLineKm: Math.round(straightKm * 10) / 10,
    travelTimeMinutes: Math.round((distanceKm / FALLBACK_AVERAGE_SPEED_KMPH) * 60),
    routeGeometry: null,
    method: METHOD.ESTIMATE,
    isRoadRoute: false,
    provider: null,
    // Non-null so the API can explain to the farmer why the number is soft.
    degradedReason: reason,
    detourFactorApplied: detourFactor(),
    assumedSpeedKmph: FALLBACK_AVERAGE_SPEED_KMPH
  };
};

/**
 * Queries an OSRM route server.
 *
 * The public demo server (router.project-osrm.org) is rate limited and is fine
 * for a demo but should be replaced with a self-hosted instance for real load.
 *
 * @param {object} from - { lat, lon }
 * @param {object} to - { lat, lon }
 * @param {boolean} withGeometry
 * @returns {Promise<object>} route result
 */
const routeViaOsrm = async (from, to, withGeometry) => {
  const baseUrl = (process.env.OSRM_BASE_URL || 'https://router.project-osrm.org').replace(/\/+$/, '');
  // OSRM takes lon,lat order.
  const coords = `${from.lon},${from.lat};${to.lon},${to.lat}`;
  const url = `${baseUrl}/route/v1/driving/${coords}`;

  const response = await axios.get(url, {
    params: {
      overview: withGeometry ? 'simplified' : 'false',
      geometries: 'geojson',
      alternatives: 'false',
      steps: 'false'
    },
    timeout: timeoutMs()
  });

  const data = response.data;
  if (!data || data.code !== 'Ok' || !Array.isArray(data.routes) || !data.routes.length) {
    const err = new Error(`OSRM returned no route (code=${data && data.code})`);
    err.code = 'ROUTE_NOT_FOUND';
    throw err;
  }

  const route = data.routes[0];
  return {
    distanceKm: Math.round((route.distance / 1000) * 10) / 10,
    straightLineKm: Math.round(haversineKm(from, to) * 10) / 10,
    travelTimeMinutes: Math.round(route.duration / 60),
    routeGeometry: withGeometry && route.geometry ? route.geometry : null,
    method: METHOD.OSRM,
    isRoadRoute: true,
    provider: 'OSRM',
    degradedReason: null
  };
};

/**
 * Queries OpenRouteService. Used when ROUTING_PROVIDER=openrouteservice.
 *
 * @param {object} from - { lat, lon }
 * @param {object} to - { lat, lon }
 * @param {boolean} withGeometry
 * @returns {Promise<object>} route result
 */
const routeViaOrs = async (from, to, withGeometry) => {
  const apiKey = process.env.ORS_API_KEY;
  if (!apiKey) {
    const err = new Error('ORS_API_KEY is not configured');
    err.code = 'ROUTING_NOT_CONFIGURED';
    throw err;
  }

  const baseUrl = (process.env.ORS_BASE_URL || 'https://api.openrouteservice.org').replace(/\/+$/, '');
  const response = await axios.post(
    `${baseUrl}/v2/directions/driving-hgv/geojson`,
    { coordinates: [[from.lon, from.lat], [to.lon, to.lat]] },
    {
      headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
      timeout: timeoutMs()
    }
  );

  const feature = response.data && response.data.features && response.data.features[0];
  const summary = feature && feature.properties && feature.properties.summary;
  if (!summary || !Number.isFinite(summary.distance)) {
    const err = new Error('OpenRouteService returned no usable route');
    err.code = 'ROUTE_NOT_FOUND';
    throw err;
  }

  return {
    distanceKm: Math.round((summary.distance / 1000) * 10) / 10,
    straightLineKm: Math.round(haversineKm(from, to) * 10) / 10,
    travelTimeMinutes: Math.round(summary.duration / 60),
    routeGeometry: withGeometry ? feature.geometry || null : null,
    method: METHOD.ORS,
    isRoadRoute: true,
    provider: 'OpenRouteService',
    degradedReason: null
  };
};

/**
 * Computes the farm-to-market road route.
 *
 * Never throws for an operational failure: a routing outage degrades to a
 * clearly labelled straight-line estimate so the recommendation still answers
 * the farmer's question. Invalid coordinates DO throw, because that is a
 * programming/data error the caller must handle rather than paper over.
 *
 * @param {object} from - farm { lat, lon }
 * @param {object} to - market { lat, lon }
 * @param {object} [options] - { includeGeometry }
 * @returns {Promise<object>} { distanceKm, travelTimeMinutes, routeGeometry, method, isRoadRoute, ... }
 */
const getRoute = async (from, to, { includeGeometry = false } = {}) => {
  if (!isValidCoordinate(from)) {
    const err = new Error('Farm coordinates are missing or invalid');
    err.code = 'MISSING_FARM_COORDINATES';
    throw err;
  }
  if (!isValidCoordinate(to)) {
    const err = new Error('Market coordinates are missing or invalid');
    err.code = 'MISSING_MARKET_COORDINATES';
    throw err;
  }

  const origin = { lat: Number(from.lat), lon: Number(from.lon) };
  const destination = { lat: Number(to.lat), lon: Number(to.lon) };

  const key = cacheKey(origin, destination, includeGeometry);
  const cached = getCached(key);
  if (cached) return cached;

  const selected = provider();
  if (selected === 'none') {
    const result = straightLineEstimate(origin, destination, 'ROUTING_DISABLED');
    setCached(key, result);
    return result;
  }

  try {
    const result =
      selected === 'openrouteservice'
        ? await routeViaOrs(origin, destination, includeGeometry)
        : await routeViaOsrm(origin, destination, includeGeometry);
    setCached(key, result);
    return result;
  } catch (error) {
    const reason =
      error.code === 'ROUTE_NOT_FOUND'
        ? 'ROUTE_NOT_FOUND'
        : error.code === 'ROUTING_NOT_CONFIGURED'
          ? 'ROUTING_NOT_CONFIGURED'
          : error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')
            ? 'ROUTING_TIMEOUT'
            : 'ROUTING_API_FAILED';

    console.warn(`[Routing] ${reason} for ${key}: ${error.message} - falling back to straight-line estimate`);
    const result = straightLineEstimate(origin, destination, reason);

    // Cache the fallback only VERY briefly.
    //
    // It is cached at all so a burst of a dozen markets in one recommendation
    // does not each wait out the same timeout. But it must expire fast: the usual
    // cause is one slow response from the free public OSRM server, and a farmer
    // who reloads should get real road distances rather than being pinned to
    // labelled estimates. Successful routes keep the full 24-hour TTL.
    setCached(key, result);
    setTimeout(() => _cache.delete(key), fallbackCacheMs()).unref?.();
    return result;
  }
};

/**
 * Routes one origin to many destinations.
 *
 * Runs with bounded concurrency rather than all at once: the public OSRM demo
 * server rate-limits bursts, and a 429 would silently degrade every market to
 * an estimate.
 *
 * @param {object} from - farm { lat, lon }
 * @param {Array} destinations - [{ id, lat, lon }]
 * @param {object} [options] - { includeGeometry, concurrency }
 * @returns {Promise<Map<any, object>>} keyed by destination id
 */
const getRoutes = async (from, destinations, { includeGeometry = false, concurrency = 4 } = {}) => {
  const results = new Map();
  const queue = [...(destinations || [])];

  const worker = async () => {
    while (queue.length) {
      const destination = queue.shift();
      if (!destination) break;
      try {
        const route = await getRoute(from, destination, { includeGeometry });
        results.set(destination.id, route);
      } catch (error) {
        // Only coordinate errors reach here; record them per-destination so one
        // mandi with a bad row cannot void the whole recommendation.
        results.set(destination.id, {
          distanceKm: null,
          travelTimeMinutes: null,
          routeGeometry: null,
          method: null,
          isRoadRoute: false,
          provider: null,
          degradedReason: error.code || 'ROUTING_FAILED',
          error: error.message
        });
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker)
  );

  return results;
};

/**
 * Reports routing configuration for health checks.
 * @returns {object}
 */
const getRoutingStatus = () => ({
  provider: provider(),
  configured: provider() === 'osrm' || (provider() === 'openrouteservice' && Boolean(process.env.ORS_API_KEY)),
  baseUrl:
    provider() === 'openrouteservice'
      ? process.env.ORS_BASE_URL || 'https://api.openrouteservice.org'
      : process.env.OSRM_BASE_URL || 'https://router.project-osrm.org',
  cachedRoutes: _cache.size,
  fallbackDetourFactor: detourFactor()
});

/** Clears the route cache. Exposed for tests. */
const clearRouteCache = () => _cache.clear();

module.exports = {
  METHOD,
  getRoute,
  getRoutes,
  haversineKm,
  straightLineEstimate,
  isValidCoordinate,
  getRoutingStatus,
  clearRouteCache
};
