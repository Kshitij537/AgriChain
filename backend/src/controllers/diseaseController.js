const mlService = require('../services/mlService');
const { checkFarmOwnership } = require('../models/Farm');
const { savePredictionPlaceholder, getHistoryByFarmPlaceholder } = require('../models/Disease');

/**
 * Orchestrates disease detection on an uploaded crop leaf image
 */
const detectDisease = async (req, res) => {
  const farmId = parseInt(req.body.farmId, 10);
  const userId = req.user.id;
  const file = req.file;

  console.log(`[Disease Controller] Disease detection requested for farm ${farmId} by user ${userId}`);

  try {
    // Step 1: Farm Ownership Verification
    const farm = await checkFarmOwnership(farmId, userId);
    if (!farm) {
      console.warn(`[Disease Controller] Access denied: User ${userId} does not own farm ${farmId}`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'FARM_ACCESS_DENIED',
          message: 'You do not have access to this farm.'
        }
      });
    }
    console.log(`[Disease Controller] Farm ownership verified for farm ${farmId}`);

    // Step 2: Call ML Service
    console.log(`[Disease Controller] Calling ML Service for file ${file.originalname}...`);
    const prediction = await mlService.predictDisease(file);
    console.log(`[Disease Controller] ML prediction received successfully: ${prediction.disease} (${prediction.confidence}%)`);

    // Step 3: Prepare persistence metadata
    const predictionData = {
      farmId,
      disease: prediction.disease,
      confidence: prediction.confidence,
      severity: prediction.severity,
      recommendation: prediction.recommendation,
      detectedBy: userId
    };

    // Step 4: Run placeholder database persistence
    const record = await savePredictionPlaceholder(predictionData);
    console.log(`[Disease Controller] Prediction prepared and placeholder saved (Record ID: ${record.id})`);

    // Step 5: Send standardized response
    console.log('[Disease Controller] Sending successful response');
    return res.status(200).json({
      success: true,
      message: 'Disease detected successfully.',
      data: {
        prediction: {
          disease: prediction.disease,
          confidence: prediction.confidence,
          severity: prediction.severity,
          recommendation: prediction.recommendation
        },
        record: {
          id: record.id,
          farmId: record.farmId,
          createdAt: record.createdAt
        }
      }
    });

  } catch (error) {
    console.error('[Disease Controller] Error during disease detection:', error.message);

    // Map ML Service application errors to standard status codes
    if (error.code === 'ML_SERVICE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        error: {
          code: 'ML_SERVICE_UNAVAILABLE',
          message: error.message || 'Disease detection engine is temporarily offline'
        }
      });
    }

    if (error.code === 'ML_SERVICE_TIMEOUT') {
      return res.status(504).json({
        success: false,
        error: {
          code: 'ML_SERVICE_TIMEOUT',
          message: error.message || 'Disease detection request timed out'
        }
      });
    }

    if (error.code === 'INVALID_ML_RESPONSE') {
      return res.status(502).json({
        success: false,
        error: {
          code: 'INVALID_ML_RESPONSE',
          message: error.message || 'Inference computation returned an invalid response'
        }
      });
    }

    if (error.code === 'ML_SERVICE_ERROR') {
      return res.status(500).json({
        success: false,
        error: {
          code: 'ML_SERVICE_ERROR',
          message: error.message || 'Inference computation failed on the ML engine'
        }
      });
    }

    // Default catch-all
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred.'
      }
    });
  }
};

/**
 * Fetches disease prediction history for a farm owned by the authenticated user
 */
const getHistoryByFarm = async (req, res) => {
  const farmId = parseInt(req.params.farmId, 10);
  const userId = req.user.id;

  console.log(`[Disease Controller] History fetch requested for farm ${farmId} by user ${userId}`);

  try {
    // Step 1: Farm Ownership Verification
    const farm = await checkFarmOwnership(farmId, userId);
    if (!farm) {
      console.warn(`[Disease Controller] Access denied: User ${userId} does not own farm ${farmId}`);
      return res.status(403).json({
        success: false,
        error: {
          code: 'FARM_ACCESS_DENIED',
          message: 'You do not have access to this farm.'
        }
      });
    }
    console.log(`[Disease Controller] Farm ownership verified for farm ${farmId}`);

    // Step 2: Fetch prediction history from placeholder
    const history = await getHistoryByFarmPlaceholder(farmId);
    console.log(`[Disease Controller] Returning history containing ${history.length} records`);

    return res.status(200).json({
      success: true,
      count: history.length,
      history: history
    });

  } catch (error) {
    console.error('[Disease Controller] Error fetching history:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected internal error occurred.'
      }
    });
  }
};

module.exports = {
  detectDisease,
  getHistoryByFarm
};
