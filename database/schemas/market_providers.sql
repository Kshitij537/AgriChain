-- ---------------------------------------------------------------------------
-- Market price provider mapping.
--
-- WHY THIS EXISTS
-- ---------------
-- An external price provider spells market names its own way: mandi-api returns
-- "APMC Nagpur " (trailing space) and "Chandrapur(Ganjwad) APMC" for markets we
-- call "Nagpur APMC (Kalamna)" and "Chandrapur APMC". The old design held one
-- provider-specific column on markets (agmarknet_market), which cannot express a
-- second provider and cannot record HOW confident a match is.
--
-- This table makes the mapping explicit, auditable and per-provider, so adding
-- MSAMB or CEDA later is a row, not a migration.
--
-- MATCH DISCIPLINE
-- ----------------
-- match_type records the evidence for a mapping. Only EXACT and VERIFIED are
-- used for ingestion by default: attributing one mandi's prices to a different
-- mandi in the same district would silently corrupt every ranking that mandi
-- appears in. A FUZZY row is recorded for review, not trusted.
--
-- Idempotent: safe to re-run. Applied automatically on boot by config/db.js.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS market_provider_map (
  id SERIAL PRIMARY KEY,
  market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,

  -- Internal provider identifier, e.g. 'mandi_api'. Never a user-facing label.
  provider VARCHAR(32) NOT NULL,

  -- The provider's own strings, stored EXACTLY as returned (trailing spaces
  -- included) so a lookup can be replayed verbatim against the upstream API.
  provider_market VARCHAR(255) NOT NULL,
  provider_district VARCHAR(255),
  provider_state VARCHAR(100) NOT NULL DEFAULT 'Maharashtra',

  --   EXACT    names agree after normalisation
  --   VERIFIED a human confirmed a non-obvious mapping
  --   FUZZY    recorded for review; NOT used for ingestion
  match_type VARCHAR(16) NOT NULL DEFAULT 'EXACT',
  match_note TEXT,

  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_map_match_type CHECK (match_type IN ('EXACT', 'VERIFIED', 'FUZZY')),
  -- One mapping per market per provider: two upstream markets feeding one of our
  -- markets would silently blend two different mandis' prices.
  CONSTRAINT uq_map_market_provider UNIQUE (market_id, provider),
  -- And one upstream market may not be claimed by two of our markets.
  CONSTRAINT uq_map_provider_market UNIQUE (provider, provider_state, provider_market)
);

CREATE INDEX IF NOT EXISTS idx_map_provider_active
  ON market_provider_map (provider, active);

-- ---------------------------------------------------------------------------
-- Commodity mapping: our crop keys <-> the provider's commodity spellings.
--
-- One crop can map to several provider commodities ("Chilli" arrives as both
-- "Green Chilli" and "Chilly Red"), so this is many-to-one by design.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS commodity_provider_map (
  id SERIAL PRIMARY KEY,
  crop VARCHAR(100) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  provider_commodity VARCHAR(150) NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_commodity_map UNIQUE (provider, provider_commodity)
);

CREATE INDEX IF NOT EXISTS idx_commodity_map_crop
  ON commodity_provider_map (provider, crop, active);

-- ---------------------------------------------------------------------------
-- Ingestion run log: what was fetched, what landed, what failed.
--
-- Without this, "why does Wardha have no price" has no auditable answer.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS price_ingest_runs (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  state VARCHAR(100),
  started_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP,

  markets_attempted INTEGER DEFAULT 0,
  crops_attempted INTEGER DEFAULT 0,
  records_fetched INTEGER DEFAULT 0,
  rows_inserted INTEGER DEFAULT 0,
  rows_updated INTEGER DEFAULT 0,
  rows_skipped INTEGER DEFAULT 0,
  requests_made INTEGER DEFAULT 0,
  requests_failed INTEGER DEFAULT 0,

  -- SUCCESS / PARTIAL / FAILED - PARTIAL matters: some markets ingesting and
  -- others failing is the normal case with patchy upstream coverage.
  status VARCHAR(16),
  error_summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_ingest_status CHECK (status IS NULL OR status IN ('SUCCESS', 'PARTIAL', 'FAILED'))
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_recent
  ON price_ingest_runs (provider, started_at DESC);
