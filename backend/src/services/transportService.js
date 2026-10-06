/**
 * Transporter discovery service.
 *
 * Finds transport businesses near a recommended mandi and attaches AgriChain's
 * own trip-cost estimate to each one.
 *
 * WHAT COMES FROM WHERE — read this before changing anything
 * ---------------------------------------------------------
 * Two completely separate kinds of information are combined here, and conflating
 * them would mislead a farmer into thinking a named business quoted them a price:
 *
 *   FROM GOOGLE PLACES   who the business is: name, address, phone, website,
 *                        coordinates, rating. Nothing else.
 *
 *   FROM AGRICHAIN       the estimated trip cost, computed by the existing
 *                        transportCostService from the FARM-to-MANDI road
 *                        distance and the configured per-km rates. Google has no
 *                        knowledge of it.
 *
 * So every transporter carries `estimatedTripCost` (ours, clearly labelled) and
 * `quotedPrice: null` (theirs, which we do not have). Availability is likewise
 * always `contact_to_confirm` — Google Places does not publish whether a vehicle
 * is free today, and claiming otherwise would send a farmer on a wasted trip.
 *
 * REUSE
 * No routing, distance or freight logic is duplicated here:
 *   routingService        farm -> mandi road distance, and transporter -> mandi
 *   transportCostService  the single source of truth for freight rupees
 *   marketService         mandi coordinates
 */

const googlePlaces = require('./googlePlacesService');
const googleMaps = require('../config/googleMaps');
const routingService = require('./routingService');
const transportCostService = require('./transportCostService');
const marketService = require('./marketService');

/** Engine identity, recorded on responses for traceability. */
const ENGINE_VERSION = 'transport_discovery_v1';

/**
 * Availability is never asserted. Google Places has no vehicle-availability
 * feed, so this is the only value a Google-sourced transporter can carry.
 */
const AVAILABILITY = {
  CONTACT_TO_CONFIRM: 'contact_to_confirm'
};

/**
 * Query templates, run against the selected mandi.
 *
 * Several focused queries beat one broad one: Indian goods transporters list
 * themselves under inconsistent categories, and "tempo" finds a different set of
 * businesses than "logistics". Results are deduplicated by Place ID afterwards.
 */
const QUERY_TEMPLATES = [
  'goods transport service near {market}',
  'tempo transport near {market}',
  'mini truck transport service near {market}',
  'logistics and transport company near {market}'
];

/**
 * Words that indicate a business actually moves goods.
 *
 * Text Search is a fuzzy match, so a query for "transport near X" happily
 * returns car showrooms, travel agents and packers of household goods. A name or
 * type must show one of these for the business to be offered to a farmer.
 */
const RELEVANT_NAME_TERMS = [
  'transport', 'roadways', 'roadlines', 'road lines', 'carrier', 'carriers',
  'logistic', 'logistics', 'freight', 'cargo', 'tempo', 'truck', 'trucking',
  'goods', 'courier', 'parcel', 'movers', 'haulage', 'transporter'
];

/** Google place types that correspond to moving goods. */
const RELEVANT_PLACE_TYPES = [
  'moving_company', 'storage', 'courier_service', 'freight_forwarding_service',
  'trucking_company', 'logistics_service', 'shipping_service'
];

/**
 * Businesses to exclude even when their name contains a relevant term.
 *
 * "Tempo Traveller" hire is passenger transport, and a farmer looking for a goods
 * tempo does not want a tourist minibus. Likewise bus and taxi operators.
 */
const EXCLUDED_TERMS = [
  // 'travel' as a stem, not 'travels': it must also catch "Tempo Travellers",
  // which contains "tempo" and would otherwise pass the relevance check while
  // being a tourist minibus operator.
  'travel', 'tours', 'tour ', 'taxi', 'cab ', 'cabs',
  'bus service', 'bus stand', 'car rental', 'rent a car', 'driving school',
  'railway station', 'petrol', 'showroom'
];

/**
 * In-memory result cache.
 *
 * Purpose is cost control, not data collection: without it, every page reload
 * would re-bill a Text Search plus up to ten Place Details calls for the same
 * mandi. Nothing is persisted to the database — see googleMaps.cacheTtlMs for the
 * Google terms this stays inside.
 */
const _cache = new Map();

const cacheKey = (marketId, quantityKg, vehicleType) =>
  `${marketId}:${Math.round(Number(quantityKg) || 0)}:${vehicleType || 'auto'}`;

const getCached = (key) => {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > googleMaps.cacheTtlMs()) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
};

/** Clears the transporter cache. Exposed for tests and operations. */
const clearTransportCache = () => _cache.clear();

/**
 * Decides whether a Google result is a goods transporter worth showing.
 *
 * @param {object} place - raw place from Text Search
 * @returns {boolean}
 */
const isRelevantTransporter = (place) => {
  const name = String(
    (place.displayName && place.displayName.text) || place.name || ''
  ).toLowerCase();
  const types = [place.primaryType, ...(place.types || [])]
    .filter(Boolean)
    .map((t) => String(t).toLowerCase());

  if (!name) return false;

  // Permanently closed businesses are worse than no result.
  if (place.businessStatus && place.businessStatus !== 'OPERATIONAL') return false;

  const excluded = EXCLUDED_TERMS.some((term) => name.includes(term));
  const nameMatches = RELEVANT_NAME_TERMS.some((term) => name.includes(term));
  const typeMatches = types.some((t) => RELEVANT_PLACE_TYPES.includes(t));

  // A relevant type can rescue a business whose name gives nothing away
  // ("Shree Balaji & Sons"), but an excluded term always wins — a place called
  // "Sharma Travels" is not a goods carrier however Google categorises it.
  if (excluded) return false;
  return nameMatches || typeMatches;
};

/**
 * Runs every query template and merges the results, deduplicated by Place ID.
 *
 * A single query failing does not fail the search; only a systemic failure
 * (bad key, quota exhausted) propagates, because that affects all of them.
 *
 * @param {object} market - { name, district, latitude, longitude }
 * @returns {Promise<{places: Map<string, object>, queriesRun: number, queriesFailed: number, lastError: Error|null}>}
 */
const discoverPlaces = async (market) => {
  const locationLabel = market.district
    ? `${market.name}, ${market.district}`
    : market.name;

  const places = new Map();
  let queriesRun = 0;
  let queriesFailed = 0;
  let lastError = null;

  for (const template of QUERY_TEMPLATES) {
    const textQuery = template.replace('{market}', locationLabel);
    try {
      const results = await googlePlaces.textSearch({
        textQuery,
        latitude: market.latitude,
        longitude: market.longitude,
        maxResultCount: 10
      });
      queriesRun += 1;

      for (const place of results) {
        if (!place.id || places.has(place.id)) continue;
        if (!isRelevantTransporter(place)) continue;
        places.set(place.id, place);
      }
    } catch (error) {
      queriesFailed += 1;
      lastError = error;
      // A bad key or an exhausted quota will fail every remaining query too.
      if (
        error.code === googlePlaces.PLACES_ERROR.AUTH ||
        error.code === googlePlaces.PLACES_ERROR.RATE_LIMITED ||
        error.code === googlePlaces.PLACES_ERROR.NOT_CONFIGURED
      ) {
        throw error;
      }
    }
  }

  return { places, queriesRun, queriesFailed, lastError };
};

/**
 * Normalises a Google place into AgriChain's transporter shape.
 *
 * Absent fields stay null. Nothing is substituted, inferred or invented — the UI
 * renders "Phone number not listed" from a null, which is honest, whereas a
 * plausible-looking placeholder number would be actively harmful.
 *
 * @param {object} detail - Place Details response
 * @param {object} market - the selected mandi
 * @param {object} tripCost - result from transportCostService (farm -> mandi)
 * @returns {object|null}
 */
const normaliseTransporter = (detail, market, tripCost) => {
  if (!detail || !detail.id) return null;

  const latitude = detail.location && Number.isFinite(detail.location.latitude)
    ? detail.location.latitude
    : null;
  const longitude = detail.location && Number.isFinite(detail.location.longitude)
    ? detail.location.longitude
    : null;

  // Straight-line separation between the business and the mandi. Deliberately
  // NOT a road route: it answers "is this operator local to the yard?", a
  // proximity question, and routing a dozen businesses would add a dozen
  // external calls for no better answer. It is labelled as such.
  let distanceFromMarketKm = null;
  if (latitude !== null && longitude !== null) {
    distanceFromMarketKm = Math.round(
      routingService.haversineKm(
        { lat: market.latitude, lon: market.longitude },
        { lat: latitude, lon: longitude }
      ) * 10
    ) / 10;
  }

  const phone = detail.nationalPhoneNumber || detail.internationalPhoneNumber || null;

  return {
    placeId: detail.id,
    name: (detail.displayName && detail.displayName.text) || 'Unnamed transport business',
    address: detail.formattedAddress || null,
    phone,
    phoneInternational: detail.internationalPhoneNumber || null,
    website: detail.websiteUri || null,
    latitude,
    longitude,

    distanceFromMarketKm,
    distanceBasis: 'STRAIGHT_LINE',

    rating: Number.isFinite(detail.rating) ? detail.rating : null,
    userRatingCount: Number.isFinite(detail.userRatingCount) ? detail.userRatingCount : null,

    // --- what Google does NOT tell us -------------------------------------
    // Google Places has no vehicle-availability feed and no price feed. These
    // fields exist to make that absence explicit rather than leaving the UI to
    // guess, and they must never be populated from a Google response.
    availability: AVAILABILITY.CONTACT_TO_CONFIRM,
    availabilityNote: 'Contact to confirm availability',
    quotedPrice: null,
    vehicleType: null,
    vehicleCapacityKg: null,
    // A Google business category of "transport" says nothing about which vehicle
    // this operator actually owns, so the label stays generic.
    serviceLabel: 'Transport service',

    // --- AgriChain's own estimate, clearly attributed ---------------------
    estimatedTripCost: tripCost ? tripCost.totalCost : null,
    estimatedTripCostBasis: tripCost
      ? `AgriChain rate estimate for ${tripCost.distanceKm} km farm-to-mandi ` +
        `(${tripCost.vehicle.label}, ₹${tripCost.vehicle.ratePerKm}/km)`
      : null,

    source: 'google_places'
  };
};

/**
 * Finds transporters near a mandi and attaches the AgriChain trip estimate.
 *
 * NEVER THROWS for an operational failure. The market recommendation must keep
 * working when Google does not, so a failure returns `available: false` with a
 * reason and a farmer-safe message, and the estimated trip cost — which does not
 * depend on Google at all — is still included.
 *
 * @param {object} input
 * @param {string|number} input.marketId - markets.id or market_code
 * @param {object} [input.market] - pre-resolved market, to skip the DB lookup
 * @param {number} [input.quantityKg] - drives vehicle selection for the estimate
 * @param {object} [input.farm] - { latitude, longitude } for the trip distance
 * @param {string} [input.vehicleType]
 * @param {string} [input.requestId]
 * @returns {Promise<object>} the transport payload
 */
const findTransporters = async ({
  marketId,
  market: providedMarket = null,
  quantityKg = null,
  farm = null,
  vehicleType = null,
  requestId = null
} = {}) => {
  const log = (message) =>
    console.log(`[Transport]${requestId ? ` [${requestId}]` : ''} ${message}`);

  // --- 1. resolve the mandi -------------------------------------------------
  const market = providedMarket || (await marketService.getMarketById(marketId));

  if (!market) {
    const error = new Error(`No market found matching "${marketId}".`);
    error.code = 'MARKET_NOT_FOUND';
    throw error;
  }
  if (market.latitude === null || market.longitude === null) {
    const error = new Error(
      `${market.name} has no saved coordinates, so nearby transporters cannot be found.`
    );
    error.code = 'MISSING_MARKET_COORDINATES';
    throw error;
  }

  const marketSummary = {
    id: market.marketCode || String(market.id),
    marketId: market.id,
    name: market.name,
    district: market.district,
    latitude: Number(market.latitude),
    longitude: Number(market.longitude)
  };

  // --- 2. AgriChain's own trip estimate ------------------------------------
  // Computed first and independently: it is what the farmer still gets when
  // Google fails, and it is the number every transporter card displays.
  const tripEstimate = await estimateTripCost({
    market: marketSummary,
    farm,
    quantityKg,
    vehicleType
  });

  // --- 3. Google Places lookup --------------------------------------------
  if (!googleMaps.isEnabled()) {
    const reason = googleMaps.isConfigured()
      ? 'TRANSPORT_SEARCH_DISABLED'
      : googlePlaces.PLACES_ERROR.NOT_CONFIGURED;
    log(`transporter lookup skipped: ${reason}`);
    return {
      market: marketSummary,
      transporters: [],
      available: false,
      reason,
      message: googleMaps.isConfigured()
        ? 'Transporter lookup is switched off for this deployment.'
        : 'Transporter lookup is not configured on this server.',
      tripEstimate,
      attribution: null,
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    };
  }

  const key = cacheKey(marketSummary.id, tripEstimate ? tripEstimate.quantityKg : 0, vehicleType);
  const cached = getCached(key);
  if (cached) {
    log(`cache hit for ${marketSummary.name} (${cached.transporters.length} transporters)`);
    return { ...cached, tripEstimate, fromCache: true };
  }

  let discovery;
  try {
    discovery = await discoverPlaces(marketSummary);
  } catch (error) {
    log(`lookup failed: ${error.code} — recommendation and cost estimate unaffected`);
    return {
      market: marketSummary,
      transporters: [],
      available: false,
      reason: error.code || googlePlaces.PLACES_ERROR.UNKNOWN,
      message: farmerSafeMessage(error.code),
      tripEstimate,
      attribution: null,
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    };
  }

  // Every query failed for a non-systemic reason (timeouts, transient 5xx), so
  // discoverPlaces returned empty without throwing. That is NOT the same as "no
  // transporters exist near this mandi" — telling a farmer there are none when we
  // never actually got an answer is a false statement about the world. Report it
  // as unavailable instead, which keeps the message honest and the retry sensible.
  if (discovery.queriesRun === 0 && discovery.queriesFailed > 0) {
    const reason = (discovery.lastError && discovery.lastError.code)
      || googlePlaces.PLACES_ERROR.UNAVAILABLE;
    log(`all ${discovery.queriesFailed} lookup(s) failed (${reason}) — reporting unavailable`);
    return {
      market: marketSummary,
      transporters: [],
      available: false,
      reason,
      message: farmerSafeMessage(reason),
      tripEstimate,
      attribution: null,
      diagnostics: {
        queriesRun: 0,
        queriesFailed: discovery.queriesFailed,
        rawResults: 0
      },
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    };
  }

  const candidates = Array.from(discovery.places.values());
  log(
    `${candidates.length} relevant place(s) from ${discovery.queriesRun} query/queries ` +
    `near ${marketSummary.name}`
  );

  if (!candidates.length) {
    const payload = {
      market: marketSummary,
      transporters: [],
      available: true,
      reason: 'NO_RESULTS',
      message:
        'No transport services found nearby. Try contacting local transport operators, ' +
        'or check another nearby market.',
      tripEstimate,
      attribution: googlePlaces.ATTRIBUTION,
      diagnostics: {
        queriesRun: discovery.queriesRun,
        queriesFailed: discovery.queriesFailed,
        rawResults: 0
      },
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    };
    _cache.set(key, { value: payload, at: Date.now() });
    return payload;
  }

  // --- 4. rank, then buy details only for what we will show ---------------
  // Nearest first: Place Details is billed per call, so the cap is applied
  // before spending, and the businesses most useful to the farmer are the ones
  // paid for.
  const ranked = candidates
    .map((place) => ({
      place,
      approxKm: place.location
        ? routingService.haversineKm(
          { lat: marketSummary.latitude, lon: marketSummary.longitude },
          { lat: place.location.latitude, lon: place.location.longitude }
        )
        : Number.MAX_SAFE_INTEGER
    }))
    .sort((a, b) => a.approxKm - b.approxKm)
    .slice(0, googleMaps.maxDetailLookups());

  let detailResult;
  try {
    detailResult = await googlePlaces.placeDetailsBatch(ranked.map((r) => r.place.id));
  } catch (error) {
    log(`detail lookup failed: ${error.code}`);
    return {
      market: marketSummary,
      transporters: [],
      available: false,
      reason: error.code || googlePlaces.PLACES_ERROR.UNKNOWN,
      message: farmerSafeMessage(error.code),
      tripEstimate,
      attribution: null,
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    };
  }

  const transporters = detailResult.details
    .map((detail) => normaliseTransporter(detail, marketSummary, tripEstimate))
    .filter(Boolean)
    // Re-check relevance against the detailed record, which carries the
    // canonical name and business status.
    .filter((t) => isRelevantTransporter({
      displayName: { text: t.name },
      businessStatus: 'OPERATIONAL'
    }))
    .sort((a, b) => {
      // Closest first; a business with no coordinates goes last.
      const left = a.distanceFromMarketKm ?? Number.MAX_SAFE_INTEGER;
      const right = b.distanceFromMarketKm ?? Number.MAX_SAFE_INTEGER;
      return left - right;
    })
    .slice(0, googleMaps.maxResults());

  const payload = {
    market: marketSummary,
    transporters,
    available: true,
    reason: transporters.length ? null : 'NO_RESULTS',
    message: transporters.length
      ? null
      : 'No transport services found nearby. Try contacting local transport operators, ' +
        'or check another nearby market.',
    tripEstimate,
    // Required whenever Places content is displayed.
    attribution: googlePlaces.ATTRIBUTION,
    disclaimer:
      'Transport costs are AgriChain estimates. Contact the transporter for their final ' +
      'price and to confirm vehicle availability.',
    diagnostics: {
      queriesRun: discovery.queriesRun,
      queriesFailed: discovery.queriesFailed,
      rawResults: candidates.length,
      detailsFetched: detailResult.details.length,
      detailsFailed: detailResult.failures
    },
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString()
  };

  _cache.set(key, { value: payload, at: Date.now() });
  log(`returning ${transporters.length} transporter(s) for ${marketSummary.name}`);
  return payload;
};

/**
 * AgriChain's estimated cost of the farm-to-mandi trip.
 *
 * This is the SAME calculation the market recommendation uses — the existing
 * routingService for the road distance and transportCostService for the rupees —
 * so the figure on a transporter card cannot disagree with the figure in the
 * net-return ledger.
 *
 * Returns null only when there is no way to know the distance (no farm location
 * supplied), rather than guessing one.
 *
 * @param {object} input - { market, farm, quantityKg, vehicleType }
 * @returns {Promise<object|null>}
 */
const estimateTripCost = async ({ market, farm, quantityKg, vehicleType } = {}) => {
  const quantity = Number(quantityKg);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;

  if (!farm || !routingService.isValidCoordinate({ lat: farm.latitude, lon: farm.longitude })) {
    return null;
  }

  try {
    const route = await routingService.getRoute(
      { lat: Number(farm.latitude), lon: Number(farm.longitude) },
      { lat: market.latitude, lon: market.longitude }
    );

    const cost = await transportCostService.calculateTransportCost({
      distanceKm: route.distanceKm,
      quantityKg: quantity,
      vehicleType
    });

    return {
      totalCost: cost.totalCost,
      quantityKg: quantity,
      distanceKm: route.distanceKm,
      travelTimeMinutes: route.travelTimeMinutes,
      isRoadRoute: route.isRoadRoute,
      routeMethod: route.method,
      vehicle: cost.vehicle,
      trips: cost.trips,
      breakdown: cost.breakdown,
      configVersion: cost.configVersion,
      // The sentence the UI must show next to the number.
      basis: 'Estimated using AgriChain transport rates. Final price may vary.',
      engine: 'DETERMINISTIC_CONFIG'
    };
  } catch (error) {
    console.warn(`[Transport] Could not estimate trip cost: ${error.message}`);
    return null;
  }
};

/**
 * Turns an internal error code into something safe to show a farmer.
 *
 * Google's own messages can name the project or key, so they are never
 * forwarded. Every message reassures that the cost estimate still stands.
 *
 * @param {string} code
 * @returns {string}
 */
const farmerSafeMessage = (code) => {
  switch (code) {
    case googlePlaces.PLACES_ERROR.NOT_CONFIGURED:
      return 'Transporter lookup is not configured on this server. Your estimated transport cost is still available.';
    case googlePlaces.PLACES_ERROR.AUTH:
      return 'Transporter details are temporarily unavailable. Your estimated transport cost is still available.';
    case googlePlaces.PLACES_ERROR.RATE_LIMITED:
      return 'Transporter lookup is busy right now. Please try again in a few minutes — your estimated transport cost is still available.';
    case googlePlaces.PLACES_ERROR.TIMEOUT:
      return 'Transporter lookup took too long. Your estimated transport cost is still available.';
    case googlePlaces.PLACES_ERROR.UNAVAILABLE:
      return 'Transporter details are temporarily unavailable. Your estimated transport cost is still available.';
    default:
      return 'Transporter details are temporarily unavailable. Your estimated transport cost is still available.';
  }
};

/**
 * Configuration and reachability report, for /api/transport/health.
 * @returns {object}
 */
const getTransportStatus = () => ({
  googlePlaces: {
    configured: googleMaps.isConfigured(),
    enabled: googleMaps.isEnabled(),
    api: 'Places API (New)',
    calls: ['places:searchText', 'places/{placeId}'],
    searchRadiusMetres: googleMaps.searchRadiusMetres(),
    maxResults: googleMaps.maxResults(),
    maxDetailLookups: googleMaps.maxDetailLookups(),
    cacheTtlMinutes: Math.round(googleMaps.cacheTtlMs() / 60000),
    cachedSearches: _cache.size,
    // Stated explicitly so nobody has to read the code to learn it.
    providesAvailability: false,
    providesPricing: false
  },
  tripCost: {
    engine: 'DETERMINISTIC_CONFIG',
    note: 'Trip cost comes from AgriChain transportCostService, never from Google.'
  },
  engineVersion: ENGINE_VERSION
});

module.exports = {
  findTransporters,
  estimateTripCost,
  isRelevantTransporter,
  normaliseTransporter,
  discoverPlaces,
  getTransportStatus,
  clearTransportCache,
  farmerSafeMessage,
  QUERY_TEMPLATES,
  AVAILABILITY,
  ENGINE_VERSION
};
