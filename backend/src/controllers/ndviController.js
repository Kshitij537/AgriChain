const ndviService = require('../services/ndviService');

/**
 * NDVI Controller - Handles NDVI calculation requests
 */

/**
 * POST /api/ndvi/calculate
 * Calculate NDVI for a farm boundary
 */
const calculateNDVI = async (req, res) => {
  try {
    const { coordinates } = req.body;

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

    res.status(200).json(result);

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
  getHealthStatus
};
