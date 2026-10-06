/**
 * Market Controller
 *
 * HTTP layer for the market intelligence module. Holds no business logic: it
 * validates input, resolves and authorises the farm, calls the engines, maps
 * error codes onto HTTP status codes, and logs.
 *
 * RESPONSE SHAPE
 * Follows the convention already used across this backend:
 *   success -> { success: true, data: ... }
 *   failure -> { success: false, error: { code, message, ... } }
 *
 * LOGGING
 * Every request gets a short correlation id, printed with the crop, quantity,
 * candidate count and outcome, so one farmer's recommendation can be traced
 * through the pipeline in the server log. Tokens, keys and passwords are never
 * logged.
 */

const { query } = require('../config/db');
const marketService = require('../services/marketService');
const marketPriceService = require('../services/marketPriceService');
const pricePredictionService = require('../services/pricePredictionService');
const transportCostService = require('../services/transportCostService');
const routingService = require('../services/routingService');
const marketExplanationService = require('../services/marketExplanationService');
const ingestService = require('../services/marketPriceIngestService');
const { getProvider } = require('../services/providers');
const spoilageService = require('../services/spoilageService');
const marketValidator = require('../validators/marketValidator');
const FarmModel = require('../models/Farm');

/** Short correlation id for one request's log lines. */
const newRequestId = () => Math.random().toString(36).slice(2, 8);

/**
 * Maps engine error codes to HTTP status codes.
 *
 * 424 Failed Dependency is used for "the data this needs does not exist yet",
 * which is a setup problem (no ingestion run), not a client mistake and not a
 * server fault.
 */
const STATUS_BY_CODE = {
  MISSING_FARM_COORDINATES: 422,
  NO_MARKET_DATA: 424,
  NO_EVALUABLE_MARKET: 503,
  FARM_NOT_FOUND: 404,
  FARM_FORBIDDEN: 403,
  INVALID_QUANTITY: 400,
  INVALID_PRICE: 422,
  INVALID_REQUEST: 400,
  MARKET_NOT_FOUND: 404,
  DATABASE_UNAVAILABLE: 503
};

/**
 * Sends a structured error response.
 * @param {object} res
 * @param {Error} error
 * @param {string} requestId
 */
const sendError = (res, error, requestId) => {
  const code = error.code || 'INTERNAL_ERROR';
  const status = STATUS_BY_CODE[code] || 500;

  if (status >= 500) {
    console.error(`[Market Controller] [${requestId}] ${code}: ${error.message}`);
  } else {
    console.warn(`[Market Controller] [${requestId}] ${code}: ${error.message}`);
  }

  return res.status(status).json({
    success: false,
    error: {
      code,
      message: error.message || 'Unexpected server error',
      ...(error.diagnostics ? { diagnostics: error.diagnostics } : {}),
      requestId
    }
  });
};

/**
 * Sends a validation failure listing every problem found.
 * @param {object} res
 * @param {Array} errors
 * @param {string} requestId
 */
const sendValidationError = (res, errors, requestId) =>
  res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_FAILED',
      message: errors[0].message,
      fields: errors,
      requestId
    }
  });

/**
 * Loads a farm and confirms the caller may use it.
 *
 * Ownership is enforced against the identity optionalAuthMiddleware resolved. An
 * authenticated caller asking for someone else's farm gets 403. An
 * unauthenticated caller (the app's current dev posture) is held to the same
 * ownership rule against its resolved user id, so a farmId is never trusted on its
 * own - see middleware/optionalAuthMiddleware.js.
 *
 * @param {number} farmId
 * @param {object} req
 * @returns {Promise<object>} farm row
 * @throws {Error} FARM_NOT_FOUND / FARM_FORBIDDEN
 */
const resolveAuthorisedFarm = async (farmId, req) => {
  const userId = req.user && req.user.id;

  const owned = await FarmModel.checkFarmOwnership(farmId, userId);
  if (owned) return owned;

  // Distinguish "no such farm" from "not yours" - without leaking whether
  // another farmer's field exists to an authenticated caller.
  const exists = await query('SELECT id FROM farms WHERE id = $1', [farmId]);

  if (!exists.rows.length) {
    const err = new Error(`No field found with id ${farmId}.`);
    err.code = 'FARM_NOT_FOUND';
    throw err;
  }

  const err = new Error('This field belongs to a different account.');
  err.code = 'FARM_FORBIDDEN';
  throw err;
};

// ---------------------------------------------------------------------------
// POST /api/market/recommend  - the main endpoint
// ---------------------------------------------------------------------------

/**
 * Produces a full ranked market recommendation for one harvested load.
 */
const recommend = async (req, res) => {
  const requestId = newRequestId();

  try {
    const { valid, value, errors } = marketValidator.validateRecommendRequest(req.body);
    if (!valid) {
      console.warn(
        `[Market Controller] [${requestId}] validation failed: ` +
        errors.map((e) => e.code).join(', ')
      );
      return sendValidationError(res, errors, requestId);
    }

    console.log(
      `[Market Controller] [${requestId}] recommend crop=${value.crop} ` +
      `qty=${value.quantityKg}kg farmId=${value.farmId} user=${req.user?.id} ` +
      `auth=${req.auth?.source}`
    );

    const farm = await resolveAuthorisedFarm(value.farmId, req);

    const result = await marketService.recommendMarkets({
      crop: value.crop,
      quantityKg: value.quantityKg,
      farm: {
        id: farm.id,
        name: farm.name,
        latitude: farm.latitude,
        longitude: farm.longitude,
        district: farm.location,
        cropType: farm.crop_type
      },
      harvestDate: value.harvestDate,
      productionCost: value.productionCost,
      storageType: value.storageType,
      vehicleType: value.vehicleType,
      predictionDays: value.predictionDays,
      includeRouteGeometry: value.includeRouteGeometry,
      requestId
    });

    // Audit trail. Deliberately not awaited into the critical path failure mode:
    // saveRecommendation swallows its own errors.
    const savedId = await marketService.saveRecommendation({
      userId: req.user && req.user.id,
      farmId: farm.id,
      result
    });

    return res.json({
      success: true,
      data: { ...result, recommendationId: savedId, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/market/prices - observed prices, distance-ordered when located
// ---------------------------------------------------------------------------

/**
 * Lists the latest observed price per market for a crop.
 *
 * Every row carries source, observation date and freshness, so a caller can
 * never mistake a demo row or a three-week-old quote for today's rate.
 */
const getPrices = async (req, res) => {
  const requestId = newRequestId();

  try {
    const { valid, value, errors } = marketValidator.validatePriceQuery(req.query);
    if (!valid) return sendValidationError(res, errors, requestId);

    const prices = await marketPriceService.getLatestPricesForCrop(value.crop);

    let rows = prices;

    // With coordinates, order by straight-line proximity. This endpoint stays
    // cheap on purpose - no routing calls - so the distance is labelled as a
    // straight line and the recommend endpoint owns real road distances.
    if (value.latitude !== null && value.longitude !== null) {
      const radius = value.radiusKm || Number.POSITIVE_INFINITY;
      rows = prices
        .filter((p) => p.latitude !== null && p.longitude !== null)
        .map((p) => ({
          ...p,
          straightLineKm:
            Math.round(
              routingService.haversineKm(
                { lat: value.latitude, lon: value.longitude },
                { lat: p.latitude, lon: p.longitude }
              ) * 10
            ) / 10
        }))
        .filter((p) => p.straightLineKm <= radius)
        .sort((a, b) => a.straightLineKm - b.straightLineKm);
    }

    return res.json({
      success: true,
      data: rows,
      meta: {
        crop: value.crop,
        count: rows.length,
        distanceBasis: value.latitude !== null ? 'STRAIGHT_LINE' : null,
        distanceNote: value.latitude !== null
          ? 'Straight-line distance only. Road distance and freight come from POST /api/market/recommend.'
          : null,
        containsDemoData: rows.some((r) => r.isDemoData),
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/market/forecast - price forecast for one crop/market
// ---------------------------------------------------------------------------

/**
 * Returns the ML price forecast plus recent observed history.
 *
 * Responds 200 with pricePredictionAvailable:false when the model is unreachable
 * or has too little history: "no forecast" is a normal state for a crop or mandi
 * that has just started collecting data, not an error.
 */
const getForecast = async (req, res) => {
  const requestId = newRequestId();

  try {
    const crop = marketValidator.validateCrop(req.query.crop);
    if (!crop.valid) return sendValidationError(res, [crop.error], requestId);

    const marketRef = req.query.market || req.query.marketId;
    if (!marketRef) {
      return sendValidationError(
        res,
        [{ field: 'market', code: 'MARKET_REQUIRED', message: 'Specify which mandi to forecast.' }],
        requestId
      );
    }

    const market = await marketService.getMarketById(marketRef);
    if (!market) {
      const err = new Error(`No market found matching "${marketRef}".`);
      err.code = 'MARKET_NOT_FOUND';
      throw err;
    }

    const days = parseInt(req.query.historyDays, 10);
    const trend = await pricePredictionService.getPriceTrend({
      crop: crop.value,
      marketId: market.id,
      historyDays: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30
    });

    return res.json({
      success: true,
      data: {
        ...trend,
        marketName: market.name,
        marketCode: market.marketCode,
        district: market.district,
        // Restated at the top level so a consumer cannot miss it.
        isMachineLearning: trend.pricePredictionAvailable,
        engine: trend.pricePredictionAvailable ? 'ML_MODEL' : null,
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/market/price-trend - chart series
// ---------------------------------------------------------------------------

/**
 * Observed price history plus forecast points, for charting.
 * Observed and predicted points are separately flagged, never merged.
 */
const getPriceTrend = async (req, res) => {
  const requestId = newRequestId();

  try {
    const crop = marketValidator.validateCrop(req.query.crop);
    if (!crop.valid) return sendValidationError(res, [crop.error], requestId);

    const marketRef = req.query.market || req.query.marketId;
    const market = marketRef ? await marketService.getMarketById(marketRef) : null;

    if (marketRef && !market) {
      const err = new Error(`No market found matching "${marketRef}".`);
      err.code = 'MARKET_NOT_FOUND';
      throw err;
    }

    const days = parseInt(req.query.days, 10);
    const trend = await pricePredictionService.getPriceTrend({
      crop: crop.value,
      marketId: market ? market.id : null,
      historyDays: Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30
    });

    return res.json({ success: true, data: { ...trend, requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/markets, /api/markets/:id, /api/markets/:id/prices
// ---------------------------------------------------------------------------

/** Lists markets, optionally filtered by state or district. */
const listMarkets = async (req, res) => {
  const requestId = newRequestId();
  try {
    const markets = await marketService.listMarkets({
      state: req.query.state || null,
      district: req.query.district || null,
      activeOnly: req.query.includeInactive !== 'true'
    });
    return res.json({ success: true, data: markets, meta: { count: markets.length, requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** Returns one market by id or market_code. */
const getMarket = async (req, res) => {
  const requestId = newRequestId();
  try {
    const market = await marketService.getMarketById(req.params.id);
    if (!market) {
      const err = new Error(`No market found matching "${req.params.id}".`);
      err.code = 'MARKET_NOT_FOUND';
      throw err;
    }
    return res.json({ success: true, data: market, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** Price history for one market, optionally for one crop. */
const getMarketPrices = async (req, res) => {
  const requestId = newRequestId();

  try {
    const market = await marketService.getMarketById(req.params.id);
    if (!market) {
      const err = new Error(`No market found matching "${req.params.id}".`);
      err.code = 'MARKET_NOT_FOUND';
      throw err;
    }

    const days = parseInt(req.query.days, 10);
    const historyDays = Number.isFinite(days) && days > 0 ? Math.min(days, 365) : 30;

    if (req.query.crop) {
      const crop = marketValidator.validateCrop(req.query.crop);
      if (!crop.valid) return sendValidationError(res, [crop.error], requestId);

      const history = await marketPriceService.getPriceHistory(crop.value, market.id, historyDays);
      return res.json({
        success: true,
        data: history,
        meta: {
          market: market.name,
          crop: crop.value,
          days: historyDays,
          count: history.length,
          containsDemoData: history.some((h) => h.isDemoData),
          requestId
        }
      });
    }

    // No crop given: latest price per crop at this market.
    const result = await query(
      `SELECT DISTINCT ON (mp.crop)
              mp.*, m.market_code, m.name AS market_name, m.district,
              m.latitude, m.longitude
       FROM market_prices mp
       JOIN markets m ON m.id = mp.market_id
       WHERE mp.market_id = $1
       ORDER BY mp.crop, mp.observation_date DESC`,
      [market.id]
    );

    const rows = result.rows.map((row) => ({
      crop: row.crop,
      variety: row.variety,
      modalPrice: row.modal_price,
      minPrice: row.min_price,
      maxPrice: row.max_price,
      arrivalQuantity: row.arrival_quantity,
      priceUnit: row.price_unit,
      source: row.source,
      isDemoData: row.source === marketPriceService.SOURCE.DEMO_SEED,
      observationDate: marketPriceService.toLocalDateString(row.observation_date),
      freshness: marketPriceService.classifyFreshness(
        marketPriceService.toLocalDateString(row.observation_date)
      )
    }));

    return res.json({
      success: true,
      data: rows,
      meta: { market: market.name, count: rows.length, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/market/channels - alternative selling routes
// ---------------------------------------------------------------------------

/**
 * Lists selling channels other than the APMC auction.
 *
 * IMPORTANT: this returns the CHANNEL TYPES the platform knows about, with no
 * rupee figures attached. There is no dataset of FPO offers, contract rates or
 * local haat prices in this system, and inventing a "net return" for an FPO would
 * be presenting fiction as a quote a farmer could act on. Each channel therefore
 * carries netReturn:null plus what the farmer would have to ask locally.
 *
 * The APMC channel is the one channel with real numbers, and those come from
 * POST /api/market/recommend.
 */
const getChannels = async (req, res) => {
  const requestId = newRequestId();

  try {
    const crop = req.query.crop ? marketValidator.validateCrop(req.query.crop) : { valid: true, value: null };
    if (!crop.valid) return sendValidationError(res, [crop.error], requestId);

    const channels = [
      {
        id: 'apmc',
        name: 'APMC Wholesale Mandi',
        subtitle: 'Open auction, same-day sale, payment through the licensed trader',
        icon: 'store',
        netReturn: null,
        note: 'Auction rate',
        // The recommendation engine fills this channel's figures in.
        usesRecommendedMarket: true,
        dataAvailable: true,
        tradeoff: 'Best price discovery, but you pay freight and commission.'
      },
      {
        id: 'fpo',
        name: 'Farmer Producer Organisation (FPO)',
        subtitle: 'Collective sale, often with pickup at the farm gate',
        icon: 'groups',
        netReturn: null,
        note: 'Ask your FPO for today\'s rate',
        dataAvailable: false,
        unavailableReason: 'NO_FPO_PRICE_FEED',
        tradeoff: 'Usually a lower headline rate, but little or no freight to pay.'
      },
      {
        id: 'haat',
        name: 'Local weekly haat / direct sale',
        subtitle: 'Retail directly to consumers in a nearby town',
        icon: 'shopping_basket',
        netReturn: null,
        note: 'Retail rate varies daily',
        dataAvailable: false,
        unavailableReason: 'NO_RETAIL_PRICE_FEED',
        caution: true,
        tradeoff: 'Highest rate per kg, but it takes days to sell a full load - risky for a perishable crop.'
      },
      {
        id: 'processing',
        name: 'Agro-processing unit',
        subtitle: 'Contract supply, graded on quality at intake',
        icon: 'factory',
        netReturn: null,
        note: 'Contract rate',
        dataAvailable: false,
        unavailableReason: 'NO_PROCESSOR_CONTRACT_FEED',
        tradeoff: 'A fixed rate removes price risk, but rejects at intake are your loss.'
      }
    ];

    return res.json({
      success: true,
      data: channels,
      meta: {
        crop: crop.value,
        quantityKg: Number(req.query.quantityKg) || null,
        note:
          'Only the APMC channel has live figures. Other channels are listed without ' +
          'rupee values because this system has no price feed for them; no amounts are estimated.',
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// POST /api/market/explain - Gemini narration of an existing recommendation
// ---------------------------------------------------------------------------

/**
 * Turns a computed recommendation into plain farmer-facing language.
 *
 * The numbers are not recomputed and are not editable by the language model; see
 * services/marketExplanationService.js for the enforced boundary.
 */
const explain = async (req, res) => {
  const requestId = newRequestId();

  try {
    const recommendation = req.body && req.body.recommendation
      ? req.body
      : null;

    if (!recommendation || !recommendation.recommendation) {
      return sendValidationError(
        res,
        [{
          field: 'recommendation',
          code: 'RECOMMENDATION_REQUIRED',
          message: 'Post the recommendation payload returned by /api/market/recommend.'
        }],
        requestId
      );
    }

    const explanation = await marketExplanationService.explainRecommendation(recommendation, {
      language: req.body.language || 'en'
    });

    return res.json({ success: true, data: { ...explanation, requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/crops, GET /api/crops/:crop
// ---------------------------------------------------------------------------

/**
 * Lists crop profiles.
 *
 * Read from crop_profiles when the table is populated so crops can be tuned
 * without a deploy; falls back to spoilageService.CROP_PROFILES, which remains
 * the computational source of truth.
 */
const listCrops = async (req, res) => {
  const requestId = newRequestId();

  try {
    let rows = [];
    let source = 'crop_profiles';

    try {
      const result = await query(
        `SELECT crop_key, label, perishability, shelf_life_days,
                temperature_sensitivity, optimal_temp_c, optimal_humidity,
                is_grain, icon, config_version
         FROM crop_profiles WHERE active = TRUE ORDER BY label`
      );
      rows = result.rows.map((row) => ({
        crop: row.crop_key,
        label: row.label,
        perishability: row.perishability,
        shelfLifeDays: row.shelf_life_days,
        temperatureSensitivity: row.temperature_sensitivity,
        optimalTempC: row.optimal_temp_c !== null ? Number(row.optimal_temp_c) : null,
        optimalHumidity: row.optimal_humidity !== null ? Number(row.optimal_humidity) : null,
        isGrain: row.is_grain,
        icon: row.icon,
        configVersion: row.config_version
      }));
    } catch (error) {
      console.warn(`[Market Controller] [${requestId}] crop_profiles unavailable: ${error.message}`);
    }

    if (!rows.length) {
      source = 'spoilageService.CROP_PROFILES';
      rows = Object.entries(spoilageService.CROP_PROFILES).map(([key, profile]) => ({
        crop: key,
        label: profile.label,
        perishability: profile.perishability,
        shelfLifeDays: profile.baseShelfLifeDays,
        optimalTempC: profile.optimalTempC,
        optimalHumidity: profile.optimalHumidity,
        isGrain: Boolean(profile.isGrain),
        icon: profile.icon,
        configVersion: 'code_default'
      }));
    }

    // Which crops can actually be recommended right now - i.e. have price data.
    const coverage = await marketPriceService.getCoverageSummary().catch(() => []);
    const cropsWithPrices = new Set(coverage.map((c) => c.crop));

    return res.json({
      success: true,
      data: rows.map((row) => ({
        ...row,
        hasMarketPriceData: cropsWithPrices.has(row.crop)
      })),
      meta: { count: rows.length, source, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** Returns one crop profile with its price coverage. */
const getCrop = async (req, res) => {
  const requestId = newRequestId();

  try {
    const crop = marketValidator.validateCrop(req.params.crop);
    if (!crop.valid) return sendValidationError(res, [crop.error], requestId);

    const profile = spoilageService.getCropProfile(crop.value);
    const coverage = (await marketPriceService.getCoverageSummary().catch(() => []))
      .filter((c) => c.crop === crop.value);

    return res.json({
      success: true,
      data: {
        crop: crop.value,
        label: profile.label,
        perishability: profile.perishability,
        shelfLifeDays: profile.baseShelfLifeDays,
        optimalTempC: profile.optimalTempC,
        optimalHumidity: profile.optimalHumidity,
        isGrain: Boolean(profile.isGrain),
        icon: profile.icon,
        priceCoverage: coverage,
        hasMarketPriceData: coverage.length > 0
      },
      meta: { requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

/**
 * Module health: what data exists, which external services answer, and which
 * model versions are deployed. This is the endpoint to check before a demo.
 */
const healthCheck = async (req, res) => {
  const requestId = newRequestId();

  try {
    const [coverage, priceModel, vehicles] = await Promise.all([
      marketPriceService.getCoverageSummary().catch(() => []),
      pricePredictionService.getModelStatus(1),
      transportCostService.getVehicleOptions().catch(() => [])
    ]);

    const marketCount = await query('SELECT COUNT(*)::int AS count FROM markets WHERE active = TRUE')
      .then((r) => r.rows[0].count)
      .catch(() => null);

    // Real means "an actual observation from a price provider", which is now any
    // of marketPriceService.REAL_SOURCES rather than AGMARKNET specifically.
    const hasRealData = coverage.some(
      (c) => marketPriceService.REAL_SOURCES.includes(c.source)
    );

    const provider = getProvider();
    const [providerHealth, providerCoverage] = await Promise.all([
      provider.health(),
      ingestService.getCoverage().catch(() => null)
    ]);

    return res.json({
      success: true,
      data: {
        status: 'ok',
        markets: marketCount,
        priceCoverage: coverage,
        dataProvenance: {
          hasRealProviderData: hasRealData,
          hasDemoData: coverage.some((c) => c.isDemoData),
          realSources: marketPriceService.REAL_SOURCES,
          warning: hasRealData
            ? null
            : `No observations from ${provider.id} present. All prices are DEMO_SEED demonstration data.`
        },

        // The price provider, and how much of our mandi grid it can actually
        // price. Coverage is reported because "no price for this mandi" must have
        // an auditable answer rather than an empty table.
        priceProvider: {
          ...providerHealth,
          coverage: providerCoverage
            ? {
              ingestibleMarkets: providerCoverage.ingestibleMarkets,
              totalMarkets: providerCoverage.totalMarkets,
              coveragePercent: providerCoverage.coveragePercent,
              marketsWithProviderData: providerCoverage.marketsWithProviderData,
              unmapped: providerCoverage.unmapped
            }
            : null
        },
        engines: {
          priceModel: {
            engine: 'ML_MODEL',
            algorithm: 'XGBoost regression',
            ...priceModel
          },
          spoilage: {
            engine: spoilageService.SPOILAGE_ENGINE,
            modelVersion: spoilageService.SPOILAGE_MODEL_VERSION,
            isMachineLearning: false,
            note: 'Deterministic Q10-based rule set, not a trained model.'
          },
          routing: routingService.getRoutingStatus(),
          transport: { engine: 'DETERMINISTIC_CONFIG', vehicles: vehicles.length },
          netReturn: { engine: 'DETERMINISTIC', version: require('../services/netReturnService').ENGINE_VERSION },
          recommendation: { version: marketService.ENGINE_VERSION }
        },
        requestId
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * Triggers a price ingestion pass through the configured provider.
 *
 * Reports the outcome rather than throwing when the provider is unreachable or
 * nothing is mapped, so an operator sees exactly why nothing was ingested.
 * A PARTIAL run - some markets ingesting while others fail - is the normal case
 * with patchy upstream coverage and is reported as success with the detail.
 */
const ingestPrices = async (req, res) => {
  const requestId = newRequestId();

  try {
    const cropsRaw = req.body?.crops || req.query?.crops;
    const crops = Array.isArray(cropsRaw)
      ? cropsRaw
      : typeof cropsRaw === 'string' && cropsRaw.trim()
        ? cropsRaw.split(',').map((c) => c.trim().toLowerCase()).filter(Boolean)
        : null;

    const summary = await ingestService.ingestPrices({
      state: req.body?.state || req.query?.state || 'Maharashtra',
      crops,
      // History by default: the provider returns a market's full series, and
      // accumulating it is what eventually lets the price model train on real data.
      history: String(req.body?.latest ?? req.query?.latest) !== 'true'
    });

    const failed = summary.status === 'FAILED';

    return res.status(failed ? 424 : 200).json({
      success: !failed,
      data: summary,
      ...(failed
        ? {
          error: {
            code: 'INGEST_FAILED',
            message: summary.errors[0] || 'No rows were ingested.'
          }
        }
        : {}),
      meta: { requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * GET /api/market/provider/coverage
 *
 * Which of our markets the configured provider can price, and which it cannot.
 */
const providerCoverage = async (req, res) => {
  const requestId = newRequestId();
  try {
    const coverage = await ingestService.getCoverage({
      state: req.query?.state || 'Maharashtra'
    });
    return res.json({ success: true, data: { ...coverage, requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** Past recommendations for a farm; ownership enforced. */
const getHistory = async (req, res) => {
  const requestId = newRequestId();

  try {
    const farmId = marketValidator.validateFarmId(req.params.farmId);
    if (!farmId.valid) return sendValidationError(res, [farmId.error], requestId);

    await resolveAuthorisedFarm(farmId.value, req);

    const limit = parseInt(req.query.limit, 10);
    const history = await marketService.getRecommendationHistory(
      farmId.value,
      Number.isFinite(limit) && limit > 0 ? Math.min(limit, 100) : 20
    );

    return res.json({
      success: true,
      data: history,
      meta: { count: history.length, requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** Vehicle freight configuration, for a UI that lets a farmer pick a vehicle. */
const getTransportOptions = async (req, res) => {
  const requestId = newRequestId();
  try {
    const vehicles = await transportCostService.getVehicleOptions();
    return res.json({
      success: true,
      data: vehicles,
      meta: { count: vehicles.length, engine: 'DETERMINISTIC_CONFIG', requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

module.exports = {
  providerCoverage,
  recommend,
  getPrices,
  getForecast,
  getPriceTrend,
  listMarkets,
  getMarket,
  getMarketPrices,
  getChannels,
  explain,
  listCrops,
  getCrop,
  healthCheck,
  ingestPrices,
  getHistory,
  getTransportOptions,
  resolveAuthorisedFarm
};
