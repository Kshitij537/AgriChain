const express = require('express');
const router = express.Router();
const ndviController = require('../controllers/ndviController');

/**
 * NDVI Routes
 * Handles satellite imagery and NDVI calculation endpoints
 */

// Calculate NDVI for a farm boundary
// POST /api/ndvi/calculate
router.post('/calculate', ndviController.calculateNDVI);

// Get NDVI time series for a boundary
// POST /api/ndvi/timeseries
router.post('/timeseries', ndviController.getTimeSeries);

// Get stored NDVI history (requires fieldId query param)
// GET /api/ndvi/history?fieldId=...&days=30
router.get('/history', ndviController.getHistory);

// Get health classification for an NDVI value
// GET /api/ndvi/health/:ndviValue
router.get('/health/:ndviValue', ndviController.getHealthStatus);

module.exports = router;
