-- NDVI history table (field-based)
-- Stores NDVI values over time for trend/alerts.

CREATE TABLE IF NOT EXISTS ndvi_history (
  id SERIAL PRIMARY KEY,
  field_id VARCHAR(128) NOT NULL,
  captured_date DATE NOT NULL,
  ndvi_value FLOAT NOT NULL,
  health_status VARCHAR(50),
  image_date DATE,
  cloud_coverage FLOAT,
  source VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Prevent duplicates for same field + day
CREATE UNIQUE INDEX IF NOT EXISTS uq_ndvi_history_field_date
  ON ndvi_history(field_id, captured_date);

CREATE INDEX IF NOT EXISTS idx_ndvi_history_field_id
  ON ndvi_history(field_id);

CREATE INDEX IF NOT EXISTS idx_ndvi_history_captured_date
  ON ndvi_history(captured_date);
