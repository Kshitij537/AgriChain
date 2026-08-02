const { query } = require('../config/db');

/**
 * Maps database exceptions to standard application error codes.
 */
const mapDatabaseError = (error) => {
  console.error('[Disease Model] Database error encountered:', error.message);
  const err = new Error(error.message || 'Database operation failed');

  // Postgres constraint violation (error code prefix 23)
  if (error.code && error.code.startsWith('23')) {
    err.code = 'DATABASE_CONSTRAINT_ERROR';
    return err;
  }

  // Database Connection issues
  if (error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
    err.code = 'DATABASE_UNAVAILABLE';
    return err;
  }

  // General SQL query failures
  err.code = 'DATABASE_QUERY_ERROR';
  return err;
};

/**
 * Persists a disease detection prediction to the database
 * @param {Object} predictionData - Normalized prediction object
 * @returns {Promise<Object>} - The persisted database record mapped to API model format
 */
const savePrediction = async (predictionData) => {
  const queryText = `
    INSERT INTO diseases (
      farm_id,
      disease_name,
      severity_level,
      confidence_score,
      image_url,
      description,
      treatment_recommendation,
      detected_date,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING id, farm_id, disease_name, severity_level, confidence_score, image_url, description, treatment_recommendation, detected_date, created_at;
  `;
  const values = [
    parseInt(predictionData.farmId, 10),
    predictionData.disease,
    predictionData.severity,
    parseFloat(predictionData.confidence),
    predictionData.imageUrl || null,
    predictionData.description || null,
    predictionData.recommendation
  ];

  try {
    const result = await query(queryText, values);
    const row = result.rows[0];

    return {
      id: row.id,
      farmId: row.farm_id,
      disease: row.disease_name,
      confidence: row.confidence_score,
      severity: row.severity_level,
      imageUrl: row.image_url,
      description: row.description,
      recommendation: row.treatment_recommendation,
      createdAt: row.created_at
    };
  } catch (error) {
    throw mapDatabaseError(error);
  }
};

/**
 * Fetches disease prediction history for a specific farm sorted newest-first
 * @param {number|string} farmId - The ID of the farm
 * @returns {Promise<Array>} - Array of persisted prediction records
 */
const getHistoryByFarm = async (farmId) => {
  const queryText = `
    SELECT
      id,
      farm_id,
      disease_name,
      confidence_score,
      severity_level,
      image_url,
      description,
      treatment_recommendation,
      created_at
    FROM diseases
    WHERE farm_id = $1
    ORDER BY created_at DESC;
  `;

  try {
    const result = await query(queryText, [parseInt(farmId, 10)]);

    return result.rows.map(row => ({
      id: row.id,
      farmId: row.farm_id,
      disease: row.disease_name,
      confidence: row.confidence_score,
      severity: row.severity_level,
      imageUrl: row.image_url,
      description: row.description,
      recommendation: row.treatment_recommendation,
      createdAt: row.created_at
    }));
  } catch (error) {
    throw mapDatabaseError(error);
  }
};

module.exports = {
  savePrediction,
  getHistoryByFarm
};
