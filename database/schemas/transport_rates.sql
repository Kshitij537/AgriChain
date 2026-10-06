-- ---------------------------------------------------------------------------
-- Freight rate grounding: real observations behind the ₹/km figure.
--
-- WHY THIS EXISTS
-- ---------------
-- transport_config held indicative ₹/km values with no source. The freight line
-- is the second largest deduction on a farmer's ledger, so an unsourced number
-- there is the least defensible figure in the whole recommendation.
--
-- Nobody publishes a live "₹/km for a mini truck in Wardha" feed. But freight is
-- driven by diesel, which IS observable and changes daily, and a real transporter
-- will quote a real rate on the phone. Both are recorded here as dated
-- observations with a source - never synthesised, exactly as market_prices does
-- for mandi rates.
--
-- Idempotent: safe to re-run. Applied automatically on boot by config/db.js.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- fuel_prices: dated diesel/petrol observations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fuel_prices (
  id SERIAL PRIMARY KEY,
  fuel_type VARCHAR(16) NOT NULL DEFAULT 'diesel',
  price_per_litre NUMERIC(8,2) NOT NULL,

  -- Diesel is taxed per state, so location matters. district may be NULL when an
  -- observation is only known at state level.
  city VARCHAR(100),
  district VARCHAR(100),
  state VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',

  -- Where this number came from. Precedence is applied in freightRateService.
  --   OFFICIAL_API    - ingested from a government/official dataset
  --   ADMIN_ENTERED   - entered by an admin from a verifiable source
  --   USER_REPORTED   - read off a pump board by a farmer/user
  source VARCHAR(32) NOT NULL DEFAULT 'USER_REPORTED',
  source_note TEXT,

  observed_on DATE NOT NULL,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_fuel_type CHECK (fuel_type IN ('diesel', 'petrol', 'cng')),
  CONSTRAINT chk_fuel_source CHECK (source IN ('OFFICIAL_API', 'ADMIN_ENTERED', 'USER_REPORTED')),
  -- A pump price of ₹0 or ₹5000 is a typo, not an observation.
  CONSTRAINT chk_fuel_price_sane CHECK (price_per_litre > 20 AND price_per_litre < 300),
  CONSTRAINT chk_fuel_not_future CHECK (observed_on <= CURRENT_DATE)
);

-- One observation per fuel per place per day per source: a re-submission corrects
-- rather than duplicates (see ON CONFLICT in fuelPriceService).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fuel_observation
  ON fuel_prices (fuel_type, state, COALESCE(district, ''), observed_on, source);

CREATE INDEX IF NOT EXISTS idx_fuel_lookup
  ON fuel_prices (fuel_type, state, observed_on DESC);

-- ---------------------------------------------------------------------------
-- transport_rate_quotes: actual quotes from actual transporters
--
-- The strongest evidence available: a named transporter, reachable on a phone
-- number, quoted this rate on this date. google_place_id links back to the
-- Places result the lead came from, so a quote is traceable to a real business.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transport_rate_quotes (
  id SERIAL PRIMARY KEY,
  vehicle_type VARCHAR(64) NOT NULL,

  rate_per_km NUMERIC(8,2) NOT NULL,
  loading_cost NUMERIC(8,2),
  unloading_cost NUMERIC(8,2),
  minimum_charge NUMERIC(8,2),
  return_trip_factor NUMERIC(4,2),

  transporter_name VARCHAR(200) NOT NULL,
  transporter_phone VARCHAR(32),
  google_place_id VARCHAR(255),

  -- Rates vary by corridor; a quote is scoped to where it was given.
  district VARCHAR(100),
  state VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',

  quoted_on DATE NOT NULL,
  -- Quotes go stale as diesel moves. NULL means "no stated validity".
  valid_until DATE,

  source VARCHAR(32) NOT NULL DEFAULT 'TRANSPORTER_QUOTE',
  notes TEXT,
  recorded_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_quote_rate_sane CHECK (rate_per_km > 0 AND rate_per_km < 500),
  CONSTRAINT chk_quote_return_factor CHECK (return_trip_factor IS NULL
    OR (return_trip_factor >= 1 AND return_trip_factor <= 2)),
  CONSTRAINT chk_quote_not_future CHECK (quoted_on <= CURRENT_DATE),
  CONSTRAINT chk_quote_validity CHECK (valid_until IS NULL OR valid_until >= quoted_on)
);

CREATE INDEX IF NOT EXISTS idx_quote_lookup
  ON transport_rate_quotes (vehicle_type, state, active, quoted_on DESC);

-- ---------------------------------------------------------------------------
-- transport_config gains the fuel-linkage inputs.
--
-- rate_per_km stays as the fallback, but it can now be DERIVED:
--   rate_per_km = diesel_price / mileage_kmpl + fixed_cost_per_km
-- ---------------------------------------------------------------------------
ALTER TABLE transport_config
  ADD COLUMN IF NOT EXISTS mileage_kmpl NUMERIC(5,2);

ALTER TABLE transport_config
  ADD COLUMN IF NOT EXISTS fixed_cost_per_km NUMERIC(8,2);

-- Provenance of the STATIC rate_per_km in this row, so a fallback never
-- masquerades as a sourced figure.
ALTER TABLE transport_config
  ADD COLUMN IF NOT EXISTS rate_source VARCHAR(32) DEFAULT 'CONFIGURED_ESTIMATE';

ALTER TABLE transport_config
  ADD COLUMN IF NOT EXISTS rate_source_note TEXT;

-- The diesel price the STATIC rate_per_km in this row was set against. Without
-- it a fuel observation cannot be turned into an adjustment, so indexation stays
-- off and the rate is reported as a plain CONFIGURED_ESTIMATE. Deliberately
-- nullable and unseeded: guessing this value would make the "fuel-indexed" rate
-- just the old invented number wearing a costume.
ALTER TABLE transport_config
  ADD COLUMN IF NOT EXISTS baseline_diesel_price NUMERIC(8,2);

ALTER TABLE transport_config
  ADD COLUMN IF NOT EXISTS baseline_set_on DATE;
