const express = require('express');
const router = express.Router();
const weatherController = require('../controllers/weatherController');

/**
 * Weather Routes
 * Handles weather intelligence endpoints for farming
 */

// Health check
// GET /api/weather/health
router.get('/health', weatherController.healthCheck);

// Get current weather for location
// GET /api/weather/current?lat=...&lon=...
router.get('/current', weatherController.getCurrentWeather);

// Get multi-day weather forecast
// GET /api/weather/forecast?lat=...&lon=...&days=7
router.get('/forecast', weatherController.getForecast);

// Get hourly weather forecast
// GET /api/weather/hourly?lat=...&lon=...&hours=24
router.get('/hourly', weatherController.getHourly);

// Get weather alerts
// GET /api/weather/alerts?lat=...&lon=...
router.get('/alerts', weatherController.getAlerts);

// Get disease risk assessment
// GET /api/weather/disease-risk?lat=...&lon=...
router.get('/disease-risk', weatherController.getDiseaseRisk);

// Get farming activity recommendations
// GET /api/weather/recommendations?lat=...&lon=...
router.get('/recommendations', weatherController.getRecommendations);

// Get complete weather data (all-in-one for dashboard)
// GET /api/weather/complete?lat=...&lon=...
router.get('/complete', weatherController.getCompleteWeather);

module.exports = router;
