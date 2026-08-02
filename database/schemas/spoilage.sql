-- Spoilage Risk Table
CREATE TABLE IF NOT EXISTS spoilage (
  id SERIAL PRIMARY KEY,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  crop_batch_id VARCHAR(100),
  spoilage_risk_percentage FLOAT,
  storage_condition VARCHAR(100),
  expected_shelf_life INTEGER,
  current_condition VARCHAR(100),
  recommendation TEXT,
  assessment_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backward-compatible migration when table already exists
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS crop_batch_id VARCHAR(100);
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS spoilage_risk_percentage FLOAT;
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS storage_condition VARCHAR(100);
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS expected_shelf_life INTEGER;
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS current_condition VARCHAR(100);
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS recommendation TEXT;
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS assessment_date TIMESTAMP;
ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_spoilage_farm_id ON spoilage(farm_id);
CREATE INDEX IF NOT EXISTS idx_spoilage_assessment_date ON spoilage(assessment_date);
