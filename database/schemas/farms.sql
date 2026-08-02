-- Farms Table
CREATE TABLE IF NOT EXISTS farms (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  latitude FLOAT,
  longitude FLOAT,
  area_hectares FLOAT,
  boundary_coordinates JSONB,
  crop_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Backward-compatible migration when table already exists
ALTER TABLE farms ADD COLUMN IF NOT EXISTS location VARCHAR(255);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS latitude FLOAT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS longitude FLOAT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS area_hectares FLOAT;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS boundary_coordinates JSONB;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS crop_type VARCHAR(100);
ALTER TABLE farms ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE farms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms(user_id);
