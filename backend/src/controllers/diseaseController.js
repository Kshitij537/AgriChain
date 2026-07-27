const mlService = require('../services/mlService');
const FarmModel = require('../models/Farm');
const DiseaseModel = require('../models/Disease');
const { getDiseaseKnowledge, getConfidenceAssessment, DISEASE_KNOWLEDGE_BASE } = require('../constants/diseaseKnowledge');

/**
 * Finds matching class index for a disease name (e.g. "Cotton Alternaria Leaf Spot" -> 2)
 */
const findClassIndexByDiseaseName = (diseaseName) => {
  if (!diseaseName || typeof diseaseName !== 'string') return null;
  const nameLower = diseaseName.trim().toLowerCase();

  for (const [key, value] of Object.entries(DISEASE_KNOWLEDGE_BASE)) {
    const classIdx = parseInt(key, 10);
    const displayLower = `${value.crop} ${value.disease}`.toLowerCase();
    const diseaseLower = value.disease.toLowerCase();
    
    if (nameLower === displayLower || nameLower === diseaseLower || nameLower.includes(diseaseLower)) {
      return classIdx;
    }
  }
  return null;
};

/**
 * Orchestrates disease detection on an uploaded crop leaf image and enriches with agricultural advice
 */
const detectDisease = async (req, res) => {
  const farmIdRaw = req.body ? req.body.farmId : null;
  const farmId = (farmIdRaw !== undefined && farmIdRaw !== null && String(farmIdRaw).trim() !== '') ? parseInt(farmIdRaw, 10) : null;
  const userId = req.user ? req.user.id : null;
  const file = req.file;

  const topKRaw = req.query.top_k || (req.body ? req.body.top_k : 3);
  const topK = parseInt(topKRaw, 10) || 3;

  console.log(`[Disease Controller] Disease detection requested. File: ${file ? file.originalname : 'none'}, farmId: ${farmId}, topK: ${topK}`);

  if (!file) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IMAGE_REQUIRED',
        message: 'Image file is required.'
      }
    });
  }

  try {
    // Optional Farm Ownership Verification if farmId is provided
    let farm = null;
    if (farmId && userId) {
      farm = await FarmModel.checkFarmOwnership(farmId, userId);
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
    }

    // Call ML Service to perform inference
    const mlResult = await mlService.predictDisease(file, topK);
    const pred = mlResult.prediction;

    console.log(`[Disease Controller] Prediction received: ${pred.display_name} (Class Index: ${pred.class_index}, Confidence: ${pred.confidence})`);

    // Safely lookup knowledge base & confidence assessment with fallback guarantee
    let detailsContainer = null;
    try {
      const knowledge = getDiseaseKnowledge(pred.class_index);
      const confAssessment = getConfidenceAssessment(pred.confidence);

      detailsContainer = {
        description: knowledge.description,
        symptoms: knowledge.symptoms || [],
        causes: knowledge.causes || [],
        recommendations: knowledge.recommendations || [],
        prevention: knowledge.prevention || [],
        severity_level: knowledge.severity_level || (pred.is_healthy ? 'Healthy' : 'Moderate Advisory'),
        advisory: knowledge.advisory,
        confidence_assessment: confAssessment,
        sources: knowledge.sources || []
      };
    } catch (kErr) {
      console.warn('[Disease Controller] Knowledge lookup warning:', kErr.message);
      detailsContainer = {
        description: "Detailed agricultural extension information is currently unavailable.",
        symptoms: [],
        causes: [],
        recommendations: ["Consult a local agricultural extension specialist."],
        prevention: ["Follow standard crop care routines."],
        severity_level: pred.is_healthy ? "Healthy" : "Moderate Advisory",
        advisory: "Information provided is for decision support only.",
        confidence_assessment: getConfidenceAssessment(pred.confidence),
        sources: []
      };
    }

    // Optional Database Persistence if farmId was provided
    let dbRecord = null;
    if (farmId) {
      try {
        dbRecord = await DiseaseModel.savePrediction({
          farmId,
          disease: pred.display_name,
          confidence: pred.confidence,
          severity: detailsContainer.severity_level,
          description: detailsContainer.description,
          recommendation: detailsContainer.recommendations.join('; ')
        });
        console.log(`[Disease Controller] Prediction record persisted to DB (Record ID: ${dbRecord.id})`);
      } catch (dbErr) {
        console.warn('[Disease Controller] DB persistence warning:', dbErr.message);
      }
    }

    // Return standardized successful prediction response
    const responseData = {
      success: true,
      data: {
        prediction: {
          class_index: pred.class_index,
          crop: pred.crop,
          disease: pred.disease,
          display_name: pred.display_name,
          is_healthy: pred.is_healthy,
          confidence: pred.confidence
        },
        top_predictions: mlResult.top_predictions,
        model_version: mlResult.model_version,
        details: detailsContainer
      }
    };

    if (dbRecord) {
      responseData.data.record = {
        id: dbRecord.id,
        farmId: dbRecord.farmId,
        createdAt: dbRecord.createdAt
      };
    }

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('[Disease Controller] Error during disease detection:', error.message);

    if (error.code === 'INVALID_IMAGE' || error.statusCode === 400) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_IMAGE',
          message: error.message || 'Uploaded image is invalid or undecodable.'
        }
      });
    }

    if (error.code === 'FILE_TOO_LARGE' || error.statusCode === 413) {
      return res.status(413).json({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: error.message || 'Uploaded file size exceeds maximum 10 MB limit.'
        }
      });
    }

    if (error.code === 'UNSUPPORTED_MEDIA_TYPE' || error.statusCode === 415) {
      return res.status(415).json({
        success: false,
        error: {
          code: 'UNSUPPORTED_MEDIA_TYPE',
          message: error.message || 'Unsupported image format.'
        }
      });
    }

    if (error.code === 'INVALID_PARAM' || error.statusCode === 422) {
      return res.status(422).json({
        success: false,
        error: {
          code: 'INVALID_PARAM',
          message: error.message || 'Invalid top_k parameter.'
        }
      });
    }

    if (error.code === 'ML_SERVICE_UNAVAILABLE') {
      return res.status(503).json({
        success: false,
        error: {
          code: 'ML_SERVICE_UNAVAILABLE',
          message: 'Disease detection engine is temporarily offline.'
        }
      });
    }

    if (error.code === 'ML_SERVICE_TIMEOUT') {
      return res.status(504).json({
        success: false,
        error: {
          code: 'ML_SERVICE_TIMEOUT',
          message: 'Disease detection request timed out.'
        }
      });
    }

    if (error.code === 'INVALID_ML_RESPONSE') {
      return res.status(502).json({
        success: false,
        error: {
          code: 'INVALID_ML_RESPONSE',
          message: 'Inference computation returned an invalid response structure.'
        }
      });
    }

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
 * Endpoint for checking ML service health status
 */
const getMLHealth = async (req, res) => {
  try {
    const mlHealthy = await mlService.checkMLHealth();
    return res.status(200).json({
      success: true,
      backend: 'healthy',
      ml_service: mlHealthy ? 'healthy' : 'unavailable'
    });
  } catch (err) {
    return res.status(200).json({
      success: true,
      backend: 'healthy',
      ml_service: 'unavailable'
    });
  }
};

/**
 * Fetches disease prediction history for a farm owned by the authenticated user
 */
const getHistoryByFarm = async (req, res) => {
  const farmId = parseInt(req.params.farmId, 10);
  const userId = req.user ? req.user.id : null;

  if (isNaN(farmId) || farmId <= 0) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FARM_ID',
        message: 'Farm ID must be a positive integer.'
      }
    });
  }

  try {
    if (userId) {
      const farm = await FarmModel.checkFarmOwnership(farmId, userId);
      if (!farm) {
        return res.status(403).json({
          success: false,
          error: {
            code: 'FARM_ACCESS_DENIED',
            message: 'You do not have access to this farm.'
          }
        });
      }
    }

    const historyRows = await DiseaseModel.getHistoryByFarm(farmId);

    // Reconstruct Phase 3.3 details for each historical record with fallback safety
    const enrichedHistory = historyRows.map(row => {
      let classIdx = findClassIndexByDiseaseName(row.disease);
      let knowledge = getDiseaseKnowledge(classIdx !== null ? classIdx : 999);
      let confAssessment = getConfidenceAssessment(row.confidence);

      return {
        id: row.id,
        farm_id: row.farmId,
        disease_name: row.disease,
        severity_level: row.severity || knowledge.severity_level,
        confidence_score: row.confidence,
        description: row.description || knowledge.description,
        treatment_recommendation: row.recommendation || knowledge.recommendations.join('; '),
        detected_date: row.createdAt,
        created_at: row.createdAt,
        details: {
          description: knowledge.description,
          symptoms: knowledge.symptoms || [],
          causes: knowledge.causes || [],
          recommendations: knowledge.recommendations || [],
          prevention: knowledge.prevention || [],
          severity_level: row.severity || knowledge.severity_level,
          advisory: knowledge.advisory,
          confidence_assessment: confAssessment,
          sources: knowledge.sources || []
        }
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        count: enrichedHistory.length,
        history: enrichedHistory
      }
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
  getMLHealth,
  getHistoryByFarm
};
