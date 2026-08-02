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

-- Backward-compatible migration when table already exists
ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS health_status VARCHAR(50);
ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS image_date DATE;
ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS cloud_coverage FLOAT;
ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS source VARCHAR(100);
ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Prevent duplicates for same field + day
CREATE UNIQUE INDEX IF NOT EXISTS uq_ndvi_history_field_date
  ON ndvi_history(field_id, captured_date);

CREATE INDEX IF NOT EXISTS idx_ndvi_history_field_id
  ON ndvi_history(field_id);

CREATE INDEX IF NOT EXISTS idx_ndvi_history_captured_date
  ON ndvi_history(captured_date);
