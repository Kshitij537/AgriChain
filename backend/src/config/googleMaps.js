/**
 * Google Maps Platform configuration.
 *
 * The API key lives ONLY here, read from the backend environment. It is never
 * sent to the browser, never logged, and never returned in an API response — the
 * React app talks to /api/transport/search, and this backend talks to Google.
 * That indirection is the whole point: a key shipped to the frontend can be
 * lifted from the network tab and billed to this project by anyone.
 *
 * Endpoints are the Places API (NEW), not the legacy Places API. The new API uses
 * field masks, which means we pay only for the fields we actually ask for — so
 * the masks below are deliberately minimal and are defined in one place rather
 * than inline at each call site.
 */

/** Places API (New) base URL. */
const PLACES_BASE_URL = 'https://places.googleapis.com/v1';

/**
 * Field mask for Text Search.
 *
 * Only what is needed to IDENTIFY a business. Phone numbers, websites and
 * ratings are deliberately absent here — they are fetched by Place Details for
 * the handful of results that survive filtering, which is cheaper than paying
 * for contact fields across every search hit.
 */
const TEXT_SEARCH_FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  // primaryType lets us drop obviously irrelevant businesses before spending a
  // Place Details call on them.
  'places.primaryType',
  'places.types'
].join(',');

/**
 * Field mask for Place Details.
 *
 * rating and userRatingCount are included because they help a farmer choose
 * between two unknown transporters. Nothing more expensive is requested.
 */
const PLACE_DETAILS_FIELD_MASK = [
  'id',
  'displayName',
  'formattedAddress',
  'location',
  'nationalPhoneNumber',
  'internationalPhoneNumber',
  'websiteUri',
  'rating',
  'userRatingCount',
  'businessStatus'
].join(',');

/**
 * Reads the API key. Returns null rather than throwing so callers can degrade
 * to "transporter lookup unavailable" instead of crashing the page.
 * @returns {string|null}
 */
const getApiKey = () => {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  return key && key.trim() ? key.trim() : null;
};

/** Whether Google Places lookups can be attempted at all. */
const isConfigured = () => Boolean(getApiKey());

/**
 * Whether the feature is switched on. Lets an operator disable Google calls
 * (and their billing) without removing the key.
 * @returns {boolean}
 */
const isEnabled = () =>
  process.env.TRANSPORT_SEARCH_ENABLED !== 'false' && isConfigured();

const config = {
  PLACES_BASE_URL,
  TEXT_SEARCH_FIELD_MASK,
  PLACE_DETAILS_FIELD_MASK,

  /** Per-request timeout for a Google call. */
  timeoutMs: () => parseInt(process.env.GOOGLE_PLACES_TIMEOUT_MS, 10) || 8000,

  /** Radius of the location bias circle around the mandi, in metres. */
  searchRadiusMetres: () => {
    const value = parseInt(process.env.TRANSPORT_SEARCH_RADIUS_M, 10);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 50000) : 20000;
  },

  /** Transporters returned to the farmer. */
  maxResults: () => {
    const value = parseInt(process.env.TRANSPORT_MAX_RESULTS, 10);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 20) : 8;
  },

  /**
   * Cap on Place Details calls per request. Each one is billed, so this is the
   * cost ceiling for a single farmer search.
   */
  maxDetailLookups: () => {
    const value = parseInt(process.env.TRANSPORT_MAX_DETAIL_LOOKUPS, 10);
    return Number.isFinite(value) && value > 0 ? Math.min(value, 20) : 10;
  },

  /**
   * How long a result may be reused.
   *
   * Google Maps Platform terms permit caching Place IDs indefinitely but limit
   * caching of other Places content to 30 days. This is an in-memory TTL well
   * inside that, and it is NOT a persistent directory of Google businesses —
   * nothing is written to the database. Its purpose is to avoid re-billing the
   * same mandi lookup when a farmer reloads the page.
   */
  cacheTtlMs: () => {
    const value = parseInt(process.env.TRANSPORT_CACHE_TTL_MS, 10);
    return Number.isFinite(value) && value > 0
      ? Math.min(value, 24 * 60 * 60 * 1000)
      : 6 * 60 * 60 * 1000;
  },

  /** Language and region hints for Indian results. */
  languageCode: () => process.env.GOOGLE_PLACES_LANGUAGE || 'en',
  regionCode: () => process.env.GOOGLE_PLACES_REGION || 'IN',

  getApiKey,
  isConfigured,
  isEnabled
};

module.exports = config;
