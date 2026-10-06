/**
 * Market recommendation engine.
 *
 * Orchestrates the whole pipeline behind one question:
 *
 *   "For my crop and quantity, which nearby market will leave me with the most
 *    money after transport and expected crop loss?"
 *
 * PIPELINE
 *   farm location -> candidate markets -> observed prices -> price forecast
 *   -> road routing -> transport cost -> weather -> spoilage risk
 *   -> net realizable return -> ranking -> sell now / wait
 *
 * Each stage lives in its own service; this module sequences them, keeps one
 * failing stage from sinking the request, and assembles the response.
 *
 * RANKING RULE
 * ------------
 * Markets are ordered by EXPECTED MONEY and by nothing else. Not the highest
 * price, not the shortest distance, not the lowest spoilage - those are inputs
 * to expected money, and optimising any one of them in isolation is how a farmer
 * ends up driving 100 km to lose ₹1,000. The winner must be explainable, so the
 * response carries the full deduction ledger for every market, plus a reason
 * naming the specific trade-off that decided it.
 *
 * DEGRADATION POLICY
 * ------------------
 * Only two things are fatal: no farm coordinates, and no price data for the crop
 * anywhere. Everything else degrades with a flag - routing falls back to a
 * labelled straight-line estimate, a missing forecast sets
 * pricePredictionAvailable:false, unreachable weather sets
 * weatherAvailable:false and the spoilage baseline uses its documented defaults.
 * A farmer gets a usable, honestly-labelled answer or a clear error, never a
 * confident-looking guess.
 */

const { query } = require('../config/db');
const marketPriceService = require('./marketPriceService');
const pricePredictionService = require('./pricePredictionService');
const routingService = require('./routingService');
const transportCostService = require('./transportCostService');
const freightRateService = require('./freightRateService');
const spoilageService = require('./spoilageService');
const netReturnService = require('./netReturnService');
const sellTimingService = require('./sellTimingService');
const weatherService = require('./weatherService');

/** Bumped whenever the pipeline's composition changes; stored with each result. */
const ENGINE_VERSION = 'market_recommend_v1';

/** How far from the farm a mandi can be and still be worth considering. */
const searchRadiusKm = () => {
  const value = Number(process.env.MARKET_SEARCH_RADIUS_KM);
  return Number.isFinite(value) && value > 0 ? value : 150;
};

/** Cap on markets fully evaluated, to bound external routing calls. */
const maxCandidates = () => {
  const value = parseInt(process.env.MARKET_MAX_CANDIDATES, 10);
  return Number.isFinite(value) && value > 0 ? value : 8;
};

/** Observations older than this are unusable for a selling decision. */
const maxPriceAgeDays = () => {
  const value = parseInt(process.env.MARKET_MAX_PRICE_AGE_DAYS, 10);
  return Number.isFinite(value) && value > 0 ? value : 30;
};

// ---------------------------------------------------------------------------
// Market master data
// ---------------------------------------------------------------------------

/**
 * Shapes a markets row for API output.
 * @param {object} row
 * @returns {object}
 */
const decorateMarket = (row) => ({
  id: row.id,
  marketCode: row.market_code,
  name: row.name,
  state: row.state,
  district: row.district,
  latitude: row.latitude !== null ? Number(row.latitude) : null,
  longitude: row.longitude !== null ? Number(row.longitude) : null,
  // Callers must be able to see that a coordinate is a town centroid rather
  // than a surveyed yard gate, because every derived distance inherits that.
  coordinateSource: row.coordinate_source,
  active: row.active
});

/**
 * Lists markets, optionally filtered.
 * @param {object} [filters] - { state, district, activeOnly }
 * @returns {Promise<Array>}
 */
const listMarkets = async ({ state = null, district = null, activeOnly = true } = {}) => {
  const clauses = [];
  const params = [];

  if (activeOnly) clauses.push('active = TRUE');
  if (state) {
    params.push(state);
    clauses.push(`LOWER(state) = LOWER($${params.length})`);
  }
  if (district) {
    params.push(district);
    clauses.push(`LOWER(district) = LOWER($${params.length})`);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const result = await query(
    `SELECT id, market_code, name, state, district, latitude, longitude,
            coordinate_source, active
     FROM markets ${where}
     ORDER BY state, district, name`,
    params
  );

  return result.rows.map(decorateMarket);
};

/**
 * Fetches one market by numeric id or market_code.
 * @param {string|number} identifier
 * @returns {Promise<object|null>}
 */
const getMarketById = async (identifier) => {
  const numericId = parseInt(identifier, 10);
  const result = await query(
    `SELECT id, market_code, name, state, district, latitude, longitude,
            coordinate_source, active
     FROM markets
     WHERE ($1::int IS NOT NULL AND id = $1::int) OR LOWER(market_code) = LOWER($2)
     LIMIT 1`,
    [Number.isFinite(numericId) ? numericId : null, String(identifier)]
  );
  return result.rows.length ? decorateMarket(result.rows[0]) : null;
};

// ---------------------------------------------------------------------------
// Candidate selection
// ---------------------------------------------------------------------------

/**
 * Finds the markets worth evaluating for this farm and crop.
 *
 * Two-stage by design. Straight-line distance is free, so it prunes the field
 * first; road routing costs an external call each, so it only runs on the
 * survivors. A market with no usable price for this crop is dropped here rather
 * than being carried through the pipeline to produce a blank row.
 *
 * @param {object} input - { crop, latitude, longitude, radiusKm, limit }
 * @returns {Promise<object>} { candidates, diagnostics }
 */
const findCandidateMarkets = async ({
  crop,
  latitude,
  longitude,
  radiusKm = null,
  limit = null
} = {}) => {
  const radius = radiusKm || searchRadiusKm();
  const cap = limit || maxCandidates();

  const prices = await marketPriceService.getLatestPricesForCrop(crop);

  const diagnostics = {
    marketsWithPriceData: prices.length,
    droppedNoCoordinates: 0,
    droppedOutsideRadius: 0,
    droppedStalePrice: 0,
    radiusKm: radius
  };

  const withDistance = [];
  for (const price of prices) {
    if (price.latitude === null || price.longitude === null) {
      diagnostics.droppedNoCoordinates += 1;
      continue;
    }
    if (price.ageInDays > maxPriceAgeDays()) {
      diagnostics.droppedStalePrice += 1;
      continue;
    }

    const straightLineKm = routingService.haversineKm(
      { lat: latitude, lon: longitude },
      { lat: price.latitude, lon: price.longitude }
    );

    if (straightLineKm > radius) {
      diagnostics.droppedOutsideRadius += 1;
      continue;
    }

    withDistance.push({ ...price, straightLineKm: Math.round(straightLineKm * 10) / 10 });
  }

  // Nearest first: if the cap bites, the markets a farmer could realistically
  // reach are the ones kept.
  withDistance.sort((a, b) => a.straightLineKm - b.straightLineKm);

  return {
    candidates: withDistance.slice(0, cap),
    diagnostics: { ...diagnostics, evaluated: Math.min(withDistance.length, cap) }
  };
};

// ---------------------------------------------------------------------------
// Ambient conditions
// ---------------------------------------------------------------------------

/**
 * Fetches temperature and humidity at the farm, for the spoilage baseline.
 *
 * Returns available:false rather than throwing or inventing numbers - the
 * spoilage engine has documented defaults and the response says which were used.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<object>}
 */
const getAmbientConditions = async (latitude, longitude) => {
  try {
    const weather = await weatherService.getCurrentWeather(latitude, longitude);
    if (!weather) {
      return { available: false, reason: 'WEATHER_EMPTY_RESPONSE' };
    }
    return {
      available: true,
      temperatureC: weather.temp ?? weather.temperature ?? null,
      humidity: weather.humidity ?? null,
      condition: weather.condition || null,
      description: weather.description || null,
      windSpeedKmph: weather.windSpeed ?? null,
      precipitation: weather.precipitation ?? null,
      observedAt: weather.timestamp || null,
      source: 'Open-Meteo'
    };
  } catch (error) {
    console.warn(`[Market] Weather unavailable: ${error.message}`);
    return {
      available: false,
      reason: 'WEATHER_API_FAILED',
      message: error.message
    };
  }
};

// ---------------------------------------------------------------------------
// Per-market evaluation
// ---------------------------------------------------------------------------

/**
 * Prices one candidate market end to end.
 *
 * @param {object} input
 * @returns {Promise<object>} the market row for the ranked response
 */
const evaluateMarket = async ({
  candidate,
  route,
  prediction,
  quantityKg,
  spoilageInput,
  vehicleType,
  // Where the load starts. Freight rates are corridor-specific, so a quote or a
  // diesel observation for the farmer's own district beats a state-wide one.
  farmDistrict = null,
  farmState = 'Maharashtra',
  // One resolved rate is reused across every market in a request: the rate
  // depends on the vehicle and the farm, not on the destination, and re-resolving
  // it per market would issue the same two queries a dozen times.
  resolvedRate = null
}) => {
  const currentPrice = Number(candidate.modalPrice);

  // Routing must have produced a distance; without one, no freight figure is
  // defensible, so the market is returned unranked with the reason attached.
  if (!route || !Number.isFinite(route.distanceKm)) {
    return {
      marketId: candidate.marketId,
      marketCode: candidate.marketCode,
      marketName: candidate.marketName,
      district: candidate.district,
      currentPrice,
      evaluated: false,
      unavailableReason: (route && route.degradedReason) || 'ROUTING_FAILED'
    };
  }

  const travelHours = Number.isFinite(route.travelTimeMinutes)
    ? route.travelTimeMinutes / 60
    : undefined;

  // --- freight ---
  let transport;
  try {
    transport = await transportCostService.calculateTransportCost({
      distanceKm: route.distanceKm,
      quantityKg,
      vehicleType,
      district: farmDistrict,
      state: farmState,
      resolvedRate
    });
  } catch (error) {
    return {
      marketId: candidate.marketId,
      marketCode: candidate.marketCode,
      marketName: candidate.marketName,
      district: candidate.district,
      currentPrice,
      distanceKm: route.distanceKm,
      evaluated: false,
      unavailableReason: error.code || 'TRANSPORT_COST_FAILED'
    };
  }

  // --- expected crop loss on the way to THIS market ---
  const spoilage = spoilageService.estimateSpoilageLossForMarket(spoilageInput, {
    name: candidate.marketName,
    distanceKm: route.distanceKm,
    travelHours,
    pricePerQuintal: currentPrice
  });

  // --- the money ---
  let ledger;
  try {
    ledger = netReturnService.calculateNetReturn({
      quantityKg,
      pricePerQuintal: currentPrice,
      spoilageLossPercent: spoilage.estimatedLossPercent,
      transportCost: transport.totalCost
    });
  } catch (error) {
    return {
      marketId: candidate.marketId,
      marketCode: candidate.marketCode,
      marketName: candidate.marketName,
      district: candidate.district,
      currentPrice,
      distanceKm: route.distanceKm,
      evaluated: false,
      unavailableReason: error.code || 'NET_RETURN_FAILED'
    };
  }

  return {
    // --- identity ---
    marketId: candidate.marketId,
    marketCode: candidate.marketCode,
    marketName: candidate.marketName,
    district: candidate.district,
    latitude: candidate.latitude,
    longitude: candidate.longitude,
    evaluated: true,

    // --- price, with provenance and age attached ---
    currentPrice,
    minPrice: candidate.minPrice !== null ? Number(candidate.minPrice) : null,
    maxPrice: candidate.maxPrice !== null ? Number(candidate.maxPrice) : null,
    priceUnit: candidate.priceUnit,
    variety: candidate.variety,
    arrivalQuantity: candidate.arrivalQuantity !== null ? Number(candidate.arrivalQuantity) : null,
    priceSource: candidate.source,
    isDemoData: candidate.isDemoData,
    observationDate: candidate.observationDate,
    fetchedAt: candidate.fetchedAt,
    priceAgeInDays: candidate.ageInDays,
    freshness: candidate.freshness,

    // --- forecast (null, never guessed, when the model is unavailable) ---
    predictedPrice: prediction && prediction.available
      ? Math.round(prediction.predictedPrice)
      : null,
    predictedChange: prediction && prediction.available
      ? Math.round(prediction.predictedChange)
      : null,
    predictionHorizonDays: prediction && prediction.available ? prediction.horizonDays : null,
    predictionModelVersion: prediction && prediction.available ? prediction.modelVersion : null,
    predictionConfidence: prediction && prediction.available ? prediction.confidence : null,
    pricePredictionAvailable: Boolean(prediction && prediction.available),
    pricePredictionUnavailableReason: prediction && !prediction.available ? prediction.reason : null,

    // --- the journey ---
    distanceKm: route.distanceKm,
    straightLineKm: route.straightLineKm ?? candidate.straightLineKm,
    travelTimeMinutes: route.travelTimeMinutes,
    routeMethod: route.method,
    isRoadRoute: route.isRoadRoute,
    routeProvider: route.provider,
    routeDegradedReason: route.degradedReason,
    routeGeometry: route.routeGeometry || null,

    // --- freight ---
    transportCost: transport.totalCost,
    transportBreakdown: transport.breakdown,
    vehicle: transport.vehicle,
    trips: transport.trips,
    // Provenance of the ₹/km behind this freight figure.
    freightRateSource: transport.rateSource,
    freightRateSourceNote: transport.rateSourceNote,
    freightIsRealRate: transport.isRealRate,
    freightRateEvidence: transport.rateEvidence,
    transportConfigVersion: transport.configVersion,

    // --- expected crop loss ---
    spoilageRisk: spoilage.riskLevel,
    spoilageRiskScore: spoilage.riskScore,
    estimatedLossPercent: spoilage.estimatedLossPercent,
    estimatedLossKg: spoilage.estimatedLossKg,
    estimatedLossValue: spoilage.estimatedLossValue,
    saleableQuantityKg: ledger.saleableQuantityKg,
    safeDays: spoilage.safeDays,
    spoilageFactors: spoilage.factors,
    spoilageEngine: spoilage.engine,
    spoilageModelVersion: spoilage.modelVersion,

    // --- the money ---
    quantityKg: ledger.quantityKg,
    grossSaleValue: ledger.grossSaleValue,
    expectedSaleValue: ledger.expectedSaleValue,
    otherCosts: ledger.otherCosts,
    otherCostsBreakdown: ledger.otherCostsBreakdown,
    // Rates and provenance travel with the amount so the UI can name each charge
    // and say these are configured estimates, not verified statutory rates.
    sellingCostRates: ledger.sellingCostRates,
    sellingCostSource: ledger.sellingCostSource,
    sellingCostsApplied: ledger.sellingCostsApplied,
    totalDeductions: ledger.totalDeductions,
    expectedMoney: ledger.expectedMoney,
    realizedPricePerKg: ledger.realizedPricePerKg,
    retentionPercent: ledger.retentionPercent
  };
};

// ---------------------------------------------------------------------------
// Ranking and explanation
// ---------------------------------------------------------------------------

/**
 * Orders evaluated markets by expected money and annotates the gaps.
 *
 * @param {Array} markets
 * @returns {Array} ranked, best first
 */
const rankMarkets = (markets) => {
  const evaluated = markets.filter((m) => m.evaluated);
  const failed = markets.filter((m) => !m.evaluated);

  evaluated.sort((a, b) => {
    // Expected money decides. Ties break toward the nearer market, because a
    // shorter trip is genuinely less risk for the same money.
    if (b.expectedMoney !== a.expectedMoney) return b.expectedMoney - a.expectedMoney;
    return a.distanceKm - b.distanceKm;
  });

  const best = evaluated.length ? evaluated[0].expectedMoney : 0;
  const highestPrice = evaluated.reduce(
    (max, m) => (m.currentPrice > max ? m.currentPrice : max),
    0
  );

  const ranked = evaluated.map((market, index) => ({
    ...market,
    rank: index + 1,
    recommended: index === 0,
    /** Rupees lost by choosing this market over the winner (0 for the winner). */
    deltaVsBest: market.expectedMoney - best,
    /**
     * True when this market quotes the highest price but is NOT the winner -
     * the exact case the product exists to expose.
     */
    isHighestPriceButNotBest: market.currentPrice === highestPrice && index !== 0
  }));

  return [...ranked, ...failed.map((m) => ({ ...m, rank: null, recommended: false }))];
};

/**
 * Writes the plain-language reason the winner won.
 *
 * Deterministic string assembly from the computed figures - no LLM. Gemini may
 * later re-narrate this text, but it may never change the numbers or the choice.
 *
 * @param {object} winner
 * @param {object|null} runnerUp
 * @param {object|null} highestPriceMarket
 * @returns {string}
 */
const buildRecommendationReason = (winner, runnerUp, highestPriceMarket) => {
  if (!winner) return 'No market could be evaluated for this crop and location.';

  const inr = (value) => `₹${Math.round(value).toLocaleString('en-IN')}`;

  // The interesting case: some other mandi pays more per quintal and still loses.
  if (
    highestPriceMarket &&
    highestPriceMarket.marketId !== winner.marketId &&
    highestPriceMarket.currentPrice > winner.currentPrice
  ) {
    const priceGap = highestPriceMarket.currentPrice - winner.currentPrice;
    const moneyGap = winner.expectedMoney - highestPriceMarket.expectedMoney;
    const extraKm = Math.round(highestPriceMarket.distanceKm - winner.distanceKm);
    const extraFreight = highestPriceMarket.transportCost - winner.transportCost;
    const extraLoss = highestPriceMarket.estimatedLossValue - winner.estimatedLossValue;

    return (
      `${highestPriceMarket.marketName} quotes ₹${Math.round(priceGap)}/quintal more, but it is ` +
      `${extraKm} km further: ${inr(extraFreight)} more freight and ${inr(extraLoss)} more crop lost ` +
      `on the way. Selling at ${winner.marketName} instead leaves you about ${inr(moneyGap)} better off ` +
      `— ${inr(winner.expectedMoney)} in hand.`
    );
  }

  if (runnerUp) {
    return (
      `${winner.marketName} gives the highest money in hand at ${inr(winner.expectedMoney)} — about ` +
      `${inr(winner.expectedMoney - runnerUp.expectedMoney)} more than ${runnerUp.marketName}, after ` +
      `${inr(winner.transportCost)} freight and ${winner.estimatedLossPercent}% expected crop loss over ` +
      `${winner.distanceKm} km.`
    );
  }

  return (
    `${winner.marketName} is the only market with usable price data near you. At ` +
    `₹${Math.round(winner.currentPrice)}/quintal, after ${inr(winner.transportCost)} freight and ` +
    `${winner.estimatedLossPercent}% expected crop loss, you keep about ${inr(winner.expectedMoney)}.`
  );
};

/**
 * Overall confidence in the recommendation.
 *
 * Downgraded by every soft input: estimated rather than routed distance, stale or
 * demo price data, a missing forecast, unavailable weather. This is a qualitative
 * label over data quality - it is not a statistical confidence.
 *
 * @param {object} context
 * @returns {object} { level, factors }
 */
const assessConfidence = ({ winner, ambient, usedDemoData, routeDegraded }) => {
  const concerns = [];

  if (!winner) return { level: 'none', factors: ['No market could be evaluated.'] };

  if (usedDemoData) {
    concerns.push('Prices are DEMO_SEED demonstration values, not government observations.');
  }
  if (winner.freshness === 'STALE' || winner.freshness === 'EXPIRED') {
    concerns.push(`The price observation is ${winner.priceAgeInDays} days old.`);
  }
  if (routeDegraded) {
    concerns.push('Road routing was unavailable; distance is a straight-line estimate.');
  }
  if (!winner.pricePredictionAvailable) {
    concerns.push('No price forecast was available, so timing advice is based on spoilage only.');
  }
  if (!ambient.available) {
    concerns.push('Live weather was unavailable; spoilage used default temperature and humidity.');
  }

  const level = concerns.length === 0 ? 'high' : concerns.length <= 2 ? 'medium' : 'low';
  return { level, factors: concerns };
};

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Produces the full market recommendation for one harvested load.
 *
 * @param {object} input
 * @param {string} input.crop - crop key, e.g. 'tomato'
 * @param {number} input.quantityKg
 * @param {object} input.farm - { id, name, latitude, longitude, district }
 * @param {string} [input.harvestDate] - YYYY-MM-DD
 * @param {number} [input.productionCost] - total rupees spent growing the crop
 * @param {string} [input.storageType] - spoilageService storage key
 * @param {string} [input.vehicleType] - transport_config vehicle_type
 * @param {number} [input.predictionDays] - 1 or 3
 * @param {boolean} [input.includeRouteGeometry]
 * @param {string} [input.requestId] - for correlated logging
 * @returns {Promise<object>} the structured recommendation
 */
const recommendMarkets = async ({
  crop,
  quantityKg,
  farm,
  harvestDate = null,
  productionCost = null,
  storageType = 'open',
  vehicleType = null,
  predictionDays = 1,
  includeRouteGeometry = false,
  requestId = null
} = {}) => {
  const startedAt = Date.now();
  const log = (message) =>
    console.log(`[Market Recommend]${requestId ? ` [${requestId}]` : ''} ${message}`);

  if (!farm || farm.latitude === null || farm.latitude === undefined ||
      farm.longitude === null || farm.longitude === undefined) {
    const err = new Error(
      'This farm has no saved location. Set the field boundary or location first so ' +
      'we can measure the distance to each mandi.'
    );
    err.code = 'MISSING_FARM_COORDINATES';
    throw err;
  }

  const cropKey = spoilageService.resolveCropKey(crop);
  log(`crop=${cropKey} quantityKg=${quantityKg} farmId=${farm.id}`);

  // --- 1. candidate markets --------------------------------------------------
  const { candidates, diagnostics } = await findCandidateMarkets({
    crop: cropKey,
    latitude: Number(farm.latitude),
    longitude: Number(farm.longitude)
  });

  if (!candidates.length) {
    // No mandi data available - return empty result instead of throwing error
    // This allows the frontend to show buyer marketplace options
    console.warn(
      `[Market Recommend] No mandi data for ${crop}. ` +
      (diagnostics.marketsWithPriceData === 0
        ? `No market_prices rows for crop="${crop}".`
        : `${diagnostics.droppedOutsideRadius} markets too far, ${diagnostics.droppedStalePrice} prices too old.`)
    );
    
    // Returned with the SAME top-level shape as a successful recommendation, so
    // every downstream consumer keeps working. An earlier version returned a
    // different shape (recommended/runnerUp/ambient/...), which made
    // saveRecommendation crash on `result.request.crop` and made the frontend
    // mistake a legitimate "no mandi prices" answer for an unreachable backend -
    // and then fabricate demo mandi rows in its place.
    return {
      request: {
        crop: cropKey,
        cropLabel: spoilageService.getCropProfile(cropKey).label,
        quantityKg: Number(quantityKg),
        quintals: Math.round((Number(quantityKg) / 100) * 100) / 100,
        harvestDate: harvestDate || new Date().toISOString().slice(0, 10),
        storageType,
        productionCost: productionCost !== null && productionCost !== undefined
          ? Number(productionCost)
          : null,
        farm: {
          id: farm.id,
          name: farm.name || null,
          district: farm.district || farm.location || null,
          latitude: Number(farm.latitude),
          longitude: Number(farm.longitude)
        }
      },

      // The distinguishing field: null means "we looked and there are no mandi
      // rates for this crop", NOT "the request failed".
      recommendation: null,
      markets: [],
      breakeven: { available: false, productionCostAvailable: false,
        reason: 'NO_MANDI_DATA', message: 'No mandi prices to compare against.' },
      timing: null,
      conditions: { available: false, reason: 'NOT_EVALUATED' },

      dataQuality: {
        mandiDataAvailable: false,
        containsDemoData: false,
        priceSources: [],
        freshness: null,
        observationDate: null,
        routingDegraded: false,
        weatherAvailable: false,
        pricePredictionAvailable: false,
        spoilageEngine: spoilageService.SPOILAGE_ENGINE,
        spoilageModelVersion: spoilageService.SPOILAGE_MODEL_VERSION,
        priceModelVersion: null,
        netReturnEngineVersion: netReturnService.ENGINE_VERSION
      },

      // Farmer-facing explanation, so the UI can say why the list is empty
      // instead of inventing something to put in it.
      warning: diagnostics.marketsWithPriceData === 0
        ? `We have no mandi rates for ${cropKey} yet. Check direct buyer offers instead.`
        : `No mandi within ${diagnostics.radiusKm} km has usable ${cropKey} rates right now.`,

      diagnostics,
      engineVersion: ENGINE_VERSION,
      generatedAt: new Date().toISOString()
    };
  }

  log(`${candidates.length} candidate market(s) of ${diagnostics.marketsWithPriceData} with price data`);

  // --- 2. weather, routing and forecasts in parallel -------------------------
  const origin = { lat: Number(farm.latitude), lon: Number(farm.longitude) };

  const [ambient, routes, predictions] = await Promise.all([
    getAmbientConditions(origin.lat, origin.lon),
    routingService.getRoutes(
      origin,
      candidates.map((c) => ({ id: c.marketId, lat: c.latitude, lon: c.longitude })),
      { includeGeometry: includeRouteGeometry }
    ),
    pricePredictionService.predictPricesForMarkets(
      cropKey,
      candidates.map((c) => c.marketId),
      { horizonDays: predictionDays }
    )
  ]);

  const routeDegraded = Array.from(routes.values()).some((r) => !r.isRoadRoute);
  if (routeDegraded) {
    log('WARNING at least one distance is a straight-line estimate, not a road route');
  }
  if (!ambient.available) {
    log(`WARNING weather unavailable (${ambient.reason}); spoilage uses documented defaults`);
  }

  // Shared spoilage input: identical for every market except the journey, so the
  // only thing that differs between markets is what the trip itself costs.
  const spoilageInput = {
    cropType: cropKey,
    quantityKg: Number(quantityKg),
    harvestDate: harvestDate || new Date().toISOString().slice(0, 10),
    storageType,
    temperatureC: ambient.available ? ambient.temperatureC : undefined,
    humidity: ambient.available ? ambient.humidity : undefined
  };

  // --- 3. resolve the freight rate once, then evaluate every candidate -------
  // Which ₹/km applies depends on the vehicle and the farm's district, not on the
  // destination mandi, so it is resolved once per request.
  const farmDistrict = farm.district || farm.location || null;
  let freightRate = null;
  try {
    const vehicles = await transportCostService.loadVehicles();
    const vehicle = transportCostService.selectVehicle(vehicles, Number(quantityKg), vehicleType);
    freightRate = await freightRateService.resolveRate({ vehicle, district: farmDistrict });
  } catch (error) {
    // Rate resolution failing must not fail the recommendation:
    // calculateTransportCost resolves its own rate when none is injected.
    console.warn(`[Market Recommend] freight rate pre-resolution skipped: ${error.message}`);
  }

  const evaluated = [];
  for (const candidate of candidates) {
    evaluated.push(
      await evaluateMarket({
        candidate,
        route: routes.get(candidate.marketId),
        prediction: predictions.get(candidate.marketId),
        quantityKg: Number(quantityKg),
        spoilageInput,
        vehicleType,
        farmDistrict,
        resolvedRate: freightRate
      })
    );
  }

  // --- 4. rank ---------------------------------------------------------------
  const ranked = rankMarkets(evaluated);
  const rankable = ranked.filter((m) => m.evaluated);

  if (!rankable.length) {
    const err = new Error(
      'Market prices were found, but none could be priced end to end (routing or ' +
      'freight failed for every candidate). Try again shortly.'
    );
    err.code = 'NO_EVALUABLE_MARKET';
    err.diagnostics = { ...diagnostics, failures: ranked.map((m) => m.unavailableReason) };
    throw err;
  }

  const winner = rankable[0];
  const runnerUp = rankable[1] || null;
  const highestPriceMarket = rankable.reduce(
    (best, m) => (!best || m.currentPrice > best.currentPrice ? m : best),
    null
  );

  // --- 5. breakeven ---------------------------------------------------------
  const breakeven = netReturnService.calculateBreakeven({
    quantityKg: Number(quantityKg),
    productionCost,
    expectedMoney: winner.expectedMoney
  });

  // --- 6. sell now or wait --------------------------------------------------
  const timing = sellTimingService.decideSellTiming({
    market: winner,
    prediction: predictions.get(winner.marketId),
    spoilageInput,
    quantityKg: Number(quantityKg)
  });

  const usedDemoData = rankable.some((m) => m.isDemoData);
  const confidence = assessConfidence({ winner, ambient, usedDemoData, routeDegraded });
  const reason = buildRecommendationReason(winner, runnerUp, highestPriceMarket);

  const durationMs = Date.now() - startedAt;
  log(
    `complete in ${durationMs}ms: ${winner.marketName} expectedMoney=₹${winner.expectedMoney} ` +
    `decision=${timing.decision} confidence=${confidence.level}`
  );

  return {
    request: {
      crop: cropKey,
      cropLabel: spoilageService.getCropProfile(cropKey).label,
      quantityKg: Number(quantityKg),
      quintals: Math.round((Number(quantityKg) / 100) * 100) / 100,
      harvestDate: spoilageInput.harvestDate,
      storageType,
      productionCost: productionCost !== null && productionCost !== undefined
        ? Number(productionCost)
        : null,
      farm: {
        id: farm.id,
        name: farm.name || null,
        district: farm.district || farm.location || null,
        latitude: origin.lat,
        longitude: origin.lon
      }
    },

    recommendation: {
      marketId: winner.marketId,
      marketCode: winner.marketCode,
      marketName: winner.marketName,
      district: winner.district,
      currentPrice: winner.currentPrice,
      predictedPrice: winner.predictedPrice,
      expectedMoney: winner.expectedMoney,
      saleableQuantityKg: winner.saleableQuantityKg,
      distanceKm: winner.distanceKm,
      travelTimeMinutes: winner.travelTimeMinutes,
      transportCost: winner.transportCost,
      spoilageRisk: winner.spoilageRisk,
      estimatedLossPercent: winner.estimatedLossPercent,
      decision: timing.decision,
      recommendedSellingWindow: timing.recommendedWindow,
      timingReason: timing.reason,
      confidence: confidence.level,
      confidenceFactors: confidence.factors,
      reason
    },

    markets: ranked,

    breakeven: {
      available: breakeven.available,
      productionCostAvailable: breakeven.available,
      ...breakeven
    },

    timing,

    conditions: ambient,

    dataQuality: {
      // The single flag a UI needs to decide whether to show a demo-data banner.
      containsDemoData: usedDemoData,
      priceSources: Array.from(new Set(rankable.map((m) => m.priceSource))),
      freshness: winner.freshness,
      observationDate: winner.observationDate,
      routingDegraded: routeDegraded,
      weatherAvailable: ambient.available,
      pricePredictionAvailable: winner.pricePredictionAvailable,
      spoilageEngine: spoilageService.SPOILAGE_ENGINE,
      spoilageModelVersion: spoilageService.SPOILAGE_MODEL_VERSION,
      priceModelVersion: winner.predictionModelVersion,
      netReturnEngineVersion: netReturnService.ENGINE_VERSION
    },

    diagnostics: { ...diagnostics, durationMs },
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString()
  };
};

/**
 * Persists a delivered recommendation.
 *
 * Audit trail, not cache: it records what a farmer was actually told, so a
 * disputed recommendation can be reconstructed with the engine and model
 * versions that produced it. Never allowed to fail the request.
 *
 * @param {object} input - { userId, farmId, result }
 * @returns {Promise<number|null>} inserted id
 */
const saveRecommendation = async ({ userId, farmId, result }) => {
  // Nothing to audit when no mandi could be recommended. Guarded rather than
  // relying on the caller to check, because the audit trail must never be the
  // thing that breaks a request.
  if (!result || !result.request || !result.recommendation) return null;

  try {
    const inserted = await query(
      `INSERT INTO market_recommendations
         (user_id, farm_id, crop, quantity_kg, harvest_date, production_cost,
          recommended_market_id, expected_money, decision, response_payload, engine_version)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        userId || null,
        farmId || null,
        result.request.crop,
        result.request.quantityKg,
        result.request.harvestDate,
        result.request.productionCost,
        result.recommendation.marketId,
        result.recommendation.expectedMoney,
        result.recommendation.decision,
        JSON.stringify(result),
        result.engineVersion
      ]
    );
    return inserted.rows[0] ? inserted.rows[0].id : null;
  } catch (error) {
    console.warn(`[Market] Could not persist recommendation: ${error.message}`);
    return null;
  }
};

/**
 * Past recommendations for a farm, newest first.
 * @param {number} farmId
 * @param {number} [limit]
 * @returns {Promise<Array>}
 */
const getRecommendationHistory = async (farmId, limit = 20) => {
  const result = await query(
    `SELECT mr.id, mr.crop, mr.quantity_kg, mr.harvest_date, mr.production_cost,
            mr.expected_money, mr.decision, mr.engine_version, mr.created_at,
            m.name AS market_name, m.market_code
     FROM market_recommendations mr
     LEFT JOIN markets m ON m.id = mr.recommended_market_id
     WHERE mr.farm_id = $1
     ORDER BY mr.created_at DESC
     LIMIT $2`,
    [parseInt(farmId, 10), limit]
  );

  return result.rows.map((row) => ({
    id: row.id,
    crop: row.crop,
    quantityKg: Number(row.quantity_kg),
    harvestDate: marketPriceService.toLocalDateString(row.harvest_date),
    productionCost: row.production_cost !== null ? Number(row.production_cost) : null,
    marketName: row.market_name,
    marketCode: row.market_code,
    expectedMoney: row.expected_money !== null ? Number(row.expected_money) : null,
    decision: row.decision,
    engineVersion: row.engine_version,
    createdAt: row.created_at
  }));
};

module.exports = {
  recommendMarkets,
  listMarkets,
  getMarketById,
  findCandidateMarkets,
  getAmbientConditions,
  evaluateMarket,
  rankMarkets,
  buildRecommendationReason,
  assessConfidence,
  saveRecommendation,
  getRecommendationHistory,
  ENGINE_VERSION
};
