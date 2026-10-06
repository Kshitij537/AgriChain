import axios from 'axios';
import { rankMarkets, computeBreakeven, estimateSpoilagePct } from '../utils/marketHelpers';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Market intelligence service.
 *
 * WHERE THE NUMBERS COME FROM
 * ---------------------------
 * The backend is the single source of truth for every rupee figure. POST
 * /api/market/recommend runs the whole pipeline server-side - road routing,
 * freight, spoilage, net realizable return, ranking, sell-now-vs-wait - and this
 * module only RESHAPES that response into the field names the existing Market
 * page components already read. No economics is computed here.
 *
 * That boundary matters: the browser used to rank markets itself using its own
 * freight and spoilage constants in utils/marketHelpers. Two implementations of
 * the same business rule inevitably disagree, and when they do, the farmer has no
 * way to tell which number is wrong. The client-side model is now the OFFLINE
 * FALLBACK only, used when the API cannot be reached, and it is flagged as such
 * via `isLiveData: false`.
 *
 * The component contract (market.pricePerQuintal, .netReturn, .spoilagePct, ...)
 * is unchanged, so no component, layout or style was touched.
 */

/** Returns an Authorization header when a JWT is stored, matching diseaseApi.js. */
const authHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Requests the authoritative recommendation from the backend.
 *
 * @param {object} batch - { cropKey, quantityKg, totalInputCost }
 * @param {object} context - { farmId, userId, harvestDate, storageType }
 * @returns {Promise<Object|null>} raw backend payload, or null when unavailable
 */
export const getRecommendation = async (batch, context = {}) => {
  if (!batch?.cropKey || !context.farmId) return null;

  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/market/recommend`,
      {
        crop: batch.cropKey,
        quantityKg: batch.quantityKg,
        farmId: context.farmId,
        // Sent so the backend can resolve and authorise the farm while the app
        // still runs without enforced auth (see optionalAuthMiddleware).
        userId: context.userId,
        harvestDate: context.harvestDate || undefined,
        productionCost: batch.totalInputCost || undefined,
        storageType: context.storageType || 'open'
      },
      { timeout: 30000, headers: { 'Content-Type': 'application/json', ...authHeaders() } }
    );

    if (response.data && response.data.success) {
      return { ok: true, data: response.data.data };
    }
    return { ok: false, kind: 'UNREACHABLE', code: 'UNEXPECTED_RESPONSE', message: null };
  } catch (error) {
    const status = error.response?.status;
    const detail = error.response?.data?.error;

    console.warn(
      `[Market Service] Recommendation unavailable: ${detail?.code || error.message}` +
      (detail?.message ? ` - ${detail.message}` : '')
    );

    // These two cases must NOT be collapsed.
    //
    // A 4xx means the backend answered and told us exactly what is wrong — the
    // crop has no price data, the farm has no location, the field belongs to
    // someone else. That is a real, actionable answer and the farmer must see it.
    // Quietly replacing it with demonstration figures would show them plausible
    // rupees for a question the system actually declined to answer, which is far
    // worse than an error message.
    //
    // A network failure or a 5xx means we have no answer at all, and there the
    // clearly-flagged demo fallback is defensible.
    if (status && status >= 400 && status < 500) {
      return {
        ok: false,
        kind: 'REJECTED',
        status,
        code: detail?.code || `HTTP_${status}`,
        message: detail?.message || 'The market service could not answer this request.',
        fields: detail?.fields || null
      };
    }

    return {
      ok: false,
      kind: 'UNREACHABLE',
      status: status || null,
      code: detail?.code || error.code || 'NETWORK_ERROR',
      message: null
    };
  }
};

/**
 * Fetches observed mandi prices near a location.
 *
 * Distances here are straight-line only; the backend says so in its metadata.
 * Used by the offline fallback path, not by the live recommendation.
 *
 * @param {string} crop
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<Array|null>}
 */
export const getMandiPrices = async (crop, lat, lon) => {
  if (!crop || !lat || !lon) return null;
  const url = `${API_BASE_URL}/api/market/prices?crop=${encodeURIComponent(crop)}&lat=${lat}&lon=${lon}`;
  try {
    const response = await axios.get(url, { timeout: 15000 });
    if (response.data && response.data.success) return response.data.data;
    return null;
  } catch (error) {
    console.warn('[Market Service] Mandi prices unavailable:', error.message);
    return null;
  }
};

/**
 * Fetches the observed history plus ML forecast for a crop at a mandi.
 * @param {string} crop
 * @param {string|number} marketId
 * @returns {Promise<Object|null>}
 */
export const getPriceForecast = async (crop, marketId) => {
  if (!crop || !marketId) return null;
  const url =
    `${API_BASE_URL}/api/market/forecast?crop=${encodeURIComponent(crop)}` +
    `&market=${encodeURIComponent(marketId)}`;
  try {
    const response = await axios.get(url, { timeout: 15000 });
    if (response.data && response.data.success) return response.data.data;
    return null;
  } catch (error) {
    console.warn('[Market Service] Price forecast unavailable:', error.message);
    return null;
  }
};

/**
 * Fetches the alternative selling channels the platform knows about.
 * @param {string} crop
 * @param {number} quantityKg
 * @returns {Promise<Array|null>}
 */
export const getAlternativeChannels = async (crop, quantityKg) => {
  if (!crop) return null;
  const url =
    `${API_BASE_URL}/api/market/channels?crop=${encodeURIComponent(crop)}` +
    `&quantityKg=${quantityKg || 0}`;
  try {
    const response = await axios.get(url, { timeout: 15000 });
    if (response.data && response.data.success) return response.data.data;
    return null;
  } catch (error) {
    console.warn('[Market Service] Alternative channels unavailable:', error.message);
    return null;
  }
};

/**
 * Fetches the crop catalogue, including whether each crop has market price data.
 *
 * `hasMarketPriceData` is what stops a farmer picking a crop that would come back
 * as NO_MARKET_DATA - the batch dialog groups the dropdown by it.
 *
 * @returns {Promise<Array>} crop profiles, or [] when unavailable
 */
export const getCrops = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/crops`, { timeout: 15000 });
    if (response.data && response.data.success && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.warn('[Market Service] Crop list unavailable:', error.message);
    return [];
  }
};

/**
 * Requests a farmer-friendly narration of a recommendation.
 *
 * The narration cannot change any figure - the backend enforces that - so this is
 * safe to render alongside the numbers.
 *
 * @param {object} recommendation - the full payload from getRecommendation
 * @param {string} [language]
 * @returns {Promise<Object|null>}
 */
export const getExplanation = async (recommendation, language = 'en') => {
  if (!recommendation?.recommendation) return null;
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/market/explain`,
      { ...recommendation, language },
      { timeout: 30000, headers: { 'Content-Type': 'application/json' } }
    );
    if (response.data && response.data.success) return response.data.data;
    return null;
  } catch (error) {
    console.warn('[Market Service] Explanation unavailable:', error.message);
    return null;
  }
};

// ---------------------------------------------------------------------------
// Backend -> component adapter
// ---------------------------------------------------------------------------

/**
 * Maps one backend market row onto the field names the components read.
 *
 * Purely a rename: every value is taken straight from the backend. `netReturn` is
 * the backend's `expectedMoney`, which is the figure the ranking was actually
 * decided by, so the headline number on screen and the number that chose the
 * mandi are guaranteed to be the same rupees.
 *
 * @param {object} market - backend market row
 * @returns {object} component-shaped market
 */
const adaptMarket = (market) => ({
  // --- identity (components key on `id`) ---
  id: market.marketCode || String(market.marketId),
  marketId: market.marketId,
  name: market.marketName,
  shortName: (market.marketName || '')
    .replace(/\s*APMC.*$/i, '')
    .replace(/\s*Mandi.*$/i, '')
    .trim() || market.marketName,
  district: market.district,

  // --- price ---
  pricePerQuintal: market.currentPrice,
  predictedPrice: market.predictedPrice,
  predictedChange: market.predictedChange,
  pricePredictionAvailable: market.pricePredictionAvailable,
  priceSource: market.priceSource,
  // The day's observed range. What a farmer actually realises inside it depends
  // on grade, so hiding it makes the modal price look more certain than it is.
  minPrice: market.minPrice ?? null,
  maxPrice: market.maxPrice ?? null,
  priceAgeInDays: market.priceAgeInDays ?? null,
  isDemoData: market.isDemoData,
  observationDate: market.observationDate,
  freshness: market.freshness,

  // --- the journey. `route` and `roadQuality` are descriptive strings the
  // RouteMatrix card shows; they are derived from real routing metadata rather
  // than invented road names, because no road-name dataset is wired in. ---
  distanceKm: market.distanceKm,
  travelMinutes: market.travelTimeMinutes,
  route: market.isRoadRoute
    ? `${market.distanceKm} km by road`
    : `${market.distanceKm} km (estimated, no route data)`,
  roadQuality: market.isRoadRoute
    ? `Road route via ${market.routeProvider || 'OSRM'}`
    : 'Straight-line estimate - road distance unavailable',
  isRoadRoute: market.isRoadRoute,
  routeGeometry: market.routeGeometry,

  // --- money, all computed server-side ---
  grossSale: market.grossSaleValue,
  transportCost: market.transportCost,
  spoilagePct: market.estimatedLossPercent,
  spoilageCost: market.estimatedLossValue,
  spoilageKg: market.estimatedLossKg,
  saleableQuantityKg: market.saleableQuantityKg,
  feesCost: market.otherCosts,
  // Itemised, so the ledger can show WHICH charges make up that number - the
  // trader commission is the biggest one and used to be invisible.
  feesBreakdown: market.otherCostsBreakdown || null,
  feesRates: market.sellingCostRates || null,
  feesSource: market.sellingCostSource || null,
  feesApplied: market.sellingCostsApplied !== false,
  netReturn: market.expectedMoney,
  retentionPercent: market.retentionPercent,

  // --- spoilage detail ---
  spoilageRisk: market.spoilageRisk,
  safeDays: market.safeDays,
  spoilageFactors: market.spoilageFactors,

  // --- ranking ---
  rank: market.rank,
  recommended: market.recommended,
  deltaVsBest: market.deltaVsBest,
  isHighestPriceButNotBest: market.isHighestPriceButNotBest,

  // --- vehicle / liquidity. `activeAgents` has no data source, so it stays null
  // rather than showing a fabricated trader count. ---
  vehicle: market.vehicle,
  trips: market.trips,
  // Running vs handling split, so the freight row can be itemised like the
  // mandi charges instead of being one opaque figure.
  transportBreakdown: market.transportBreakdown || null,
  // Provenance of the ₹/km. The UI must never show an estimate as if a
  // transporter had quoted it.
  freightRateSource: market.freightRateSource || null,
  freightRateSourceNote: market.freightRateSourceNote || null,
  freightIsRealRate: market.freightIsRealRate === true,
  freightRateEvidence: market.freightRateEvidence || null,
  activeAgents: null,
  liquidity: null
});

/**
 * Converts the backend forecast series into the shape PriceForecast expects.
 *
 * @param {object} trend - backend forecast payload
 * @returns {object|null}
 */
const adaptForecast = (trend) => {
  if (!trend || !Array.isArray(trend.points) || !trend.points.length) return null;

  const observed = trend.observed || [];
  const today = observed.length ? observed[observed.length - 1] : null;
  if (!today) return null;

  const todayDate = new Date(today.date);
  const points = [
    { label: 'Today', offsetDays: 0, pricePerQuintal: today.pricePerQuintal, isObserved: true }
  ];

  for (const point of trend.forecast || []) {
    const offsetDays = Math.max(
      1,
      Math.round((new Date(point.date) - todayDate) / 86400000)
    );
    points.push({
      label: offsetDays === 1 ? 'Tomorrow' : `In ${offsetDays} days`,
      offsetDays,
      pricePerQuintal: point.pricePerQuintal,
      isObserved: false,
      modelVersion: point.modelVersion
    });
  }

  const first = points[0].pricePerQuintal;
  const last = points[points.length - 1].pricePerQuintal;
  const trendLabel = points.length === 1
    ? 'No forecast available'
    : last > first ? 'Forecast drifting up'
      : last < first ? 'Forecast drifting down'
        : 'Forecast broadly flat';

  return {
    // The model produces a point estimate with a qualitative band, not a
    // statistical interval, so no percentage confidence is manufactured here.
    confidencePct: null,
    confidenceLabel: trend.forecast?.[0]?.confidence || null,
    trend: trendLabel,
    isMachineLearning: Boolean(trend.pricePredictionAvailable),
    modelVersion: trend.modelVersion,
    points
  };
};

/**
 * Converts the backend timing decision into the shape PriceForecast expects.
 *
 * @param {object} timing - backend timing payload
 * @param {object} conditions - backend ambient conditions
 * @returns {object|null}
 */
const adaptDecision = (timing, conditions) => {
  if (!timing) return null;
  const hold = timing.holdComparison;

  return {
    sellNow: timing.decision !== 'WAIT',
    action: timing.decision === 'SELL_NOW'
      ? 'SELL TODAY'
      : timing.decision === 'WAIT'
        ? `HOLD ${hold?.holdDays ?? 1} DAY${(hold?.holdDays ?? 1) === 1 ? '' : 'S'}`
        : 'SELL WITHIN 24-48 HOURS',
    windowLabel: timing.decision === 'WAIT' ? 'Hold Window' : 'Optimal Trade Window',
    holdDays: hold?.holdDays ?? 0,
    // Signed the way the components expect: what waiting adds, and what it costs.
    priceGain: hold ? hold.holdExpectedMoney - hold.sellNowExpectedMoney + (hold.additionalSpoilageValue || 0) : 0,
    rotLoss: hold?.additionalSpoilageValue ?? 0,
    netOfHolding: hold?.netGainFromWaiting ?? 0,
    holdingSpoilagePct: hold?.additionalSpoilagePercent ?? 0,
    ambientTempC: conditions?.available ? conditions.temperatureC : null,
    reason: timing.reason,
    recommendedWindow: timing.recommendedWindow,
    decision: timing.decision,
    basis: timing.basis,
    engine: timing.engine
  };
};

/**
 * Converts the backend breakeven block into the shape BreakevenCard expects.
 *
 * Returns null when production cost is unknown, so the card renders its
 * "add your input cost" state instead of a fabricated margin.
 *
 * @param {object} breakeven - backend breakeven payload
 * @param {number} netReturn - expected money at the selected market
 * @param {number} quantityKg
 * @returns {object|null}
 */
const adaptBreakeven = (breakeven, netReturn, quantityKg) => {
  if (!breakeven || !breakeven.available) return null;

  const costPerKg = breakeven.breakEvenPricePerKg;
  const realizedPerKg = quantityKg ? netReturn / quantityKg : 0;

  return {
    totalSpent: breakeven.productionCost,
    costPerKg,
    costPerQuintal: breakeven.breakEvenPricePerQuintal,
    realizedPerKg,
    marginPerKg: realizedPerKg - costPerKg,
    netMargin: breakeven.expectedProfit,
    roiPct: breakeven.roiPercent,
    profitable: breakeven.profitable,
    costSharePct: realizedPerKg > 0
      ? Math.min(100, Math.max(0, (costPerKg / realizedPerKg) * 100))
      : 100
  };
};

/**
 * Attaches the winning market's figures to the APMC channel.
 *
 * Channels with no price feed keep netReturn null - the backend deliberately does
 * not estimate them, and the UI must not either.
 *
 * @param {Array} channels
 * @param {object|null} best
 * @returns {Array}
 */
const adaptChannels = (channels, best) =>
  (channels || []).map((channel) =>
    channel.usesRecommendedMarket
      ? { ...channel, netReturn: best?.netReturn ?? null, best: true }
      : channel
  );

// ---------------------------------------------------------------------------
// Offline fallback
// ---------------------------------------------------------------------------

/**
 * Demonstration payload used only when the backend cannot be reached.
 *
 * These are plausible Vidarbha figures, NOT measurements and NOT government
 * observations. Every rupee value shown in this mode is derived from them by
 * marketHelpers, and `isLiveData: false` drives the page's demo-data banner.
 *
 * @returns {object}
 */
const getFallbackIntelligence = () => ({
  isLiveData: false,
  ambient: { tempC: 33, humidity: 68, condition: 'Clear' },
  markets: [
    {
      id: 'nagpur', name: 'Nagpur APMC Mandi', shortName: 'Nagpur', district: 'Nagpur',
      distanceKm: 35, pricePerQuintal: 2800, route: 'NH 44 (Kalmeshwar Rd)',
      roadQuality: 'Clear, smooth asphalt', activeAgents: 18, liquidity: 'high'
    },
    {
      id: 'wardha', name: 'Wardha Mandi', shortName: 'Wardha', district: 'Wardha',
      distanceKm: 75, pricePerQuintal: 3000, route: 'SH 264 via Seloo',
      roadQuality: 'Mixed, patchy stretches', activeAgents: 11, liquidity: 'medium'
    },
    {
      id: 'amravati', name: 'Amravati Mandi', shortName: 'Amravati', district: 'Amravati',
      distanceKm: 100, pricePerQuintal: 2700, route: 'NH 53 west',
      roadQuality: 'Long haul, heavy traffic', activeAgents: 9, liquidity: 'medium'
    }
  ],
  forecast: {
    confidencePct: null,
    trend: 'Demonstration series - not a model forecast',
    isMachineLearning: false,
    points: [
      { label: 'Today', offsetDays: 0, pricePerQuintal: 2800 },
      { label: 'Tomorrow', offsetDays: 1, pricePerQuintal: 2850 },
      { label: 'In 3 days', offsetDays: 3, pricePerQuintal: 2930 },
      { label: 'In 7 days', offsetDays: 7, pricePerQuintal: 3020 }
    ]
  },
  channels: [
    {
      id: 'apmc', name: 'APMC Wholesale Mandi',
      subtitle: 'Open auction, same-day sale', icon: 'store',
      netReturn: null, note: 'Auction rate', usesRecommendedMarket: true
    },
    {
      id: 'fpo', name: 'Farmer Producer Organisation (FPO)',
      subtitle: 'Collective sale, often with farm-gate pickup', icon: 'groups',
      netReturn: null, note: 'Ask your FPO for today\'s rate'
    },
    {
      id: 'haat', name: 'Local weekly haat / direct sale',
      subtitle: 'Retail directly to consumers in a nearby town', icon: 'shopping_basket',
      netReturn: null, note: 'Retail rate varies daily', caution: true
    },
    {
      id: 'processing', name: 'Agro-processing unit',
      subtitle: 'Contract supply, graded at intake', icon: 'factory',
      netReturn: null, note: 'Contract rate'
    }
  ]
});

/**
 * Adds percentage change versus today onto each forecast point.
 * @param {object} forecast
 * @returns {object}
 */
const withForecastDeltas = (forecast) => {
  const points = forecast?.points || [];
  const todayPrice = points[0]?.pricePerQuintal ?? 0;
  return {
    ...forecast,
    points: points.map((point, index) => ({
      ...point,
      isToday: index === 0,
      changePct: todayPrice
        ? ((point.pricePerQuintal - todayPrice) / todayPrice) * 100
        : 0
    }))
  };
};

/**
 * Offline sell-now-vs-wait decision.
 *
 * ONLY used in the fallback path. When the backend is reachable, this decision
 * comes from the server's sell-timing engine, which prices both branches with the
 * same net-return engine that produced the ranking.
 *
 * @param {object} batch
 * @param {object} market
 * @param {object} forecast
 * @param {object} ambient
 * @returns {object|null}
 */
const buildFallbackDecision = (batch, market, forecast, ambient) => {
  if (!market || !forecast?.points?.length) return null;

  const points = forecast.points;
  const today = points[0];
  const holdPoint = points.find((p) => p.offsetDays >= 3) || points[points.length - 1];
  const holdDays = holdPoint.offsetDays || 3;

  const priceGain = (batch?.quintals ?? 0) * (holdPoint.pricePerQuintal - today.pricePerQuintal);
  const holdingSpoilagePct = estimateSpoilagePct(
    holdDays * 24 * 60,
    ambient?.tempC,
    (batch?.perishabilityFactor ?? 1) * 0.06
  );
  const rotLoss = Math.round((market.grossSale * holdingSpoilagePct) / 100);
  const netOfHolding = priceGain - rotLoss;
  const sellNow = netOfHolding <= 0;

  return {
    sellNow,
    action: sellNow ? 'SELL WITHIN 24-48 HOURS' : `HOLD ${holdDays} DAYS`,
    windowLabel: sellNow ? 'Optimal Trade Window' : 'Hold Window',
    holdDays,
    priceGain,
    rotLoss,
    netOfHolding,
    holdingSpoilagePct,
    ambientTempC: ambient?.tempC,
    engine: 'CLIENT_FALLBACK'
  };
};

/**
 * Assembles everything the Market page needs into one normalised payload.
 *
 * Live path: one call to POST /api/market/recommend; the backend's ranking,
 * ledger, timing decision and breakeven are used as-is.
 *
 * Fallback path: the demonstration set above, priced by marketHelpers in the
 * browser, with `isLiveData: false` so the page shows its demo banner.
 *
 * @param {object} batch - { crop, cropKey, quintals, quantityKg, totalInputCost,
 *   perishabilityFactor }
 * @param {object} location - { lat, lon, farmId, userId, harvestDate }
 * @returns {Promise<Object>} normalised market intelligence
 */
export const getMarketIntelligence = async (batch, location = {}) => {
  // --- live path ------------------------------------------------------------
  const outcome = await getRecommendation(batch, {
    farmId: location.farmId,
    userId: location.userId,
    harvestDate: location.harvestDate,
    storageType: location.storageType
  });

  // The backend answered and declined. Surface that verbatim instead of
  // fabricating a replacement — see the comment in getRecommendation.
  if (!outcome.ok && outcome.kind === 'REJECTED') {
    const error = new Error(outcome.message);
    error.code = outcome.code;
    error.fields = outcome.fields;
    error.isBackendRejection = true;
    throw error;
  }

  const backend = outcome.ok ? outcome.data : null;

  // The backend answered, and the answer is "there are no mandi rates for this
  // crop". That is real information, not a failure. Falling through to the demo
  // fallback here would put fabricated mandi prices on screen for a crop nobody
  // is quoting - which is exactly what made Wardha appear for soybean.
  if (backend && !backend.recommendation && backend.dataQuality?.mandiDataAvailable === false) {
    return {
      isLiveData: true,
      containsDemoData: false,
      mandiDataAvailable: false,
      dataQuality: backend.dataQuality,
      ambient: { tempC: null, humidity: null, condition: null, available: false },
      markets: [],
      recommended: null,
      runnerUp: null,
      forecast: null,
      decision: null,
      breakeven: null,
      channels: [],
      // Shown to the farmer in place of an empty table. Keyed `warning` because
      // that is what the Market page's notice banner already reads.
      warning: backend.warning
        || 'No mandi rates are available for this crop yet.',
      recommendationReason: null,
      confidence: 'none',
      confidenceFactors: [],
      raw: backend
    };
  }

  if (backend && backend.recommendation) {
    const markets = (backend.markets || []).filter((m) => m.evaluated).map(adaptMarket);
    const best = markets.find((m) => m.recommended) || markets[0] || null;
    const runnerUp = markets.find((m) => m.rank === 2) || null;

    // The forecast series is a separate, cheap call against the winning mandi.
    const trend = best
      ? await getPriceForecast(backend.request.crop, best.marketId)
      : null;
    const forecast = adaptForecast(trend);

    const channels = adaptChannels(
      await getAlternativeChannels(backend.request.crop, batch?.quantityKg),
      best
    );

    return {
      // True whenever the figures came from the backend. The separate
      // `containsDemoData` flag says whether the PRICES behind them are demo
      // rows - two different questions that the old payload conflated.
      isLiveData: true,
      containsDemoData: Boolean(backend.dataQuality?.containsDemoData),
      dataQuality: backend.dataQuality,

      ambient: {
        tempC: backend.conditions?.available ? backend.conditions.temperatureC : null,
        humidity: backend.conditions?.available ? backend.conditions.humidity : null,
        condition: backend.conditions?.condition || null,
        available: Boolean(backend.conditions?.available)
      },

      markets,
      recommended: best,
      runnerUp,
      forecast: forecast ? withForecastDeltas(forecast) : null,
      decision: adaptDecision(backend.timing, backend.conditions),
      breakeven: adaptBreakeven(backend.breakeven, best?.netReturn ?? 0, batch?.quantityKg),
      channels,

      // Kept so the page can show the winner's plain-language justification and
      // the caveats behind it.
      recommendationReason: backend.recommendation.reason,
      confidence: backend.recommendation.confidence,
      confidenceFactors: backend.recommendation.confidenceFactors,
      recommendationId: backend.recommendationId,
      raw: backend
    };
  }

  // --- offline fallback -----------------------------------------------------
  console.warn('[Market Service] Falling back to demonstration figures (backend unavailable)');
  const fallback = getFallbackIntelligence();
  const ambient = fallback.ambient;
  const ranked = rankMarkets(fallback.markets, batch, { ambientTempC: ambient.tempC });
  const best = ranked[0] || null;

  return {
    isLiveData: false,
    containsDemoData: true,
    dataQuality: {
      containsDemoData: true,
      priceSources: ['CLIENT_FALLBACK'],
      note: 'Backend unavailable - these figures are demonstration values computed in the browser.'
    },
    ambient: { ...ambient, available: false },
    markets: ranked,
    recommended: best,
    runnerUp: ranked[1] || null,
    forecast: withForecastDeltas(fallback.forecast),
    decision: buildFallbackDecision(batch, best, fallback.forecast, ambient),
    breakeven: computeBreakeven(batch, best?.netReturn ?? 0),
    channels: adaptChannels(fallback.channels, best),
    recommendationReason: null,
    confidence: 'low',
    confidenceFactors: ['The market API could not be reached; these are demonstration figures.']
  };
};
