-- Farms Table
CREATE TABLE IF NOT EXISTS farms (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  location VARCHAR(255),
  latitude FLOAT,
  longitude FLOAT,
  area_hectares FLOAT,
  crop_type VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for user_id lookups
CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms(user_id);
