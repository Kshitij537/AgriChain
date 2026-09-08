const { query } = require('../config/db');

/**
 * Maps database exceptions to standard application error codes.
 */
const mapDatabaseError = (error) => {
  console.error('[Spoilage Model] Database error encountered:', error.message);
  const err = new Error(error.message || 'Database operation failed');

  if (error.code && error.code.startsWith('23')) {
    err.code = 'DATABASE_CONSTRAINT_ERROR';
    return err;
  }
  if (error.code === 'ECONNREFUSED' || error.message.includes('connect')) {
    err.code = 'DATABASE_UNAVAILABLE';
    return err;
  }
  err.code = 'DATABASE_QUERY_ERROR';
  return err;
};

/**
 * Maps a database row to the API model shape.
 */
const mapRow = (row) => ({
  id: row.id,
  farmId: row.farm_id,
  cropBatchId: row.crop_batch_id,
  riskPercentage: row.spoilage_risk_percentage,
  storageCondition: row.storage_condition,
  expectedShelfLife: row.expected_shelf_life,
  currentCondition: row.current_condition,
  recommendation: row.recommendation,
  assessmentDate: row.assessment_date,
  createdAt: row.created_at
});

/**
 * Persists a spoilage assessment. The full assessment object is flattened onto
 * the existing spoilage table columns.
 */
const saveAssessment = async (farmId, assessment) => {
  const queryText = `
    INSERT INTO spoilage (
      farm_id,
      crop_batch_id,
      spoilage_risk_percentage,
      storage_condition,
      expected_shelf_life,
      current_condition,
      recommendation,
      assessment_date,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    RETURNING id, farm_id, crop_batch_id, spoilage_risk_percentage, storage_condition,
              expected_shelf_life, current_condition, recommendation, assessment_date, created_at;
  `;

  // Top recommendation is stored as the actionable summary line
  const topAction = assessment.recommendations && assessment.recommendations.length > 0
    ? `${assessment.recommendations[0].title}: ${assessment.recommendations[0].detail}`
    : assessment.risk.headline;

  const values = [
    parseInt(farmId, 10),
    assessment.crop.label,
    assessment.risk.score,
    assessment.storage.label,
    Math.round(assessment.shelfLife.effectiveDays),
    assessment.risk.label,
    topAction
  ];

  try {
    const result = await query(queryText, values);
    return mapRow(result.rows[0]);
  } catch (error) {
    throw mapDatabaseError(error);
  }
};

/**
 * Returns recent assessments for a farm, newest first.
 */
const getHistoryByFarm = async (farmId, limit = 20) => {
  const queryText = `
    SELECT id, farm_id, crop_batch_id, spoilage_risk_percentage, storage_condition,
           expected_shelf_life, current_condition, recommendation, assessment_date, created_at
    FROM spoilage
    WHERE farm_id = $1
    ORDER BY created_at DESC
    LIMIT $2;
  `;
  try {
    const result = await query(queryText, [parseInt(farmId, 10), parseInt(limit, 10)]);
    return result.rows.map(mapRow);
  } catch (error) {
    throw mapDatabaseError(error);
  }
};

/**
 * Most recent assessment for a farm, or null when none exists.
 */
const getLatestByFarm = async (farmId) => {
  const rows = await getHistoryByFarm(farmId, 1);
  return rows.length > 0 ? rows[0] : null;
};

const deleteAssessment = async (id, farmId) => {
  const queryText = 'DELETE FROM spoilage WHERE id = $1 AND farm_id = $2 RETURNING id;';
  try {
    const result = await query(queryText, [parseInt(id, 10), parseInt(farmId, 10)]);
    return result.rows.length > 0;
  } catch (error) {
    throw mapDatabaseError(error);
  }
};

module.exports = {
  saveAssessment,
  getHistoryByFarm,
  getLatestByFarm,
  deleteAssessment
};
