const ndviService = require('../services/ndviService');
const ndviStorage = require('../services/ndviStorageService');
const recommendationService = require('../services/recommendationService');
const weatherService = require('../services/weatherService');
const { computeTrendFromSeries, buildDropAlert } = require('../utils/ndviUtils');
const { computeFieldId } = require('../utils/fieldUtils');

/**
 * NDVI Controller - Handles NDVI calculation requests
 */

/**
 * POST /api/ndvi/calculate
 * Calculate NDVI for a farm boundary
 */
const calculateNDVI = async (req, res) => {
  try {
    const { coordinates, fieldId: inputFieldId, farmId, includePixelGrid } = req.body;

    // Validate request body
    if (!coordinates) {
      return res.status(400).json({
        success: false,
        error: 'Coordinates are required'
      });
    }

    console.log('[NDVI Controller] Received NDVI calculation request');

    // Calculate NDVI with optional pixel grid
    const result = await ndviService.calculateNDVI(coordinates, includePixelGrid || false);

    if (result && result.success === false) {
      return res.status(200).json(result);
    }

    // Persist result + generate alert (if we can)
    const fieldId = inputFieldId || computeFieldId(coordinates);
    const capturedDate = result.imageDate || new Date().toISOString().slice(0, 10);

    const thresholdAbs = parseFloat(process.env.NDVI_ALERT_DROP_ABS) || 0.12;
    const previous = await ndviStorage.getPreviousMeasurement(fieldId, capturedDate);

    await ndviStorage.upsertMeasurement({
      fieldId,
      capturedDate,
      ndviValue: result.ndvi,
      healthStatus: result.health,
      imageDate: result.imageDate,
      cloudCoverage: result.cloudCoverage,
      source: 'satellite-service',
    });

    const farmIdNum = Number(farmId);
    if (farmId && Number.isInteger(farmIdNum) && farmIdNum > 0) {
      await ndviStorage.saveFarmNdviSnapshot({
        farmId: farmIdNum,
        ndviValue: result.ndvi,
        healthStatus: result.health,
        imageDate: result.imageDate || new Date().toISOString(),
        imageUrl: null,
        satelliteSource: 'satellite-service',
      });
    }

    const alert = buildDropAlert({
      previous: previous ? Number(previous.ndvi_value) : null,
      current: Number(result.ndvi),
      thresholdAbs,
    });

    res.status(200).json({
      ...result,
      fieldId,
      capturedDate,
      alert,
    });

  } catch (error) {
    console.error('[NDVI Controller] Error:', error.message);

    const errorMessage = error.message || 'Failed to calculate NDVI';
    const lower = errorMessage.toLowerCase();

    const statusCode = lower.includes('required')
      ? 400
      : lower.includes('invalid')
      ? 400
      : lower.includes('no valid ndvi data')
      ? 422
      : lower.includes('no satellite images')
      ? 404
      : lower.includes('unable to calculate ndvi')
      ? 422
      : lower.includes('not available')
      ? 503
      : 500;

    res.status(statusCode).json({
      success: false,
      error: errorMessage
    });
  }
};

/**
 * POST /api/ndvi/timeseries
 * Proxy satellite-service time series + compute trend + optionally persist
 */
const getTimeSeries = async (req, res) => {
  try {
    const { coordinates, days = 30, fieldId: inputFieldId } = req.body;

    if (!coordinates) {
      return res.status(400).json({ success: false, error: 'Coordinates are required' });
    }

    const fieldId = inputFieldId || computeFieldId(coordinates);
    const seriesResult = await ndviService.getNDVITimeSeries(coordinates, days);
    if (!seriesResult?.success) {
      return res.status(200).json({
        success: true,
        fieldId,
        days: parseInt(days, 10) || 30,
        data: [],
        count: 0,
        trend: null,
        unavailableReason: seriesResult?.error || 'NDVI trend data unavailable',
        timestamp: seriesResult?.timestamp || new Date().toISOString(),
      });
    }

    const trend = computeTrendFromSeries(seriesResult.data);

    // Persist each point (upsert by field_id + captured_date)
    if (Array.isArray(seriesResult.data)) {
      const validPoints = seriesResult.data.filter(
        (point) => point?.date && typeof point?.ndvi === 'number'
      );
      await ndviStorage.bulkUpsertMeasurements(
        validPoints.map((point) => {
          const classification = ndviService.getHealthClassification(point.ndvi);
          return {
            fieldId,
            capturedDate: point.date,
            ndviValue: point.ndvi,
            healthStatus: classification.health,
            imageDate: point.date,
            cloudCoverage: null,
            source: 'satellite-service-timeseries',
          };
        })
      );
    }

    res.status(200).json({
      success: true,
      fieldId,
      days: parseInt(days, 10) || 30,
      data: seriesResult.data,
      count: seriesResult.count,
      trend,
      timestamp: seriesResult.timestamp,
    });
  } catch (error) {
    console.error('[NDVI Controller] Time series error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch time series' });
  }
};

/**
 * GET /api/ndvi/history?fieldId=...&days=30
 */
const getHistory = async (req, res) => {
  try {
    const { fieldId, days = 30 } = req.query;
    if (!fieldId) {
      return res.status(400).json({ success: false, error: 'fieldId is required' });
    }

    const rows = await ndviStorage.getHistory(fieldId, days);
    const trend = computeTrendFromSeries(rows);

    res.status(200).json({
      success: true,
      fieldId,
      days: parseInt(days, 10) || 30,
      data: rows,
      count: rows.length,
      trend,
    });
  } catch (error) {
    console.error('[NDVI Controller] History error:', error.message);
    res.status(500).json({ success: false, error: error.message || 'Failed to fetch history' });
  }
};

/**
 * GET /api/ndvi/health/:ndviValue
 * Get health classification for an NDVI value
 */
const getHealthStatus = (req, res) => {
  try {
    const { ndviValue } = req.params;
    const ndvi = parseFloat(ndviValue);

    if (isNaN(ndvi)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid NDVI value - must be numeric'
      });
    }

    const classification = ndviService.getHealthClassification(ndvi);

    res.status(200).json({
      success: true,
      ndvi,
      ...classification
    });

  } catch (error) {
    console.error('[NDVI Controller] Error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

/**
 * POST /api/ndvi/advice
 * Generate AI farming advice using crop + NDVI context
 */
const getFieldAdvice = async (req, res) => {
  try {
    const {
      cropType,
      ndvi,
      health,
      status,
      cloudCoverage,
      imageDate,
      trend7d,
      trend7dAbs,
      trend30d,
      trend30dAbs,
      latitude,
      longitude,
      currentWeather,
      weatherForecast,
      language = 'en',
    } = req.body || {};

    if (ndvi == null && !health && !cropType) {
      return res.status(400).json({
        success: false,
        error: 'At least one of cropType, ndvi, or health is required',
      });
    }

    let resolvedCurrentWeather = currentWeather || null;
    let resolvedWeatherForecast = weatherForecast || null;

    if ((!resolvedCurrentWeather || !resolvedWeatherForecast) && latitude != null && longitude != null) {
      try {
        const [current, forecast] = await Promise.all([
          weatherService.getCurrentWeather(Number(latitude), Number(longitude)),
          weatherService.getWeatherForecast(Number(latitude), Number(longitude), 3),
        ]);
        resolvedCurrentWeather = resolvedCurrentWeather || current;
        resolvedWeatherForecast = resolvedWeatherForecast || forecast;
      } catch (weatherError) {
        console.warn('[NDVI Controller] Weather context unavailable for advice:', weatherError.message);
      }
    }

    const advice = await recommendationService.generateFieldAdvice({
      cropType,
      ndvi: typeof ndvi === 'number' ? ndvi : Number(ndvi),
      health,
      status,
      cloudCoverage: cloudCoverage == null ? null : Number(cloudCoverage),
      imageDate,
      trend7d: trend7d == null ? null : Number(trend7d),
      trend7dAbs: trend7dAbs == null ? null : Number(trend7dAbs),
      trend30d: trend30d == null ? null : Number(trend30d),
      trend30dAbs: trend30dAbs == null ? null : Number(trend30dAbs),
      currentWeather: resolvedCurrentWeather,
      weatherForecast: resolvedWeatherForecast,
      language,
    });

    return res.status(200).json({
      success: true,
      advice,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[NDVI Controller] Advice warning:', error.message);
    const fallbackContext = req.body || {};
    return res.status(200).json({
      success: true,
      advice: recommendationService.normalizeAdvice(null, fallbackContext.language || 'en', fallbackContext),
      generatedAt: new Date().toISOString(),
    });
  }
};


module.exports = {
  calculateNDVI,
  getFieldAdvice,
  getHealthStatus,
  getTimeSeries,
  getHistory
};
