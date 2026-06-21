const { query } = require('../config/db');

const toDateOnly = (value) => {
  if (!value) return null;
  // Accept YYYY-MM-DD or ISO strings
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
};

const upsertMeasurement = async ({
  fieldId,
  capturedDate,
  ndviValue,
  healthStatus,
  imageDate,
  cloudCoverage,
  source,
}) => {
  const captured = capturedDate || toDateOnly(imageDate) || toDateOnly(new Date());
  const image = toDateOnly(imageDate);

  const result = await query(
    `INSERT INTO ndvi_history (
      field_id,
      captured_date,
      ndvi_value,
      health_status,
      image_date,
      cloud_coverage,
      source
    ) VALUES ($1, $2::date, $3, $4, $5::date, $6, $7)
    ON CONFLICT (field_id, captured_date)
    DO UPDATE SET
      ndvi_value = EXCLUDED.ndvi_value,
      health_status = EXCLUDED.health_status,
      image_date = COALESCE(EXCLUDED.image_date, ndvi_history.image_date),
      cloud_coverage = COALESCE(EXCLUDED.cloud_coverage, ndvi_history.cloud_coverage),
      source = COALESCE(EXCLUDED.source, ndvi_history.source)
    RETURNING *;`,
    [
      fieldId,
      captured,
      ndviValue,
      healthStatus || null,
      image,
      typeof cloudCoverage === 'number' ? cloudCoverage : null,
      source || null,
    ]
  );

  return result.rows[0];
};

const getLatestMeasurement = async (fieldId) => {
  const result = await query(
    `SELECT *
     FROM ndvi_history
     WHERE field_id = $1
     ORDER BY captured_date DESC
     LIMIT 1;`,
    [fieldId]
  );

  return result.rows[0] || null;
};

const getPreviousMeasurement = async (fieldId, beforeDate) => {
  const result = await query(
    `SELECT *
     FROM ndvi_history
     WHERE field_id = $1
       AND captured_date < $2::date
     ORDER BY captured_date DESC
     LIMIT 1;`,
    [fieldId, beforeDate]
  );

  return result.rows[0] || null;
};

const getHistory = async (fieldId, days = 30) => {
  const safeDays = Math.max(1, Math.min(365, parseInt(days, 10) || 30));
  const result = await query(
    `SELECT field_id, captured_date, ndvi_value, health_status, image_date, cloud_coverage, source
     FROM ndvi_history
     WHERE field_id = $1
       AND captured_date >= (CURRENT_DATE - $2::int)
     ORDER BY captured_date ASC;`,
    [fieldId, safeDays]
  );

  return result.rows;
};

module.exports = {
  upsertMeasurement,
  getLatestMeasurement,
  getPreviousMeasurement,
  getHistory,
};
