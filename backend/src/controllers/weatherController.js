const weatherService = require('../services/weatherService');

/**
 * Weather Controller - Handles weather-related HTTP requests
 */

/**
 * GET /api/weather/current?lat=...&lon=...
 * Get current weather for location
 */
const getCurrentWeather = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required. Use ?lat=...&lon=...'
      });
    }

    console.log(`[Weather Controller] Fetching current weather for ${lat}, ${lon}`);

    const weather = await weatherService.getEnhancedCurrentWeather(lat, lon);

    res.status(200).json({
      success: true,
      data: weather,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Weather Controller] Error fetching current weather:', error.message);
    handleControllerError(res, error);
  }
};

/**
 * GET /api/weather/forecast?lat=...&lon=...&days=7
 * Get multi-day weather forecast
 */
const getForecast = async (req, res) => {
  try {
    const { lat, lon, days = 7 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    console.log(`[Weather Controller] Fetching ${days}-day forecast for ${lat}, ${lon}`);

    const forecast = await weatherService.getWeatherForecast(lat, lon, parseInt(days, 10));

    res.status(200).json({
      success: true,
      days: parseInt(days, 10),
      data: forecast,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Weather Controller] Error fetching forecast:', error.message);
    handleControllerError(res, error);
  }
};

/**
 * GET /api/weather/hourly?lat=...&lon=...&hours=24
 * Get hourly weather forecast
 */
const getHourly = async (req, res) => {
  try {
    const { lat, lon, hours = 24 } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    console.log(`[Weather Controller] Fetching ${hours}-hour forecast for ${lat}, ${lon}`);

    const hourly = await weatherService.getHourlyForecast(lat, lon, parseInt(hours, 10));

    res.status(200).json({
      success: true,
      hours: parseInt(hours, 10),
      data: hourly,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Weather Controller] Error fetching hourly forecast:', error.message);
    handleControllerError(res, error);
  }
};

/**
 * GET /api/weather/alerts?lat=...&lon=...
 * Get weather alerts for location
 */
const getAlerts = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    console.log(`[Weather Controller] Fetching weather alerts for ${lat}, ${lon}`);

    const alerts = await weatherService.getWeatherAlerts(lat, lon);

    res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Weather Controller] Error fetching alerts:', error.message);
    // For alerts, return empty array on error rather than failing
    res.status(200).json({
      success: true,
      count: 0,
      data: [],
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};

/**
 * GET /api/weather/disease-risk?lat=...&lon=...
 * Calculate disease risk based on weather conditions
 */
const getDiseaseRisk = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    console.log(`[Weather Controller] Calculating disease risk for ${lat}, ${lon}`);

    const diseaseRisk = await weatherService.calculateDiseaseRisk(lat, lon);

    res.status(200).json({
      success: true,
      data: diseaseRisk,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Weather Controller] Error calculating disease risk:', error.message);
    handleControllerError(res, error);
  }
};

/**
 * GET /api/weather/recommendations?lat=...&lon=...
 * Get farming activity recommendations based on weather
 */
const getRecommendations = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    console.log(`[Weather Controller] Generating farming recommendations for ${lat}, ${lon}`);

    const recommendations = await weatherService.getFarmingRecommendations(lat, lon);

    res.status(200).json({
      success: true,
      count: recommendations.length,
      data: recommendations,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Weather Controller] Error generating recommendations:', error.message);
    handleControllerError(res, error);
  }
};

/**
 * GET /api/weather/complete?lat=...&lon=...
 * Get all weather data in a single request (optimized for dashboard)
 */
const getCompleteWeather = async (req, res) => {
  try {
    const { lat, lon } = req.query;

    if (!lat || !lon) {
      return res.status(400).json({
        success: false,
        error: 'Latitude and longitude are required'
      });
    }

    console.log(`[Weather Controller] Fetching complete weather data for ${lat}, ${lon}`);

    const completeData = await weatherService.getCompleteWeatherData(lat, lon);

    res.status(200).json(completeData);

  } catch (error) {
    console.error('[Weather Controller] Error fetching complete weather data:', error.message);
    handleControllerError(res, error);
  }
};

/**
 * GET /api/weather/health
 * Health check endpoint for weather service
 */
const healthCheck = (req, res) => {
  const apiUrl = process.env.WEATHER_API_URL || 'https://api.open-meteo.com/v1';

  res.status(200).json({
    success: true,
    service: 'Weather Intelligence API',
    status: 'operational',
    provider: 'Open-Meteo (Free, No API Key Required)',
    config: {
      apiUrl: apiUrl,
      cacheDuration: `${process.env.WEATHER_CACHE_DURATION || 10} minutes`,
      apiKeyRequired: false
    },
    endpoints: [
      'GET /api/weather/current?lat=...&lon=...',
      'GET /api/weather/forecast?lat=...&lon=...&days=7',
      'GET /api/weather/hourly?lat=...&lon=...&hours=24',
      'GET /api/weather/alerts?lat=...&lon=...',
      'GET /api/weather/disease-risk?lat=...&lon=...',
      'GET /api/weather/recommendations?lat=...&lon=...',
      'GET /api/weather/complete?lat=...&lon=...'
    ],
    timestamp: new Date().toISOString()
  });
};

/**
 * Handle controller errors consistently
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 */
const handleControllerError = (res, error) => {
  const errorMessage = error.message || 'Weather service error';
  const lower = errorMessage.toLowerCase();

  let statusCode = 500;

  if (lower.includes('required') || lower.includes('invalid')) {
    statusCode = 400;
  } else if (lower.includes('not available') || lower.includes('unavailable')) {
    statusCode = 503;
  } else if (lower.includes('not found')) {
    statusCode = 404;
  } else if (lower.includes('too many')) {
    statusCode = 429;
  } else if (lower.includes('timeout')) {
    statusCode = 504;
  }

  res.status(statusCode).json({
    success: false,
    error: errorMessage,
    timestamp: new Date().toISOString()
  });
};

module.exports = {
  getCurrentWeather,
  getForecast,
  getHourly,
  getAlerts,
  getDiseaseRisk,
  getRecommendations,
  getCompleteWeather,
  healthCheck
};
