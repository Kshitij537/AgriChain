-- Disease Detection Table
CREATE TABLE IF NOT EXISTS diseases (
  id SERIAL PRIMARY KEY,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  disease_name VARCHAR(255) NOT NULL,
  severity_level VARCHAR(50),
  confidence_score FLOAT,
  image_url VARCHAR(500),
  description TEXT,
  treatment_recommendation TEXT,
  detected_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backward-compatible migration when table already exists
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS severity_level VARCHAR(50);
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS confidence_score FLOAT;
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS treatment_recommendation TEXT;
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS detected_date TIMESTAMP;
ALTER TABLE diseases ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_diseases_farm_id ON diseases(farm_id);
CREATE INDEX IF NOT EXISTS idx_diseases_detected_date ON diseases(detected_date);
