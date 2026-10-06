-- =============================================================================
-- AgriChain Buyer Marketplace Schema
-- =============================================================================
-- Adds a second selling channel alongside the APMC mandi: direct crop buyers.
--
-- CONVENTIONS FOLLOWED FROM THE EXISTING SCHEMA
--   * SERIAL integer primary keys, not UUIDs - every existing table (users,
--     farms, markets, market_prices) uses SERIAL, and these tables carry foreign
--     keys into users and farms. Mixing key types would break those references.
--   * Money is NUMERIC, never FLOAT. These are rupees a farmer will act on.
--   * Quantities are NUMERIC(12,2) kilograms.
--   * This file is idempotent (every statement IF NOT EXISTS) and is executed on
--     backend startup by backend/src/config/db.js, matching market.sql.
--     It is also safe to apply by hand:
--       psql -U postgres -d agrichain_db -f database/schemas/marketplace.sql
--
-- A NOTE ON ROW LEVEL SECURITY
--   RLS is deliberately NOT used. The application connects through a single
--   pooled `postgres` superuser (see backend/src/config/db.js), and PostgreSQL
--   superusers bypass RLS entirely, so policies here would be decorative.
--   Authorization is enforced in the service layer - the same pattern
--   marketController.resolveAuthorisedFarm already uses - backed by the CHECK,
--   FOREIGN KEY and UNIQUE constraints below, which the database DOES enforce
--   regardless of who connects. See docs/Marketplace/README.md for the migration
--   path to real RLS.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- user_roles: one identity, many roles
-- -----------------------------------------------------------------------------
-- A table rather than a users.role column, because the brief requires a single
-- user to hold several roles (a farmer who also buys) without creating duplicate
-- identities. A column cannot represent that.
--
-- Every existing account is treated as a farmer by default; see
-- backend/src/services/roleService.js for how the default is applied without a
-- backfill that would need to run before every request.
CREATE TABLE IF NOT EXISTS user_roles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(16) NOT NULL,
  granted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  -- Who granted it. Admin roles must be traceable.
  granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_user_roles_role CHECK (role IN ('farmer', 'buyer', 'admin')),
  CONSTRAINT uq_user_roles UNIQUE (user_id, role)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);


-- -----------------------------------------------------------------------------
-- buyer_profiles: the business behind a buyer account
-- -----------------------------------------------------------------------------
-- verification_status is NEVER set by the buyer. A new profile starts
-- 'unverified' and only an admin may move it, which is why the transition is
-- enforced in buyerService and the column carries no default other than
-- 'unverified'. Nothing in the marketplace may render a Verified badge from any
-- other source.
--
-- verification_document_path and verification_notes are deliberately excluded
-- from every public projection (see buyerService.PUBLIC_BUYER_FIELDS).
CREATE TABLE IF NOT EXISTS buyer_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,

  business_name VARCHAR(255) NOT NULL,
  buyer_type VARCHAR(32) NOT NULL,
  contact_person VARCHAR(255),
  business_phone VARCHAR(20),
  business_email VARCHAR(255),

  address TEXT,
  village_city VARCHAR(255),
  district VARCHAR(100),
  state VARCHAR(100),
  pin_code VARCHAR(10),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),

  -- Normalised crop_profiles keys, so matching never relies on free text.
  crops_purchased TEXT[],
  typical_purchase_quantity_kg NUMERIC(12,2),
  service_area_km NUMERIC(8,2),

  verification_status VARCHAR(24) NOT NULL DEFAULT 'unverified',
  verification_submitted_at TIMESTAMP,
  verification_reviewed_at TIMESTAMP,
  verification_reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  -- Sensitive. Never returned by a public endpoint.
  verification_document_path VARCHAR(500),
  verification_notes TEXT,

  -- Set by an admin when suspending a fraudulent or abusive account.
  is_suspended BOOLEAN NOT NULL DEFAULT FALSE,
  suspended_reason TEXT,

  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_buyer_type CHECK (buyer_type IN
    ('wholesaler', 'processor', 'retailer', 'restaurant', 'exporter', 'cooperative_fpo', 'other')),
  CONSTRAINT chk_verification_status CHECK (verification_status IN
    ('unverified', 'verification_pending', 'verified', 'verification_rejected')),
  CONSTRAINT chk_buyer_quantity CHECK
    (typical_purchase_quantity_kg IS NULL OR typical_purchase_quantity_kg > 0),
  CONSTRAINT chk_buyer_service_area CHECK
    (service_area_km IS NULL OR service_area_km > 0)
);

CREATE INDEX IF NOT EXISTS idx_buyer_profiles_user ON buyer_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_verification ON buyer_profiles(verification_status);
CREATE INDEX IF NOT EXISTS idx_buyer_profiles_district ON buyer_profiles(district);


-- -----------------------------------------------------------------------------
-- buyer_requirements: "I want to buy N kg of X at ₹Y/kg"
-- -----------------------------------------------------------------------------
-- A requirement is an ADVERTISED intent, never a confirmed purchase. Nothing in
-- the system may present offered_price_per_kg as an agreed price - that only
-- exists on marketplace_deals.agreed_price_per_kg.
--
-- quantity_remaining_kg is the live figure the matching engine uses. It is
-- decremented only inside the offer-acceptance transaction, and the CHECK below
-- makes the database itself refuse to over-commit a requirement.
CREATE TABLE IF NOT EXISTS buyer_requirements (
  id SERIAL PRIMARY KEY,
  buyer_id INTEGER NOT NULL REFERENCES buyer_profiles(id) ON DELETE CASCADE,

  -- Normalised crop_profiles.crop_key, so crop comparison is an equality test on
  -- a controlled vocabulary rather than on user-typed text.
  crop VARCHAR(64) NOT NULL,
  variety VARCHAR(100),
  minimum_quality_grade VARCHAR(32),

  quantity_required_kg NUMERIC(12,2) NOT NULL,
  quantity_remaining_kg NUMERIC(12,2) NOT NULL,
  minimum_acceptable_quantity_kg NUMERIC(12,2),

  offered_price_per_kg NUMERIC(10,2) NOT NULL,
  price_negotiable BOOLEAN NOT NULL DEFAULT TRUE,

  partial_fulfillment_allowed BOOLEAN NOT NULL DEFAULT TRUE,
  pickup_available BOOLEAN NOT NULL DEFAULT FALSE,
  delivery_required BOOLEAN NOT NULL DEFAULT TRUE,

  delivery_location TEXT,
  delivery_district VARCHAR(100),
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),

  required_by DATE NOT NULL,
  expires_at DATE NOT NULL,

  special_requirements TEXT,
  description TEXT,

  status VARCHAR(24) NOT NULL DEFAULT 'draft',

  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_req_status CHECK (status IN
    ('draft', 'active', 'partially_fulfilled', 'fulfilled', 'closed', 'expired', 'cancelled')),
  -- The database, not just the API, rejects nonsense quantities and prices.
  CONSTRAINT chk_req_quantity CHECK (quantity_required_kg > 0),
  CONSTRAINT chk_req_price CHECK (offered_price_per_kg > 0),
  CONSTRAINT chk_req_remaining CHECK
    (quantity_remaining_kg >= 0 AND quantity_remaining_kg <= quantity_required_kg),
  CONSTRAINT chk_req_min_quantity CHECK
    (minimum_acceptable_quantity_kg IS NULL
     OR (minimum_acceptable_quantity_kg > 0
         AND minimum_acceptable_quantity_kg <= quantity_required_kg)),
  -- A requirement cannot expire before the date the crop is needed.
  CONSTRAINT chk_req_dates CHECK (expires_at >= required_by),
  -- At least one fulfilment arrangement must be possible.
  CONSTRAINT chk_req_arrangement CHECK (pickup_available OR delivery_required)
);

-- The matching engine's primary access path: active requirements for a crop.
CREATE INDEX IF NOT EXISTS idx_req_matching
  ON buyer_requirements(crop, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_req_buyer ON buyer_requirements(buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_req_expiry ON buyer_requirements(expires_at)
  WHERE status IN ('active', 'partially_fulfilled');


-- -----------------------------------------------------------------------------
-- farmer_crop_availability: what a farmer actually has to sell
-- -----------------------------------------------------------------------------
-- A new table is unavoidable. The existing `farms` table has no quantity column
-- at all - only name, location, area_hectares and crop_type - so there is
-- nothing to extend, and the marketplace needs four distinct quantities that no
-- existing table represents.
--
-- The four quantities, kept separate because conflating them is how a platform
-- ends up selling the same crop twice:
--   total_harvested_kg  what came off the field
--   available_kg        offered to buyers right now
--   reserved_kg         locked by accepted deals, not yet handed over
--   sold_kg             handed over and completed
--
-- The CHECK below is the backstop that makes over-reservation impossible even if
-- application logic has a race.
CREATE TABLE IF NOT EXISTS farmer_crop_availability (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  farm_id INTEGER REFERENCES farms(id) ON DELETE SET NULL,

  crop VARCHAR(64) NOT NULL,
  variety VARCHAR(100),
  quality_grade VARCHAR(32),

  total_harvested_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  available_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  reserved_kg NUMERIC(12,2) NOT NULL DEFAULT 0,
  sold_kg NUMERIC(12,2) NOT NULL DEFAULT 0,

  harvest_status VARCHAR(24) NOT NULL DEFAULT 'harvested',
  harvest_date DATE,
  storage_type VARCHAR(32) DEFAULT 'open',

  -- Denormalised from farms so matching can filter by distance without a join,
  -- and so availability survives a farm being deleted.
  latitude NUMERIC(9,6),
  longitude NUMERIC(9,6),

  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_avail_harvest_status CHECK (harvest_status IN
    ('expected', 'harvesting', 'harvested', 'stored')),
  CONSTRAINT chk_avail_nonnegative CHECK
    (total_harvested_kg >= 0 AND available_kg >= 0 AND reserved_kg >= 0 AND sold_kg >= 0),
  -- The crop cannot be committed more than once over.
  CONSTRAINT chk_avail_conservation CHECK
    (available_kg + reserved_kg + sold_kg <= total_harvested_kg)
);

CREATE INDEX IF NOT EXISTS idx_avail_matching
  ON farmer_crop_availability(crop, is_active) WHERE available_kg > 0;
CREATE INDEX IF NOT EXISTS idx_avail_user ON farmer_crop_availability(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_avail_farm ON farmer_crop_availability(farm_id);


-- -----------------------------------------------------------------------------
-- marketplace_conversations: one private thread per (requirement, farmer, buyer)
-- -----------------------------------------------------------------------------
-- The UNIQUE constraint is what prevents duplicate threads: pressing "Chat"
-- twice reuses the existing conversation instead of creating a second one.
CREATE TABLE IF NOT EXISTS marketplace_conversations (
  id SERIAL PRIMARY KEY,
  requirement_id INTEGER REFERENCES buyer_requirements(id) ON DELETE CASCADE,
  crop_availability_id INTEGER REFERENCES farmer_crop_availability(id) ON DELETE SET NULL,

  -- users.id on both sides, so authorization is a direct comparison against the
  -- authenticated identity with no extra lookup.
  farmer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  last_message_at TIMESTAMP,
  -- Denormalised unread counters, maintained on insert/read. A COUNT(*) per
  -- conversation per page load does not scale and is not needed.
  farmer_unread_count INTEGER NOT NULL DEFAULT 0,
  buyer_unread_count INTEGER NOT NULL DEFAULT 0,

  farmer_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  buyer_blocked BOOLEAN NOT NULL DEFAULT FALSE,

  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT uq_conversation UNIQUE (requirement_id, farmer_user_id, buyer_user_id),
  -- A user cannot open a conversation with themselves.
  CONSTRAINT chk_conversation_parties CHECK (farmer_user_id <> buyer_user_id),
  CONSTRAINT chk_conversation_unread CHECK
    (farmer_unread_count >= 0 AND buyer_unread_count >= 0)
);

CREATE INDEX IF NOT EXISTS idx_conv_farmer
  ON marketplace_conversations(farmer_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_buyer
  ON marketplace_conversations(buyer_user_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_requirement ON marketplace_conversations(requirement_id);


-- -----------------------------------------------------------------------------
-- marketplace_messages
-- -----------------------------------------------------------------------------
-- attachment_path points at backend/uploads/marketplace/, which is served ONLY
-- through an authorising route - never express.static - so a stranger cannot
-- read an attachment by guessing the filename.
CREATE TABLE IF NOT EXISTS marketplace_messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES marketplace_conversations(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  message_type VARCHAR(16) NOT NULL DEFAULT 'text',
  content TEXT,

  attachment_path VARCHAR(500),
  attachment_mime VARCHAR(100),
  attachment_size_bytes INTEGER,

  -- 'delivered' once persisted; 'read' once the recipient has opened the thread.
  delivered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP,

  -- Set when an offer event is mirrored into the thread, so negotiation history
  -- reads as one timeline rather than two disconnected lists.
  related_offer_id INTEGER,

  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_message_type CHECK (message_type IN ('text', 'image', 'system', 'offer_event')),
  -- A message must carry something: text, an attachment, or both.
  CONSTRAINT chk_message_payload CHECK
    (content IS NOT NULL OR attachment_path IS NOT NULL),
  CONSTRAINT chk_message_length CHECK (content IS NULL OR char_length(content) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_msg_conversation
  ON marketplace_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_msg_unread
  ON marketplace_messages(conversation_id, read_at) WHERE read_at IS NULL;


-- -----------------------------------------------------------------------------
-- marketplace_offers: structured negotiation alongside the chat
-- -----------------------------------------------------------------------------
-- parent_offer_id threads counter-offers, so the full negotiation is
-- reconstructable: buyer ₹29 -> farmer ₹30 -> buyer accepts.
CREATE TABLE IF NOT EXISTS marketplace_offers (
  id SERIAL PRIMARY KEY,
  requirement_id INTEGER NOT NULL REFERENCES buyer_requirements(id) ON DELETE CASCADE,
  crop_availability_id INTEGER REFERENCES farmer_crop_availability(id) ON DELETE SET NULL,
  conversation_id INTEGER REFERENCES marketplace_conversations(id) ON DELETE SET NULL,

  sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  crop VARCHAR(64) NOT NULL,
  quantity_kg NUMERIC(12,2) NOT NULL,
  price_per_kg NUMERIC(10,2) NOT NULL,
  -- Stored rather than derived so the amount a farmer agreed to can never be
  -- retro-computed differently by changed rounding.
  total_amount NUMERIC(14,2) NOT NULL,

  delivery_terms VARCHAR(24) NOT NULL DEFAULT 'farmer_delivers',
  proposed_fulfillment_date DATE,
  expires_at TIMESTAMP,

  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  parent_offer_id INTEGER REFERENCES marketplace_offers(id) ON DELETE SET NULL,

  responded_at TIMESTAMP,
  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_offer_status CHECK (status IN
    ('pending', 'accepted', 'rejected', 'countered', 'withdrawn', 'expired')),
  CONSTRAINT chk_offer_terms CHECK (delivery_terms IN
    ('farmer_delivers', 'buyer_pickup')),
  CONSTRAINT chk_offer_quantity CHECK (quantity_kg > 0),
  CONSTRAINT chk_offer_price CHECK (price_per_kg > 0),
  CONSTRAINT chk_offer_total CHECK (total_amount > 0),
  CONSTRAINT chk_offer_parties CHECK (sender_id <> recipient_id)
);

CREATE INDEX IF NOT EXISTS idx_offer_requirement ON marketplace_offers(requirement_id, status);
CREATE INDEX IF NOT EXISTS idx_offer_recipient ON marketplace_offers(recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_sender ON marketplace_offers(sender_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_offer_conversation ON marketplace_offers(conversation_id, created_at);

-- An offer may be accepted at most once. This is the database-level guarantee
-- behind the double-acceptance test: even with two simultaneous requests, only
-- one row can ever exist in marketplace_deals for a given offer.


-- -----------------------------------------------------------------------------
-- marketplace_deals: the agreed terms
-- -----------------------------------------------------------------------------
-- accepted_offer_id is UNIQUE. That single constraint is what makes concurrent
-- double-acceptance impossible: the second transaction to commit violates it and
-- rolls back, rather than quietly reserving the crop twice.
--
-- A deal is NOT a payment and NOT a fulfilment. Money and physical handover
-- happen off-platform in V1; status only tracks what the two parties report.
CREATE TABLE IF NOT EXISTS marketplace_deals (
  id SERIAL PRIMARY KEY,
  accepted_offer_id INTEGER NOT NULL UNIQUE REFERENCES marketplace_offers(id) ON DELETE RESTRICT,
  requirement_id INTEGER NOT NULL REFERENCES buyer_requirements(id) ON DELETE RESTRICT,
  crop_availability_id INTEGER REFERENCES farmer_crop_availability(id) ON DELETE SET NULL,
  conversation_id INTEGER REFERENCES marketplace_conversations(id) ON DELETE SET NULL,

  farmer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  buyer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

  crop VARCHAR(64) NOT NULL,
  agreed_quantity_kg NUMERIC(12,2) NOT NULL,
  agreed_price_per_kg NUMERIC(10,2) NOT NULL,
  agreed_total NUMERIC(14,2) NOT NULL,

  delivery_terms VARCHAR(24) NOT NULL,
  fulfillment_date DATE,

  status VARCHAR(24) NOT NULL DEFAULT 'agreed',
  -- Populated when either side cancels or disputes, so the reason is auditable.
  status_changed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status_changed_at TIMESTAMP,
  status_note TEXT,

  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_deal_status CHECK (status IN
    ('agreed', 'preparing', 'ready_for_pickup', 'completed', 'cancelled', 'disputed')),
  CONSTRAINT chk_deal_quantity CHECK (agreed_quantity_kg > 0),
  CONSTRAINT chk_deal_price CHECK (agreed_price_per_kg > 0),
  CONSTRAINT chk_deal_total CHECK (agreed_total > 0),
  CONSTRAINT chk_deal_parties CHECK (farmer_user_id <> buyer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_deal_farmer ON marketplace_deals(farmer_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_buyer ON marketplace_deals(buyer_user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_deal_requirement ON marketplace_deals(requirement_id);


-- -----------------------------------------------------------------------------
-- marketplace_notifications
-- -----------------------------------------------------------------------------
-- dedupe_key carries a UNIQUE constraint so a retried event cannot produce a
-- second notification. Callers build it from the event and entity, e.g.
-- 'offer_accepted:offer:41:user:7'.
CREATE TABLE IF NOT EXISTS marketplace_notifications (
  id SERIAL PRIMARY KEY,
  recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  event_type VARCHAR(48) NOT NULL,
  entity_type VARCHAR(32) NOT NULL,
  entity_id INTEGER,

  title VARCHAR(255) NOT NULL,
  body TEXT,
  -- Frontend route this notification should open.
  link_path VARCHAR(255),

  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMP,

  dedupe_key VARCHAR(255) UNIQUE,

  is_demo_data BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_notif_entity CHECK (entity_type IN
    ('requirement', 'conversation', 'message', 'offer', 'deal', 'buyer_profile', 'availability'))
);

CREATE INDEX IF NOT EXISTS idx_notif_recipient
  ON marketplace_notifications(recipient_id, is_read, created_at DESC);


-- -----------------------------------------------------------------------------
-- marketplace_reports: user-submitted abuse reports, for admin moderation
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketplace_reports (
  id SERIAL PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,

  entity_type VARCHAR(32) NOT NULL,
  entity_id INTEGER,

  reason VARCHAR(48) NOT NULL,
  details TEXT,

  status VARCHAR(24) NOT NULL DEFAULT 'open',
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP,
  resolution_note TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT chk_report_entity CHECK (entity_type IN
    ('user', 'requirement', 'message', 'conversation', 'offer', 'buyer_profile')),
  CONSTRAINT chk_report_status CHECK (status IN ('open', 'reviewing', 'actioned', 'dismissed')),
  CONSTRAINT chk_report_not_self CHECK (reporter_id <> reported_user_id)
);

CREATE INDEX IF NOT EXISTS idx_report_status ON marketplace_reports(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_report_reported ON marketplace_reports(reported_user_id);
