-- NDVI (Normalized Difference Vegetation Index) Table
CREATE TABLE IF NOT EXISTS ndvi (
  id SERIAL PRIMARY KEY,
  farm_id INTEGER NOT NULL REFERENCES farms(id) ON DELETE CASCADE,
  ndvi_value FLOAT NOT NULL,
  image_url VARCHAR(500),
  captured_date TIMESTAMP,
  satellite_source VARCHAR(100),
  health_status VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backward-compatible migration when table already exists
ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS image_url VARCHAR(500);
ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS captured_date TIMESTAMP;
ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS satellite_source VARCHAR(100);
ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS health_status VARCHAR(50);
ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ndvi_farm_id ON ndvi(farm_id);
CREATE INDEX IF NOT EXISTS idx_ndvi_captured_date ON ndvi(captured_date);
