/**
 * Google Places API (New) client.
 *
 * The ONLY module in this codebase that talks to Google. It is a thin transport
 * layer: it issues Text Search and Place Details requests, maps Google's error
 * shapes onto our own codes, and hands raw-but-validated place objects upward.
 * It contains no AgriChain business logic — filtering, ranking, distance and cost
 * all live in transportService.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * - It does not scrape Google Maps or Google Search result pages. Every call is
 *   to the documented Places API (New) with an API key.
 * - It does not bulk-download or mirror Google's business directory. Searches are
 *   made on demand for one mandi at a time, and results are held in memory only.
 * - It does not invent a field Google did not return. A missing phone number
 *   stays null and is rendered as "Phone number not listed" by the UI.
 *
 * ATTRIBUTION
 * Places content displayed to a user requires Google attribution. The response
 * carries `attribution` so the UI always has the text it needs to show.
 */

const axios = require('axios');
const googleMaps = require('../config/googleMaps');

/** Error codes this module raises, so callers can degrade precisely. */
const PLACES_ERROR = {
  NOT_CONFIGURED: 'PLACES_NOT_CONFIGURED',
  DISABLED: 'PLACES_DISABLED',
  AUTH: 'PLACES_AUTH_FAILED',
  RATE_LIMITED: 'PLACES_RATE_LIMITED',
  INVALID_REQUEST: 'PLACES_INVALID_REQUEST',
  UNAVAILABLE: 'PLACES_UNAVAILABLE',
  TIMEOUT: 'PLACES_TIMEOUT',
  UNKNOWN: 'PLACES_ERROR'
};

/** Attribution string required when displaying Places content. */
const ATTRIBUTION = 'Business details powered by Google';

/**
 * Builds a typed error.
 * @param {string} code
 * @param {string} message
 * @param {number} [httpStatus]
 * @returns {Error}
 */
const placesError = (code, message, httpStatus = null) => {
  const error = new Error(message);
  error.code = code;
  if (httpStatus) error.httpStatus = httpStatus;
  return error;
};

/**
 * Translates a failed Google call into one of our codes.
 *
 * Google's own messages can name the project or the key, so they are logged but
 * never forwarded to the client verbatim.
 *
 * @param {Error} error - axios error
 * @returns {Error}
 */
const mapGoogleError = (error) => {
  if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
    return placesError(PLACES_ERROR.TIMEOUT, 'Google Places did not respond in time');
  }
  if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
    return placesError(PLACES_ERROR.UNAVAILABLE, 'Could not reach Google Places');
  }

  const status = error.response && error.response.status;
  const googleMessage =
    (error.response && error.response.data && error.response.data.error
      && error.response.data.error.message) || error.message;

  // Logged for the operator; not returned to the farmer.
  console.error(`[Google Places] HTTP ${status || '?'}: ${googleMessage}`);

  if (status === 400) {
    return placesError(PLACES_ERROR.INVALID_REQUEST, 'Google Places rejected the request', 400);
  }
  if (status === 401 || status === 403) {
    return placesError(
      PLACES_ERROR.AUTH,
      'Google Places rejected the API key. Check GOOGLE_MAPS_API_KEY, that the ' +
      '"Places API (New)" is enabled for the project, and that billing is active.',
      status
    );
  }
  if (status === 429) {
    return placesError(PLACES_ERROR.RATE_LIMITED, 'Google Places quota or rate limit reached', 429);
  }
  if (status && status >= 500) {
    return placesError(PLACES_ERROR.UNAVAILABLE, 'Google Places is temporarily unavailable', status);
  }

  return placesError(PLACES_ERROR.UNKNOWN, 'Google Places request failed', status || undefined);
};

/**
 * Standard headers for a Places API (New) call.
 * @param {string} fieldMask
 * @returns {object}
 */
const headersFor = (fieldMask) => {
  const apiKey = googleMaps.getApiKey();
  if (!apiKey) {
    throw placesError(
      PLACES_ERROR.NOT_CONFIGURED,
      'GOOGLE_MAPS_API_KEY is not set in the backend environment'
    );
  }
  return {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': apiKey,
    'X-Goog-FieldMask': fieldMask
  };
};

/**
 * Runs one Text Search (New) query, biased to a circle around the mandi.
 *
 * The location bias is what makes the results useful: an unbiased search for
 * "goods transport" returns businesses countrywide, whereas a farmer needs
 * operators who actually work out of this yard.
 *
 * @param {object} input
 * @param {string} input.textQuery - e.g. "tempo transport service near Nagpur APMC"
 * @param {number} input.latitude - mandi latitude, for the bias circle
 * @param {number} input.longitude - mandi longitude
 * @param {number} [input.radiusMetres]
 * @param {number} [input.maxResultCount]
 * @returns {Promise<Array>} raw place objects (may be empty)
 * @throws {Error} one of PLACES_ERROR
 */
const textSearch = async ({
  textQuery,
  latitude,
  longitude,
  radiusMetres = null,
  maxResultCount = 10
} = {}) => {
  if (!textQuery || typeof textQuery !== 'string') {
    throw placesError(PLACES_ERROR.INVALID_REQUEST, 'textQuery is required');
  }
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    throw placesError(PLACES_ERROR.INVALID_REQUEST, 'Valid market coordinates are required');
  }

  const body = {
    textQuery,
    languageCode: googleMaps.languageCode(),
    regionCode: googleMaps.regionCode(),
    maxResultCount: Math.min(Math.max(1, maxResultCount), 20),
    locationBias: {
      circle: {
        center: { latitude: Number(latitude), longitude: Number(longitude) },
        radius: radiusMetres || googleMaps.searchRadiusMetres()
      }
    }
  };

  try {
    const response = await axios.post(
      `${googleMaps.PLACES_BASE_URL}/places:searchText`,
      body,
      {
        headers: headersFor(googleMaps.TEXT_SEARCH_FIELD_MASK),
        timeout: googleMaps.timeoutMs()
      }
    );

    // An empty result set is a normal outcome, not an error: a small rural mandi
    // may genuinely have no listed transport business nearby.
    return Array.isArray(response.data && response.data.places) ? response.data.places : [];
  } catch (error) {
    if (error.code && String(error.code).startsWith('PLACES_')) throw error;
    throw mapGoogleError(error);
  }
};

/**
 * Fetches contact details for one place.
 *
 * Separate from Text Search on purpose: contact fields are a more expensive SKU,
 * so they are only bought for places that survived filtering and ranking.
 *
 * @param {string} placeId - Google Place ID
 * @returns {Promise<object|null>} place details, or null when Google has no record
 * @throws {Error} one of PLACES_ERROR
 */
const placeDetails = async (placeId) => {
  if (!placeId || typeof placeId !== 'string') {
    throw placesError(PLACES_ERROR.INVALID_REQUEST, 'placeId is required');
  }

  try {
    const response = await axios.get(
      `${googleMaps.PLACES_BASE_URL}/places/${encodeURIComponent(placeId)}`,
      {
        headers: headersFor(googleMaps.PLACE_DETAILS_FIELD_MASK),
        params: {
          languageCode: googleMaps.languageCode(),
          regionCode: googleMaps.regionCode()
        },
        timeout: googleMaps.timeoutMs()
      }
    );
    return response.data || null;
  } catch (error) {
    if (error.code && String(error.code).startsWith('PLACES_')) throw error;
    // A single place failing must not sink the whole search; 404 means the
    // listing disappeared between the search and the detail call.
    if (error.response && error.response.status === 404) return null;
    throw mapGoogleError(error);
  }
};

/**
 * Fetches details for several places with bounded concurrency.
 *
 * Individual failures are swallowed and reported in `failures` rather than
 * thrown, so one dead listing cannot empty the farmer's result list. An auth or
 * rate-limit failure IS rethrown, because it will affect every call and the
 * caller needs to know the whole lookup is unavailable.
 *
 * @param {Array<string>} placeIds
 * @param {number} [concurrency]
 * @returns {Promise<{details: Array, failures: number}>}
 */
const placeDetailsBatch = async (placeIds, concurrency = 4) => {
  const details = [];
  let failures = 0;
  let fatal = null;

  const queue = [...(placeIds || [])];

  const worker = async () => {
    while (queue.length && !fatal) {
      const placeId = queue.shift();
      if (!placeId) break;
      try {
        const detail = await placeDetails(placeId);
        if (detail) details.push(detail);
        else failures += 1;
      } catch (error) {
        // Key and quota problems are systemic: stop rather than burning through
        // the remaining ids making identical failing calls.
        if (error.code === PLACES_ERROR.AUTH || error.code === PLACES_ERROR.RATE_LIMITED) {
          fatal = error;
          return;
        }
        failures += 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker)
  );

  if (fatal) throw fatal;
  return { details, failures };
};

module.exports = {
  textSearch,
  placeDetails,
  placeDetailsBatch,
  mapGoogleError,
  PLACES_ERROR,
  ATTRIBUTION
};
