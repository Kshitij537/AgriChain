-- =============================================================================
-- AgriChain Market Intelligence Schema
-- =============================================================================
-- Tables backing the market recommendation engine.
--
-- Money is NUMERIC, never FLOAT: these values are rupees a farmer will act on,
-- and binary floating point cannot represent them exactly.
--
-- This file is idempotent and is executed on backend startup by
-- backend/src/config/db.js. It is also safe to apply by hand:
--   psql -U postgres -d agrichain_db -f database/schemas/market.sql
-- =============================================================================

-- -----------------------------------------------------------------------------
-- markets: APMC / mandi master data
-- -----------------------------------------------------------------------------
-- coordinate_source records how precise latitude/longitude actually are.
-- CITY_CENTROID means the town centre, not the surveyed APMC yard gate, and
-- road distance derived from it carries that same uncertainty.
CREATE TABLE IF NOT EXISTS markets (
  id SERIAL PRIMARY KEY,
  market_code VARCHAR(64) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  state VARCHAR(100) NOT NULL,
  district VARCHAR(100) NOT NULL,
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),
  coordinate_source VARCHAR(32) DEFAULT 'CITY_CENTROID',
  -- LEGACY. These held the data.gov.in dataset's own market/district spellings
  -- when that integration existed. Superseded by market_provider_map, which is
  -- per-provider and records how confident each mapping is. Retained because the
  -- strings are a useful starting point if an authorised data.gov.in provider is
  -- added later; NOT read by any ingestion path.
  agmarknet_market VARCHAR(255),
  agmarknet_district VARCHAR(255),
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_markets_state_district ON markets(state, district);
CREATE INDEX IF NOT EXISTS idx_markets_active ON markets(active);

-- -----------------------------------------------------------------------------
-- market_prices: observed commodity prices, one row per market/crop/day/source
-- -----------------------------------------------------------------------------
-- source is the provenance guarantee required by the project rules:
--   'AGMARKNET'  = real government observation, ingested from data.gov.in
--   'DEMO_SEED'  = synthetic demonstration data, NEVER a real observation
-- Nothing in the codebase may present DEMO_SEED rows as government data.
CREATE TABLE IF NOT EXISTS market_prices (
  id SERIAL PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
  crop VARCHAR(100) NOT NULL,
  variety VARCHAR(100) DEFAULT 'Other',
  observation_date DATE NOT NULL,
  min_price NUMERIC(10,2),
  max_price NUMERIC(10,2),
  modal_price NUMERIC(10,2) NOT NULL,
  arrival_quantity NUMERIC(12,2),
  price_unit VARCHAR(32) DEFAULT 'INR_PER_QUINTAL',
  source VARCHAR(32) NOT NULL,
  fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_market_prices_observation
    UNIQUE (market_id, crop, variety, observation_date, source)
);

CREATE INDEX IF NOT EXISTS idx_market_prices_lookup
  ON market_prices(crop, market_id, observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_prices_date ON market_prices(observation_date DESC);
CREATE INDEX IF NOT EXISTS idx_market_prices_source ON market_prices(source);

-- -----------------------------------------------------------------------------
-- crop_profiles: per-crop perishability parameters
-- -----------------------------------------------------------------------------
-- Seeded from backend/src/services/spoilageService.js CROP_PROFILES, which
-- remains the computational source of truth. This table exists so crops can be
-- added or tuned without a code deploy, and so /api/crops can serve them.
CREATE TABLE IF NOT EXISTS crop_profiles (
  id SERIAL PRIMARY KEY,
  crop_key VARCHAR(64) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  perishability VARCHAR(32) NOT NULL,
  shelf_life_days INTEGER NOT NULL,
  temperature_sensitivity VARCHAR(32) NOT NULL,
  optimal_temp_c NUMERIC(5,2),
  optimal_humidity NUMERIC(5,2),
  is_grain BOOLEAN DEFAULT FALSE,
  icon VARCHAR(64),
  config_version VARCHAR(32) DEFAULT 'crop_profiles_v1',
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- -----------------------------------------------------------------------------
-- price_predictions: every ML prediction, traceable to a model version
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_predictions (
  id SERIAL PRIMARY KEY,
  crop VARCHAR(100) NOT NULL,
  market_id INTEGER REFERENCES markets(id) ON DELETE CASCADE,
  prediction_date DATE NOT NULL,
  target_date DATE NOT NULL,
  horizon_days INTEGER NOT NULL DEFAULT 1,
  current_price NUMERIC(10,2),
  predicted_price NUMERIC(10,2),
  -- Prediction interval bounds. NULL when the model does not produce them;
  -- never populated with an invented spread.
  lower_bound NUMERIC(10,2),
  upper_bound NUMERIC(10,2),
  model_version VARCHAR(64) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_price_predictions_lookup
  ON price_predictions(crop, market_id, target_date DESC);

-- -----------------------------------------------------------------------------
-- market_recommendations: audit trail of what a farmer was actually told
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS market_recommendations (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  farm_id INTEGER REFERENCES farms(id) ON DELETE CASCADE,
  crop VARCHAR(100) NOT NULL,
  quantity_kg NUMERIC(12,2) NOT NULL,
  harvest_date DATE,
  production_cost NUMERIC(12,2),
  recommended_market_id INTEGER REFERENCES markets(id) ON DELETE SET NULL,
  expected_money NUMERIC(12,2),
  decision VARCHAR(32),
  -- Full ranked response, retained so a past recommendation can be explained.
  response_payload JSONB,
  engine_version VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_market_recommendations_user
  ON market_recommendations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_market_recommendations_farm
  ON market_recommendations(farm_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- transport_config: vehicle freight rates (configuration, not business logic)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transport_config (
  id SERIAL PRIMARY KEY,
  vehicle_type VARCHAR(64) UNIQUE NOT NULL,
  label VARCHAR(100) NOT NULL,
  rate_per_km NUMERIC(8,2) NOT NULL,
  loading_cost NUMERIC(8,2) DEFAULT 0,
  unloading_cost NUMERIC(8,2) DEFAULT 0,
  minimum_charge NUMERIC(8,2) DEFAULT 0,
  capacity_kg NUMERIC(10,2),
  -- Return-leg share: a transporter charges for the empty trip back.
  return_trip_factor NUMERIC(4,2) DEFAULT 1.00,
  active BOOLEAN DEFAULT TRUE,
  config_version VARCHAR(32) DEFAULT 'transport_v1',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
