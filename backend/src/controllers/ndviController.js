const ndviService = require('../services/ndviService');
const crypto = require('crypto');
const ndviStorage = require('../services/ndviStorageService');
const { computeTrendFromSeries, buildDropAlert } = require('../utils/ndviUtils');

const computeFieldId = (coordinates) => {
  const hash = crypto.createHash('sha256').update(JSON.stringify(coordinates)).digest('hex').slice(0, 16);
  return `field_${hash}`;
};

/**
 * NDVI Controller - Handles NDVI calculation requests
 */

/**
 * POST /api/ndvi/calculate
 * Calculate NDVI for a farm boundary
 */
const calculateNDVI = async (req, res) => {
  try {
    const { coordinates, fieldId: inputFieldId } = req.body;

    // Validate request body
    if (!coordinates) {
      return res.status(400).json({
        success: false,
        error: 'Coordinates are required'
      });
    }

    console.log('[NDVI Controller] Received NDVI calculation request');

    // Calculate NDVI
    const result = await ndviService.calculateNDVI(coordinates);

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

    const statusCode = error.message.includes('not found') ? 404 : 
                      error.message.includes('required') ? 400 : 500;

    res.status(statusCode).json({
      success: false,
      error: error.message || 'Failed to calculate NDVI'
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
      for (const point of seriesResult.data) {
        if (!point?.date || typeof point?.ndvi !== 'number') continue;
        const classification = ndviService.getHealthClassification(point.ndvi);
        await ndviStorage.upsertMeasurement({
          fieldId,
          capturedDate: point.date,
          ndviValue: point.ndvi,
          healthStatus: classification.health,
          imageDate: point.date,
          cloudCoverage: null,
          source: 'satellite-service-timeseries',
        });
      }
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

module.exports = {
  calculateNDVI,
  getHealthStatus,
  getTimeSeries,
  getHistory
};
