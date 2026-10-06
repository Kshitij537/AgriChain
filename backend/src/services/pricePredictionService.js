/**
 * Price prediction client.
 *
 * Thin, failure-tolerant bridge from Express to the FastAPI price model
 * (ml-service, POST /predict/price). No modelling happens here: this module
 * calls the trained XGBoost artifact, records what it said, and - critically -
 * degrades cleanly when it cannot be reached.
 *
 * DEGRADATION CONTRACT
 * --------------------
 * A price forecast is a *nice to have* for the recommendation. The farmer's
 * question ("which mandi leaves me the most money?") is answered from observed
 * prices, freight and spoilage; the forecast only informs sell-now-vs-wait. So
 * an ML outage must never fail the recommendation. Every result carries:
 *
 *   available: true  -> predictedPrice came from the model, with modelVersion
 *   available: false -> no prediction; `reason` says why and predictedPrice is
 *                       null. Callers fall back to the observed current price
 *                       and report price_prediction_available: false.
 *
 * This module never substitutes a guess for a prediction.
 *
 * CONFIGURATION
 *   ML_SERVICE_URL             default http://127.0.0.1:8000
 *   PRICE_PREDICTION_TIMEOUT_MS default 6000
 *   PRICE_PREDICTION_ENABLED   set 'false' to skip the ML hop entirely
 */

const axios = require('axios');
const { query } = require('../config/db');
const marketPriceService = require('./marketPriceService');

const getMlServiceUrl = () =>
  (process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, '');

const getTimeoutMs = () =>
  parseInt(process.env.PRICE_PREDICTION_TIMEOUT_MS, 10) || 6000;

const isEnabled = () => process.env.PRICE_PREDICTION_ENABLED !== 'false';

/** Horizons the trained artifacts support; mirrors price/config.SUPPORTED_HORIZONS. */
const SUPPORTED_HORIZONS = [1, 3];

/**
 * Short-lived cache. A forecast only changes when a new observation lands, i.e.
 * at most once a day, but a single recommendation asks for up to a dozen
 * markets and a farmer may reload the page repeatedly.
 */
const _cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000;

const cacheKey = (crop, marketId, horizon) => `${crop}:${marketId}:${horizon}`;

const getCached = (key) => {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    _cache.delete(key);
    return null;
  }
  return entry.value;
};

/** Clears the forecast cache. Exposed for tests. */
const clearPredictionCache = () => _cache.clear();

/**
 * Builds the "no prediction available" result.
 * @param {string} reason - machine-readable cause
 * @param {string} message - human-readable detail
 * @returns {object}
 */
const unavailable = (reason, message) => ({
  available: false,
  reason,
  message,
  predictedPrice: null,
  predictedChange: null,
  modelVersion: null,
  confidence: null,
  providesPredictionIntervals: false,
  lowerBound: null,
  upperBound: null
});

/**
 * Persists a prediction for traceability.
 *
 * Every prediction a farmer was shown must be recoverable later along with the
 * model version that produced it - that is how a wrong recommendation gets
 * diagnosed. Failure to write is logged, never propagated: an audit-trail
 * problem must not break the farmer's answer.
 *
 * @param {object} prediction
 * @returns {Promise<void>}
 */
const recordPrediction = async (prediction) => {
  try {
    await query(
      `INSERT INTO price_predictions
         (crop, market_id, prediction_date, target_date, horizon_days,
          current_price, predicted_price, lower_bound, upper_bound, model_version)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7, $8, $9)`,
      [
        prediction.crop,
        prediction.marketId,
        prediction.targetDate,
        prediction.horizonDays,
        prediction.currentPrice,
        prediction.predictedPrice,
        // NULL unless the model genuinely produces intervals. Never a made-up spread.
        prediction.lowerBound,
        prediction.upperBound,
        prediction.modelVersion
      ]
    );
  } catch (error) {
    console.warn(`[Price Prediction] Could not record prediction: ${error.message}`);
  }
};

/**
 * Projects the target calendar date for a horizon, skipping Sundays when mandis
 * are shut. Mirrors ml-service price/features.next_trading_dates.
 *
 * @param {string|Date} fromDate - last observation date
 * @param {number} horizonDays
 * @returns {string} YYYY-MM-DD
 */
const projectTargetDate = (fromDate, horizonDays) => {
  const date = new Date(fromDate);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().slice(0, 10);
  for (let step = 0; step < horizonDays; step += 1) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
  }
  return date.toISOString().slice(0, 10);
};

/**
 * Requests a price forecast for one crop at one market.
 *
 * Never throws for an operational failure.
 *
 * @param {object} input
 * @param {string} input.crop - crop key, e.g. 'tomato'
 * @param {number} input.marketId - markets.id
 * @param {number} [input.horizonDays] - 1 or 3
 * @param {boolean} [input.persist] - write to price_predictions (default true)
 * @returns {Promise<object>} prediction result, with available flag
 */
const predictPrice = async ({ crop, marketId, horizonDays = 1, persist = true } = {}) => {
  if (!crop || !marketId) {
    return unavailable('INVALID_REQUEST', 'crop and marketId are required');
  }
  if (!isEnabled()) {
    return unavailable('PREDICTION_DISABLED', 'PRICE_PREDICTION_ENABLED is false');
  }

  const horizon = SUPPORTED_HORIZONS.includes(Number(horizonDays))
    ? Number(horizonDays)
    : 1;

  const key = cacheKey(crop, marketId, horizon);
  const cached = getCached(key);
  if (cached) return cached;

  const url = `${getMlServiceUrl()}/predict/price`;

  try {
    const response = await axios.post(
      url,
      { crop, market_id: Number(marketId), prediction_days: horizon },
      { timeout: getTimeoutMs(), headers: { 'Content-Type': 'application/json' } }
    );

    const data = response.data;
    if (!data || !Number.isFinite(Number(data.predicted_price))) {
      return unavailable('INVALID_ML_RESPONSE', 'ML service returned no usable prediction');
    }

    const targetDate = projectTargetDate(data.last_observation_date, horizon);

    const result = {
      available: true,
      reason: null,
      crop,
      marketId: Number(marketId),
      currentPrice: Number(data.current_price),
      predictedPrice: Number(data.predicted_price),
      predictedChange: Number(data.predicted_change),
      horizonDays: horizon,
      lastObservationDate: data.last_observation_date,
      targetDate,
      priceUnit: data.price_unit || 'INR_PER_QUINTAL',
      modelVersion: data.model_version,
      // Qualitative band from held-out error, NOT a statistical interval. The
      // basis string travels with it so the API can never imply otherwise.
      confidence: data.confidence,
      confidenceBasis: data.confidence_basis,
      providesPredictionIntervals: Boolean(data.provides_prediction_intervals),
      lowerBound: null,
      upperBound: null,
      beatsPersistenceBaseline: Boolean(data.beats_persistence_baseline),
      trainedOnDemoData: Boolean(data.trained_on_demo_data),
      testMae: data.test_mae ?? null,
      testMape: data.test_mape ?? null,
      inputDataSource: data.input_data_source || null,
      engine: 'ML_MODEL'
    };

    _cache.set(key, { value: result, at: Date.now() });
    if (persist) await recordPrediction(result);
    return result;
  } catch (error) {
    // The ML service distinguishes its failure modes; preserve that detail so
    // the API can tell a farmer "not enough history yet" rather than "error".
    if (error.response) {
      const status = error.response.status;
      const detail =
        (error.response.data && error.response.data.detail) || `HTTP ${status}`;
      if (status === 503) return unavailable('MODEL_NOT_TRAINED', detail);
      if (status === 422) return unavailable('INSUFFICIENT_HISTORY', detail);
      if (status === 400) return unavailable('INVALID_REQUEST', detail);
      return unavailable('ML_SERVICE_ERROR', detail);
    }
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      return unavailable('ML_SERVICE_UNAVAILABLE', `Price model service unreachable at ${url}`);
    }
    if (error.code === 'ECONNABORTED' || /timeout/i.test(error.message || '')) {
      return unavailable('ML_SERVICE_TIMEOUT', `Price model did not respond within ${getTimeoutMs()}ms`);
    }
    return unavailable('ML_SERVICE_ERROR', error.message);
  }
};

/**
 * Forecasts for several markets at once.
 *
 * Sequential with a small concurrency cap - the ML service is single-process
 * uvicorn in development and a burst of a dozen simultaneous requests would
 * queue anyway.
 *
 * @param {string} crop
 * @param {Array<number>} marketIds
 * @param {object} [options] - { horizonDays, concurrency, persist }
 * @returns {Promise<Map<number, object>>} keyed by marketId
 */
const predictPricesForMarkets = async (
  crop,
  marketIds,
  { horizonDays = 1, concurrency = 3, persist = true } = {}
) => {
  const results = new Map();
  const queue = [...(marketIds || [])];

  const worker = async () => {
    while (queue.length) {
      const marketId = queue.shift();
      if (marketId === undefined) break;
      results.set(marketId, await predictPrice({ crop, marketId, horizonDays, persist }));
    }
  };

  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(concurrency, queue.length || 1)) }, worker)
  );

  return results;
};

/**
 * Builds the price trend series a chart needs: observed history followed by the
 * model's forecast points, each labelled with which it is.
 *
 * Observed and predicted points are never merged into one undifferentiated line;
 * `isObserved` distinguishes them so the UI cannot accidentally present a
 * forecast as a recorded price.
 *
 * @param {object} input - { crop, marketId, historyDays }
 * @returns {Promise<object>} { points, prediction, source, ... }
 */
const getPriceTrend = async ({ crop, marketId, historyDays = 30 } = {}) => {
  if (!crop || !marketId) {
    const err = new Error('crop and marketId are required');
    err.code = 'INVALID_REQUEST';
    throw err;
  }

  const history = await marketPriceService.getPriceHistory(crop, marketId, historyDays);

  const observed = history.map((row) => ({
    date: row.observationDate,
    pricePerQuintal: Number(row.modalPrice),
    minPrice: row.minPrice !== null ? Number(row.minPrice) : null,
    maxPrice: row.maxPrice !== null ? Number(row.maxPrice) : null,
    arrivalQuantity: row.arrivalQuantity !== null ? Number(row.arrivalQuantity) : null,
    isObserved: true,
    source: row.source,
    isDemoData: row.isDemoData
  }));

  // Both horizons, so the chart can show a short forward curve.
  const [h1, h3] = await Promise.all([
    predictPrice({ crop, marketId, horizonDays: 1, persist: false }),
    predictPrice({ crop, marketId, horizonDays: 3, persist: false })
  ]);

  const forecast = [h1, h3]
    .filter((p) => p.available)
    .map((p) => ({
      date: p.targetDate,
      pricePerQuintal: Math.round(p.predictedPrice),
      isObserved: false,
      horizonDays: p.horizonDays,
      modelVersion: p.modelVersion,
      confidence: p.confidence
    }));

  const latest = observed.length ? observed[observed.length - 1] : null;

  return {
    crop,
    marketId: Number(marketId),
    priceUnit: 'INR_PER_QUINTAL',
    observed,
    forecast,
    points: [...observed, ...forecast],
    currentPrice: latest ? latest.pricePerQuintal : null,
    observationDate: latest ? latest.date : null,
    source: latest ? latest.source : null,
    containsDemoData: observed.some((p) => p.isDemoData),
    pricePredictionAvailable: forecast.length > 0,
    predictionUnavailableReason: forecast.length ? null : h1.reason,
    modelVersion: forecast.length ? forecast[0].modelVersion : null
  };
};

/**
 * Health/metadata probe for the price model, used by /api/market/health.
 * @returns {Promise<object>}
 */
const getModelStatus = async (horizonDays = 1) => {
  if (!isEnabled()) {
    return { available: false, reason: 'PREDICTION_DISABLED' };
  }
  try {
    const response = await axios.get(`${getMlServiceUrl()}/price-model/info`, {
      params: { horizon_days: horizonDays },
      timeout: getTimeoutMs()
    });
    return response.data;
  } catch (error) {
    return {
      available: false,
      reason: error.code === 'ECONNREFUSED' ? 'ML_SERVICE_UNAVAILABLE' : 'ML_SERVICE_ERROR',
      message: error.message,
      mlServiceUrl: getMlServiceUrl()
    };
  }
};

module.exports = {
  predictPrice,
  predictPricesForMarkets,
  getPriceTrend,
  getModelStatus,
  projectTargetDate,
  clearPredictionCache,
  SUPPORTED_HORIZONS
};
