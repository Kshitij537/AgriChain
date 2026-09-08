const spoilageService = require('../services/spoilageService');
const recommendationService = require('../services/recommendationService');
const weatherService = require('../services/weatherService');
const SpoilageModel = require('../models/Spoilage');
const FarmModel = require('../models/Farm');
const { query } = require('../config/db');

/**
 * Spoilage Controller - Post-harvest risk assessment endpoints
 */

const handleControllerError = (res, error) => {
  const code = error.code || 'INTERNAL_ERROR';
  const status = code === 'DATABASE_UNAVAILABLE' ? 503 : 500;
  return res.status(status).json({
    success: false,
    error: { code, message: error.message || 'Unexpected server error' }
  });
};

/**
 * Pulls live temperature and humidity for a farm so the farmer does not have to
 * type them in. Returns null when the farm has no usable coordinates or the
 * weather provider is unreachable — the engine then falls back to its defaults.
 */
const fetchAmbientConditions = async (lat, lon) => {
  if (!lat || !lon) return null;
  try {
    const weather = await weatherService.getCurrentWeather(lat, lon);
    if (!weather) return null;
    return {
      temperatureC: weather.temperature ?? weather.temp ?? null,
      humidity: weather.humidity ?? null,
      source: 'weather-api'
    };
  } catch (error) {
    console.warn('[Spoilage Controller] Could not fetch ambient weather:', error.message);
    return null;
  }
};

/**
 * Resolves farm coordinates for weather lookup.
 */
const getFarmCoordinates = async (farmId) => {
  if (!farmId) return null;
  try {
    const res = await query(
      'SELECT id, latitude, longitude, name FROM farms WHERE id = $1 LIMIT 1',
      [parseInt(farmId, 10)]
    );
    if (res.rows.length === 0) return null;
    const row = res.rows[0];
    if (row.latitude == null || row.longitude == null) return null;
    return { lat: row.latitude, lon: row.longitude, name: row.name };
  } catch (error) {
    console.warn('[Spoilage Controller] Could not resolve farm coordinates:', error.message);
    return null;
  }
};

/**
 * POST /api/spoilage/assess
 * Body: { cropType, quantityKg, storageType, temperatureC, humidity, harvestDate,
 *         distanceKm, travelHours, transportMode, destination, farmId, language, save }
 *
 * Temperature and humidity are optional; when omitted and the farm has
 * coordinates, they are filled from the weather service.
 */
const assessRisk = async (req, res) => {
  try {
    const body = req.body || {};
    const farmId = body.farmId ? parseInt(body.farmId, 10) : null;
    const language = body.language || 'en';

    if (!body.cropType) {
      return res.status(400).json({
        success: false,
        error: { code: 'CROP_REQUIRED', message: 'cropType is required' }
      });
    }

    console.log(`[Spoilage Controller] Assessing ${body.cropType}, storage: ${body.storageType || 'open'}, farmId: ${farmId}`);

    // Auto-fill ambient conditions from weather when the farmer did not supply them
    let conditionsSource = 'user-input';
    let temperatureC = body.temperatureC;
    let humidity = body.humidity;

    const needsWeather = temperatureC == null || humidity == null;
    if (needsWeather && farmId) {
      const coords = await getFarmCoordinates(farmId);
      if (coords) {
        const ambient = await fetchAmbientConditions(coords.lat, coords.lon);
        if (ambient) {
          if (temperatureC == null && ambient.temperatureC != null) temperatureC = ambient.temperatureC;
          if (humidity == null && ambient.humidity != null) humidity = ambient.humidity;
          conditionsSource = 'weather-api';
        }
      }
    }
    if (temperatureC == null || humidity == null) {
      conditionsSource = conditionsSource === 'weather-api' ? 'weather-api' : 'default';
    }

    const assessment = spoilageService.assessSpoilageRisk({
      ...body,
      temperatureC,
      humidity
    });

    assessment.storage.conditionsSource = conditionsSource;

    // AI advice degrades to a deterministic summary when Gemini is unavailable
    const aiAdvice = await recommendationService.generateSpoilageAdvice(assessment, language);
    assessment.aiAdvice = aiAdvice;

    // Persist only when explicitly requested and a farm is attached
    let saved = null;
    if (body.save && farmId) {
      try {
        saved = await SpoilageModel.saveAssessment(farmId, assessment);
      } catch (error) {
        console.warn('[Spoilage Controller] Could not persist assessment:', error.message);
      }
    }

    return res.status(200).json({
      success: true,
      data: assessment,
      saved: saved ? { id: saved.id, createdAt: saved.createdAt } : null,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Spoilage Controller] Error assessing risk:', error.message);
    return handleControllerError(res, error);
  }
};

/**
 * GET /api/spoilage/options
 * Supported crops and storage types for populating the form.
 */
const getOptions = async (req, res) => {
  try {
    return res.status(200).json({
      success: true,
      data: {
        crops: spoilageService.getSupportedCrops(),
        storageTypes: spoilageService.getStorageOptions(),
        transportModes: [
          { key: 'road', label: 'Truck / Tempo', icon: 'local_shipping' },
          { key: 'highway', label: 'Highway Truck', icon: 'local_shipping' },
          { key: 'tractor', label: 'Tractor Trolley', icon: 'agriculture' },
          { key: 'cart', label: 'Bullock Cart', icon: 'pets' }
        ]
      }
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

/**
 * GET /api/spoilage/history/:farmId
 */
const getHistory = async (req, res) => {
  try {
    const farmId = parseInt(req.params.farmId, 10);
    const limit = parseInt(req.query.limit, 10) || 20;
    const userId = req.user ? req.user.id : null;

    if (!farmId || Number.isNaN(farmId)) {
      return res.status(400).json({
        success: false,
        error: { code: 'FARM_ID_REQUIRED', message: 'A valid farmId is required' }
      });
    }

    if (userId) {
      const farm = await FarmModel.checkFarmOwnership(farmId, userId);
      if (!farm) {
        return res.status(403).json({
          success: false,
          error: { code: 'FARM_ACCESS_DENIED', message: 'You do not have access to this farm.' }
        });
      }
    }

    const history = await SpoilageModel.getHistoryByFarm(farmId, limit);
    return res.status(200).json({ success: true, data: history, count: history.length });
  } catch (error) {
    console.error('[Spoilage Controller] Error fetching history:', error.message);
    return handleControllerError(res, error);
  }
};

/**
 * GET /api/spoilage/health
 */
const healthCheck = async (req, res) => {
  return res.status(200).json({
    success: true,
    service: 'spoilage',
    status: 'operational',
    supportedCrops: spoilageService.getSupportedCrops().length,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  assessRisk,
  getOptions,
  getHistory,
  healthCheck
};
