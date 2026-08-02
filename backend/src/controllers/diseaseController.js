const mlService = require('../services/mlService');
const FarmModel = require('../models/Farm');
const DiseaseModel = require('../models/Disease');
const { getDiseaseKnowledge, getConfidenceAssessment, DISEASE_KNOWLEDGE_BASE } = require('../constants/diseaseKnowledge');
const { query } = require('../config/db');

/**
 * Resolves the target farm ID: uses provided farmId, or looks up user's first farm,
 * or falls back to the first farm in the database.
 */
const resolveTargetFarmId = async (farmId, userId) => {
  try {
    // Priority 1: User's own first farm (most reliable)
    if (userId) {
      const res = await query('SELECT id FROM farms WHERE user_id = $1 ORDER BY id ASC LIMIT 1', [userId]);
      if (res.rows.length > 0) return res.rows[0].id;
    }

    // Priority 2: Explicitly provided farmId (if it actually exists)
    if (farmId && !isNaN(farmId)) {
      const res = await query('SELECT id FROM farms WHERE id = $1 LIMIT 1', [farmId]);
      if (res.rows.length > 0) return res.rows[0].id;
    }

    // Priority 3: First farm in entire DB (last resort, for anonymous requests)
    const res2 = await query('SELECT id FROM farms ORDER BY id ASC LIMIT 1', []);
    if (res2.rows.length > 0) return res2.rows[0].id;
  } catch (e) {
    console.warn('[Disease Controller] Could not resolve farm ID:', e.message);
  }
  return null;
};

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

const path = require('path');
const fs = require('fs');

/**
 * Saves uploaded file buffer to uploads/diseases/ directory and returns web relative URL
 */
const saveUploadedLeafImage = (file) => {
  if (!file || !file.buffer) return null;
  try {
    const uploadsDir = path.join(__dirname, '../../uploads/diseases');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const ext = path.extname(file.originalname || '.jpg').toLowerCase() || '.jpg';
    const filename = `leaf_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
    const filePath = path.join(uploadsDir, filename);
    fs.writeFileSync(filePath, file.buffer);
    return `/uploads/diseases/${filename}`;
  } catch (err) {
    console.warn('[Disease Controller] Error saving leaf image file:', err.message);
    return null;
  }
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
    // Save uploaded leaf image to disk for static serving in history reports
    const imageUrl = saveUploadedLeafImage(file);

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

    // Database Persistence: Save prediction to user's actual farm
    const targetFarmId = await resolveTargetFarmId(farmId, userId);
    let dbRecord = null;
    if (targetFarmId) {
      try {
        dbRecord = await DiseaseModel.savePrediction({
          farmId: targetFarmId,
          disease: pred.display_name,
          confidence: pred.confidence,
          severity: detailsContainer.severity_level,
          imageUrl: imageUrl,
          description: detailsContainer.description,
          recommendation: detailsContainer.recommendations.join('; ')
        });
        console.log(`[Disease Controller] Prediction persisted to DB (Record ID: ${dbRecord.id}, Farm: ${targetFarmId})`);
      } catch (dbErr) {
        console.error('[Disease Controller] DB persistence FAILED:', dbErr.message);
      }
    } else {
      console.warn('[Disease Controller] No valid farm found — scan not persisted to DB');
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
          confidence: pred.confidence,
          image_url: imageUrl
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
        imageUrl: dbRecord.imageUrl,
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

    if (error.code === 'ML_SERVICE_UNAVAILABLE' || error.code === 'ML_SERVICE_ERROR') {
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
  const requestedFarmId = parseInt(req.params.farmId, 10);
  const userId = req.user ? req.user.id : null;

  // Resolve a real farm: use requested farmId if valid, else user's first farm, else first in DB
  const farmId = await resolveTargetFarmId(
    isNaN(requestedFarmId) ? null : requestedFarmId,
    userId
  );

  if (!farmId) {
    return res.status(200).json({
      success: true,
      data: { count: 0, history: [] }
    });
  }

  try {
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
        image_url: row.imageUrl || row.image_url || null,
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


/**
 * Generates unified multi-source field & disease advisory
 */
const getCombinedAdvisory = async (req, res) => {
  try {
    const { diseaseData, farmData, ndviData, weatherData, language = 'en' } = req.body;
    const recommendationService = require('../services/recommendationService');

    const advisory = await recommendationService.generateCombinedFieldAdvisory({
      diseaseName: diseaseData?.disease_name || diseaseData?.disease,
      severity: diseaseData?.severity_level || diseaseData?.severity,
      confidence: diseaseData?.confidence_score || diseaseData?.confidence,
      farmName: farmData?.name,
      cropType: farmData?.crop_type,
      ndviValue: ndviData?.ndvi_value,
      ndviHealth: ndviData?.health_status,
      temp: weatherData?.temp,
      humidity: weatherData?.humidity,
      weatherDesc: weatherData?.condition || weatherData?.description,
      language
    });

    return res.status(200).json({
      success: true,
      data: advisory
    });
  } catch (error) {
    console.error('[Disease Controller] Error generating combined advisory:', error.message);
    return res.status(500).json({
      success: false,
      error: {
        code: 'ADVISORY_GENERATION_FAILED',
        message: 'Could not generate field advisory.'
      }
    });
  }
};

module.exports = {
  detectDisease,
  getMLHealth,
  getHistoryByFarm,
  getCombinedAdvisory
};

