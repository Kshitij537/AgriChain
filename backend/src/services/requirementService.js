/**
 * Buyer requirement service.
 *
 * Owns the lifecycle of "I want to buy N kg of X at ₹Y/kg".
 *
 * A REQUIREMENT IS AN ADVERTISED INTENT, NOT A SALE
 * -------------------------------------------------
 * offered_price_per_kg is what a buyer is asking for, not what anyone has agreed
 * to. The only agreed price in this system lives on
 * marketplace_deals.agreed_price_per_kg. Every projection here therefore labels
 * the price as `offeredPricePerKg` and never as `price`, so no caller can
 * accidentally present it as settled.
 *
 * LIFECYCLE
 *   draft ──► active ──► partially_fulfilled ──► fulfilled
 *               │              │
 *               ├──────────────┴──► closed      (buyer closed it early)
 *               ├─────────────────► expired     (passed expires_at)
 *               └─────────────────► cancelled    (buyer cancelled)
 *
 * Only `active` and `partially_fulfilled` may receive offers. Expiry is applied
 * lazily on read (see `expireStale`) rather than by a cron job, because a
 * requirement that expired at midnight must not be matchable at 00:01 even if no
 * scheduled task has run.
 */

const { query } = require('../config/db');
const money = require('../utils/money');
const spoilageService = require('./spoilageService');

/** Statuses that can still receive offers. */
const OPEN_STATUSES = ['active', 'partially_fulfilled'];

const STATUS = {
  DRAFT: 'draft',
  ACTIVE: 'active',
  PARTIALLY_FULFILLED: 'partially_fulfilled',
  FULFILLED: 'fulfilled',
  CLOSED: 'closed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

/** Farmer-friendly status wording, so the UI never invents its own. */
const STATUS_LABEL = {
  draft: 'Draft',
  active: 'Open',
  partially_fulfilled: 'Partly filled',
  fulfilled: 'Filled',
  closed: 'Closed',
  expired: 'Expired',
  cancelled: 'Cancelled'
};

const COLUMNS = `
  r.id, r.buyer_id, r.crop, r.variety, r.minimum_quality_grade,
  r.quantity_required_kg, r.quantity_remaining_kg, r.minimum_acceptable_quantity_kg,
  r.offered_price_per_kg, r.price_negotiable, r.partial_fulfillment_allowed,
  r.pickup_available, r.delivery_required, r.delivery_location, r.delivery_district,
  r.latitude, r.longitude, r.required_by, r.expires_at, r.special_requirements,
  r.description, r.status, r.is_demo_data, r.created_at, r.updated_at
`;

/**
 * Formats a DATE column in the server's timezone.
 *
 * Reuses the market module's fix: node-postgres parses DATE as local midnight, so
 * toISOString() rewinds it a day in IST and a requirement would appear to expire
 * one day early.
 */
const { toLocalDateString } = require('./marketPriceService');

/**
 * Shapes a requirement row for the API, with the buyer's public details joined.
 *
 * @param {object} row
 * @returns {object|null}
 */
const decorate = (row) => {
  if (!row) return null;

  const requiredBy = toLocalDateString(row.required_by);
  const expiresAt = toLocalDateString(row.expires_at);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const daysToExpiry = expiresAt
    ? Math.round((new Date(expiresAt) - today) / 86400000)
    : null;

  return {
    id: row.id,
    buyerId: row.buyer_id,

    crop: row.crop,
    // The display name, so a client never has to render the raw key ("tomato").
    // availabilityService.decorate already does this; requirements lacked it,
    // which is why buyer-facing lists showed lowercase crop keys.
    cropLabel: spoilageService.getCropProfile(row.crop).label,
    variety: row.variety,
    minimumQualityGrade: row.minimum_quality_grade,

    quantityRequiredKg: Number(row.quantity_required_kg),
    quantityRemainingKg: Number(row.quantity_remaining_kg),
    minimumAcceptableQuantityKg: row.minimum_acceptable_quantity_kg !== null
      ? Number(row.minimum_acceptable_quantity_kg)
      : null,

    // Named "offered", never "price": this is an ask, not an agreement.
    offeredPricePerKg: Number(row.offered_price_per_kg),
    priceNegotiable: row.price_negotiable,

    partialFulfillmentAllowed: row.partial_fulfillment_allowed,
    pickupAvailable: row.pickup_available,
    deliveryRequired: row.delivery_required,

    deliveryLocation: row.delivery_location,
    deliveryDistrict: row.delivery_district,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,

    requiredBy,
    expiresAt,
    daysToExpiry,
    isExpiringSoon: daysToExpiry !== null && daysToExpiry >= 0 && daysToExpiry <= 3,

    specialRequirements: row.special_requirements,
    description: row.description,

    status: row.status,
    statusLabel: STATUS_LABEL[row.status] || row.status,
    isOpen: OPEN_STATUSES.includes(row.status),

    isDemoData: row.is_demo_data,
    createdAt: row.created_at,
    updatedAt: row.updated_at,

    // Present when the query joined buyer_profiles. Always the PUBLIC projection -
    // a requirement listing must never carry the buyer's phone or email.
    buyer: row.business_name
      ? {
        id: row.buyer_id,
        businessName: row.business_name,
        buyerType: row.buyer_type,
        villageCity: row.village_city,
        district: row.district,
        state: row.state,
        latitude: row.buyer_latitude !== null && row.buyer_latitude !== undefined
          ? Number(row.buyer_latitude) : null,
        longitude: row.buyer_longitude !== null && row.buyer_longitude !== undefined
          ? Number(row.buyer_longitude) : null,
        serviceAreaKm: row.service_area_km !== null && row.service_area_km !== undefined
          ? Number(row.service_area_km) : null,
        verificationStatus: row.verification_status,
        isVerified: row.verification_status === 'verified',
        isSuspended: row.is_suspended
      }
      : undefined
  };
};

/** Join that attaches the buyer's public fields. */
const BUYER_JOIN = `
  JOIN buyer_profiles b ON b.id = r.buyer_id
`;
const BUYER_COLUMNS = `
  b.business_name, b.buyer_type, b.village_city, b.district, b.state,
  b.latitude AS buyer_latitude, b.longitude AS buyer_longitude,
  b.service_area_km, b.verification_status, b.is_suspended
`;

/**
 * Marks requirements past their expiry date as expired.
 *
 * Called at the start of any read that could otherwise return a stale-but-open
 * requirement. Cheap (indexed, only touches rows that need it) and idempotent, so
 * it can run on every request without a scheduler.
 *
 * @returns {Promise<number>} rows expired
 */
const expireStale = async () => {
  const result = await query(
    `UPDATE buyer_requirements
     SET status = 'expired', updated_at = CURRENT_TIMESTAMP
     WHERE status = ANY($1::text[]) AND expires_at < CURRENT_DATE`,
    [OPEN_STATUSES]
  );
  if (result.rowCount) {
    console.log(`[Requirements] expired ${result.rowCount} requirement(s) past their date`);
  }
  return result.rowCount;
};

/**
 * Creates a requirement.
 *
 * quantity_remaining_kg starts equal to quantity_required_kg: nothing has been
 * committed yet. Only the offer-acceptance transaction ever decrements it.
 *
 * @param {number} buyerId - buyer_profiles.id, from the authenticated session
 * @param {object} input - validated
 * @param {object} [options] - { publish } - create as active rather than draft
 * @returns {Promise<object>}
 */
const create = async (buyerId, input, { publish = true } = {}) => {
  const result = await query(
    `INSERT INTO buyer_requirements
       (buyer_id, crop, variety, minimum_quality_grade,
        quantity_required_kg, quantity_remaining_kg, minimum_acceptable_quantity_kg,
        offered_price_per_kg, price_negotiable, partial_fulfillment_allowed,
        pickup_available, delivery_required, delivery_location, delivery_district,
        latitude, longitude, required_by, expires_at,
        special_requirements, description, status, is_demo_data)
     VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
     RETURNING id`,
    [
      buyerId,
      input.crop,
      input.variety || null,
      input.minimumQualityGrade || null,
      input.quantityRequiredKg,
      input.minimumAcceptableQuantityKg ?? null,
      input.offeredPricePerKg,
      input.priceNegotiable ?? true,
      input.partialFulfillmentAllowed ?? true,
      input.pickupAvailable ?? false,
      input.deliveryRequired ?? true,
      input.deliveryLocation || null,
      input.deliveryDistrict || null,
      input.latitude ?? null,
      input.longitude ?? null,
      input.requiredBy,
      input.expiresAt,
      input.specialRequirements || null,
      input.description || null,
      publish ? STATUS.ACTIVE : STATUS.DRAFT,
      Boolean(input.isDemoData)
    ]
  );
  return getById(result.rows[0].id);
};

/**
 * Fetches one requirement with its buyer's public details.
 * @param {number} id
 * @returns {Promise<object|null>}
 */
const getById = async (id) => {
  const numericId = parseInt(id, 10);
  if (!Number.isFinite(numericId)) return null;
  const result = await query(
    `SELECT ${COLUMNS}, ${BUYER_COLUMNS} FROM buyer_requirements r ${BUYER_JOIN}
     WHERE r.id = $1 LIMIT 1`,
    [numericId]
  );
  return decorate(result.rows[0]);
};

/**
 * Browsable/filterable requirement list.
 *
 * This backs both the general marketplace browse page and the buyer's own
 * "My Requirements" list, which differ only by filter.
 *
 * @param {object} filters
 * @returns {Promise<object>} { requirements, total, limit, offset }
 */
const list = async ({
  buyerId = null,
  crop = null,
  statuses = null,
  minPricePerKg = null,
  minQuantityKg = null,
  maxQuantityKg = null,
  requiredByBefore = null,
  buyerType = null,
  verifiedOnly = false,
  includeSuspended = false,
  includeDemoData = true,
  limit = 20,
  offset = 0,
  sort = 'newest'
} = {}) => {
  await expireStale();

  const clauses = [];
  const params = [];
  const add = (sql, value) => { params.push(value); clauses.push(sql.replace('$?', `$${params.length}`)); };

  if (buyerId !== null) add('r.buyer_id = $?', parseInt(buyerId, 10));
  if (crop) add('r.crop = $?', crop);
  if (Array.isArray(statuses) && statuses.length) add('r.status = ANY($?::text[])', statuses);
  if (minPricePerKg !== null) add('r.offered_price_per_kg >= $?', minPricePerKg);
  if (minQuantityKg !== null) add('r.quantity_remaining_kg >= $?', minQuantityKg);
  if (maxQuantityKg !== null) add('r.quantity_remaining_kg <= $?', maxQuantityKg);
  if (requiredByBefore) add('r.required_by <= $?', requiredByBefore);
  if (buyerType) add('b.buyer_type = $?', buyerType);
  if (verifiedOnly) clauses.push("b.verification_status = 'verified'");
  // Suspended buyers' requirements are hidden from farmers by default: an
  // admin suspended them precisely so farmers stop dealing with them.
  if (!includeSuspended) clauses.push('b.is_suspended = FALSE');
  if (!includeDemoData) clauses.push('r.is_demo_data = FALSE');

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';

  const orderBy = {
    newest: 'r.created_at DESC',
    price_high: 'r.offered_price_per_kg DESC',
    quantity_high: 'r.quantity_remaining_kg DESC',
    expiring_soon: 'r.expires_at ASC'
  }[sort] || 'r.created_at DESC';

  const safeLimit = Math.min(Math.max(1, parseInt(limit, 10) || 20), 100);
  const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

  const countResult = await query(
    `SELECT COUNT(*)::int AS total FROM buyer_requirements r ${BUYER_JOIN} ${where}`,
    params
  );

  params.push(safeLimit, safeOffset);
  const result = await query(
    `SELECT ${COLUMNS}, ${BUYER_COLUMNS} FROM buyer_requirements r ${BUYER_JOIN} ${where}
     ORDER BY ${orderBy}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );

  return {
    requirements: result.rows.map(decorate),
    total: countResult.rows[0].total,
    limit: safeLimit,
    offset: safeOffset,
    hasMore: safeOffset + result.rows.length < countResult.rows[0].total
  };
};

/**
 * Confirms a requirement belongs to this buyer before any mutation.
 *
 * A farmer must never be able to edit a buyer's requirement, and one buyer must
 * never edit another's - so every write path goes through here rather than
 * trusting an id from the request.
 *
 * @param {number} requirementId
 * @param {number} buyerId
 * @returns {Promise<object>} raw row
 * @throws {Error} REQUIREMENT_NOT_FOUND / REQUIREMENT_FORBIDDEN
 */
const assertOwnedByBuyer = async (requirementId, buyerId) => {
  const result = await query(
    'SELECT id, buyer_id, status, quantity_required_kg, quantity_remaining_kg FROM buyer_requirements WHERE id = $1',
    [parseInt(requirementId, 10)]
  );
  if (!result.rows.length) {
    const err = new Error(`No requirement found with id ${requirementId}.`);
    err.code = 'REQUIREMENT_NOT_FOUND';
    throw err;
  }
  if (result.rows[0].buyer_id !== parseInt(buyerId, 10)) {
    const err = new Error('This requirement belongs to a different buyer.');
    err.code = 'REQUIREMENT_FORBIDDEN';
    throw err;
  }
  return result.rows[0];
};

/**
 * Updates a requirement the caller owns.
 *
 * Quantity may only be RAISED once offers have been accepted against it, because
 * lowering it below what is already committed would corrupt the remaining figure.
 * The adjustment keeps `remaining` consistent with the new total.
 *
 * @param {object} input - { requirementId, buyerId, changes }
 * @returns {Promise<object>}
 */
const update = async ({ requirementId, buyerId, changes }) => {
  const current = await assertOwnedByBuyer(requirementId, buyerId);

  if ([STATUS.FULFILLED, STATUS.CLOSED, STATUS.CANCELLED].includes(current.status)) {
    const err = new Error(`A ${STATUS_LABEL[current.status].toLowerCase()} requirement cannot be edited.`);
    err.code = 'REQUIREMENT_NOT_EDITABLE';
    throw err;
  }

  const WRITABLE = {
    variety: 'variety',
    minimumQualityGrade: 'minimum_quality_grade',
    offeredPricePerKg: 'offered_price_per_kg',
    priceNegotiable: 'price_negotiable',
    partialFulfillmentAllowed: 'partial_fulfillment_allowed',
    pickupAvailable: 'pickup_available',
    deliveryRequired: 'delivery_required',
    deliveryLocation: 'delivery_location',
    deliveryDistrict: 'delivery_district',
    latitude: 'latitude',
    longitude: 'longitude',
    requiredBy: 'required_by',
    expiresAt: 'expires_at',
    specialRequirements: 'special_requirements',
    description: 'description',
    minimumAcceptableQuantityKg: 'minimum_acceptable_quantity_kg'
  };

  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(WRITABLE)) {
    if (changes[key] !== undefined) {
      params.push(changes[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  // Quantity needs special handling: `remaining` must move with `required`.
  if (changes.quantityRequiredKg !== undefined) {
    const committed = Number(current.quantity_required_kg) - Number(current.quantity_remaining_kg);
    if (changes.quantityRequiredKg < committed) {
      const err = new Error(
        `You have already agreed deals for ${committed} kg, so the requirement cannot be reduced below that.`
      );
      err.code = 'QUANTITY_BELOW_COMMITTED';
      throw err;
    }
    params.push(changes.quantityRequiredKg);
    sets.push(`quantity_required_kg = $${params.length}`);
    params.push(changes.quantityRequiredKg - committed);
    sets.push(`quantity_remaining_kg = $${params.length}`);
  }

  if (!sets.length) {
    const err = new Error('No changes were provided.');
    err.code = 'NO_UPDATABLE_FIELDS';
    throw err;
  }

  params.push(parseInt(requirementId, 10));
  await query(
    `UPDATE buyer_requirements SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE id = $${params.length}`,
    params
  );
  return getById(requirementId);
};

/**
 * Publishes a draft.
 * @param {object} input - { requirementId, buyerId }
 * @returns {Promise<object>}
 */
const publish = async ({ requirementId, buyerId }) => {
  const current = await assertOwnedByBuyer(requirementId, buyerId);
  if (current.status !== STATUS.DRAFT) {
    const err = new Error('Only a draft requirement can be published.');
    err.code = 'NOT_A_DRAFT';
    throw err;
  }
  await query(
    `UPDATE buyer_requirements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [STATUS.ACTIVE, parseInt(requirementId, 10)]
  );
  return getById(requirementId);
};

/**
 * Closes or cancels a requirement.
 *
 * Deliberately does NOT touch existing deals. A buyer closing a requirement is
 * saying "I need no more of this", not repudiating what they already agreed to.
 *
 * @param {object} input - { requirementId, buyerId, status }
 * @returns {Promise<object>}
 */
const close = async ({ requirementId, buyerId, status = STATUS.CLOSED }) => {
  if (![STATUS.CLOSED, STATUS.CANCELLED].includes(status)) {
    const err = new Error('Status must be closed or cancelled.');
    err.code = 'INVALID_CLOSE_STATUS';
    throw err;
  }
  const current = await assertOwnedByBuyer(requirementId, buyerId);
  if ([STATUS.CLOSED, STATUS.CANCELLED, STATUS.FULFILLED].includes(current.status)) {
    const err = new Error(`This requirement is already ${STATUS_LABEL[current.status].toLowerCase()}.`);
    err.code = 'REQUIREMENT_ALREADY_CLOSED';
    throw err;
  }
  await query(
    `UPDATE buyer_requirements SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
    [status, parseInt(requirementId, 10)]
  );
  return getById(requirementId);
};

/**
 * Whether a requirement can currently receive an offer.
 *
 * Used by the offer service before creating or accepting anything, so an expired
 * or closed requirement cannot be negotiated against.
 *
 * @param {object} requirement - decorated or raw-ish
 * @returns {object} { open, reason }
 */
const assessOpenness = (requirement) => {
  if (!requirement) return { open: false, reason: 'REQUIREMENT_NOT_FOUND' };
  if (!OPEN_STATUSES.includes(requirement.status)) {
    return { open: false, reason: `REQUIREMENT_${String(requirement.status).toUpperCase()}` };
  }
  const expiresAt = requirement.expiresAt || toLocalDateString(requirement.expires_at);
  if (expiresAt) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (new Date(expiresAt) < today) return { open: false, reason: 'REQUIREMENT_EXPIRED' };
  }
  const remaining = Number(requirement.quantityRemainingKg ?? requirement.quantity_remaining_kg ?? 0);
  if (remaining <= 0) return { open: false, reason: 'REQUIREMENT_FULLY_COMMITTED' };
  return { open: true, reason: null };
};

/**
 * Buyer dashboard counters.
 * @param {number} buyerId
 * @returns {Promise<object>}
 */
const getBuyerSummary = async (buyerId) => {
  await expireStale();
  const id = parseInt(buyerId, 10);

  const byStatus = await query(
    `SELECT status, COUNT(*)::int AS count, COALESCE(SUM(quantity_remaining_kg),0) AS remaining_kg
     FROM buyer_requirements WHERE buyer_id = $1 GROUP BY status`,
    [id]
  );

  const counts = {};
  let openRemainingKg = 0;
  for (const row of byStatus.rows) {
    counts[row.status] = row.count;
    if (OPEN_STATUSES.includes(row.status)) openRemainingKg += Number(row.remaining_kg);
  }

  return {
    byStatus: counts,
    activeRequirements: (counts.active || 0) + (counts.partially_fulfilled || 0),
    draftRequirements: counts.draft || 0,
    openRemainingKg: Math.round(openRemainingKg * 100) / 100
  };
};

module.exports = {
  STATUS,
  STATUS_LABEL,
  OPEN_STATUSES,
  create,
  getById,
  list,
  update,
  publish,
  close,
  assertOwnedByBuyer,
  assessOpenness,
  expireStale,
  getBuyerSummary,
  decorate
};
