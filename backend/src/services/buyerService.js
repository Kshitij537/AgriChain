/**
 * Buyer profile service.
 *
 * Owns every read and write of buyer_profiles.
 *
 * TWO PROJECTIONS, AND THE REASON FOR THEM
 * ----------------------------------------
 * A buyer profile holds two very different kinds of information:
 *
 *   PUBLIC   business name, type, district, verification status - what a farmer
 *            needs to decide whether to deal with this business at all.
 *   PRIVATE  verification documents, reviewer notes, suspension reasons, and the
 *            business phone and email.
 *
 * `toPublic()` and `toOwner()` are separate functions rather than one function
 * with a flag, because a flag defaults to something and the wrong default leaks
 * a document path. Only `toOwner()` is ever returned to the profile's owner or an
 * admin; every farmer-facing endpoint goes through `toPublic()`.
 *
 * CONTACT DETAILS
 * ---------------
 * Phone and email are withheld from the public projection. The brief is explicit
 * that private numbers must not be exposed unless the user chooses to share them,
 * and a marketplace that leaks them turns into a cold-calling list. Farmers reach
 * buyers through in-app chat; a buyer who wants to be called can put the number in
 * their requirement description.
 *
 * VERIFICATION
 * ------------
 * A buyer can only ever move their own status from unverified/rejected to
 * `verification_pending` by submitting. Reaching `verified` or
 * `verification_rejected` requires an admin, enforced in `reviewVerification`.
 */

const { query } = require('../config/db');
const roleService = require('./roleService');

const BUYER_TYPES = [
  'wholesaler', 'processor', 'retailer', 'restaurant',
  'exporter', 'cooperative_fpo', 'other'
];

const VERIFICATION = {
  UNVERIFIED: 'unverified',
  PENDING: 'verification_pending',
  VERIFIED: 'verified',
  REJECTED: 'verification_rejected'
};

/** Human labels, so the UI never invents its own wording for a status. */
const VERIFICATION_LABEL = {
  unverified: 'Not verified',
  verification_pending: 'Verification pending',
  verified: 'Verified business',
  verification_rejected: 'Verification rejected'
};

/**
 * Farmer-facing projection. Deliberately omits phone, email, exact address,
 * verification documents, reviewer notes and suspension reasons.
 *
 * @param {object} row - buyer_profiles row
 * @returns {object|null}
 */
const toPublic = (row) => {
  if (!row) return null;
  return {
    id: row.id,
    businessName: row.business_name,
    buyerType: row.buyer_type,
    // Town and district only - enough to judge distance, not enough to doorstep.
    villageCity: row.village_city,
    district: row.district,
    state: row.state,
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    cropsPurchased: row.crops_purchased || [],
    typicalPurchaseQuantityKg: row.typical_purchase_quantity_kg !== null
      ? Number(row.typical_purchase_quantity_kg)
      : null,
    serviceAreaKm: row.service_area_km !== null ? Number(row.service_area_km) : null,

    verificationStatus: row.verification_status,
    verificationLabel: VERIFICATION_LABEL[row.verification_status] || row.verification_status,
    // The single boolean a badge may be rendered from. Nothing else.
    isVerified: row.verification_status === VERIFICATION.VERIFIED,

    isDemoData: row.is_demo_data,
    memberSince: row.created_at
  };
};

/**
 * Owner/admin projection. Adds the buyer's own contact details and verification
 * state, but still never returns the raw document path to a non-admin.
 *
 * @param {object} row
 * @param {boolean} [isAdmin]
 * @returns {object|null}
 */
const toOwner = (row, isAdmin = false) => {
  if (!row) return null;
  return {
    ...toPublic(row),
    userId: row.user_id,
    contactPerson: row.contact_person,
    businessPhone: row.business_phone,
    businessEmail: row.business_email,
    address: row.address,
    pinCode: row.pin_code,
    verificationSubmittedAt: row.verification_submitted_at,
    verificationReviewedAt: row.verification_reviewed_at,
    isSuspended: row.is_suspended,
    suspendedReason: row.suspended_reason,
    updatedAt: row.updated_at,
    // Admin-only. A buyer does not need the stored path, and exposing it widens
    // the attack surface on the upload directory for no benefit.
    ...(isAdmin
      ? {
        verificationDocumentPath: row.verification_document_path,
        verificationNotes: row.verification_notes
      }
      : {})
  };
};

const ALL_COLUMNS = `
  id, user_id, business_name, buyer_type, contact_person, business_phone,
  business_email, address, village_city, district, state, pin_code,
  latitude, longitude, crops_purchased, typical_purchase_quantity_kg,
  service_area_km, verification_status, verification_submitted_at,
  verification_reviewed_at, verification_reviewed_by, verification_document_path,
  verification_notes, is_suspended, suspended_reason, is_demo_data,
  created_at, updated_at
`;

/**
 * Creates a buyer profile for the authenticated user and grants the buyer role.
 *
 * The role grant and the profile insert are one transaction: a profile without
 * the role would leave the buyer unable to use any buyer endpoint, and the role
 * without a profile would let requireBuyer pass and then fail deeper.
 *
 * @param {number} userId
 * @param {object} input - validated by marketplaceValidator
 * @returns {Promise<object>} owner projection
 * @throws {Error} BUYER_PROFILE_EXISTS
 */
const createProfile = async (userId, input) => {
  const { pool } = require('../config/db');
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM buyer_profiles WHERE user_id = $1',
      [userId]
    );
    if (existing.rows.length) {
      const err = new Error('This account already has a buyer profile.');
      err.code = 'BUYER_PROFILE_EXISTS';
      throw err;
    }

    const result = await client.query(
      `INSERT INTO buyer_profiles
         (user_id, business_name, buyer_type, contact_person, business_phone,
          business_email, address, village_city, district, state, pin_code,
          latitude, longitude, crops_purchased, typical_purchase_quantity_kg,
          service_area_km, verification_status, is_demo_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING ${ALL_COLUMNS}`,
      [
        userId,
        input.businessName,
        input.buyerType,
        input.contactPerson || null,
        input.businessPhone || null,
        input.businessEmail || null,
        input.address || null,
        input.villageCity || null,
        input.district || null,
        input.state || null,
        input.pinCode || null,
        input.latitude ?? null,
        input.longitude ?? null,
        input.cropsPurchased && input.cropsPurchased.length ? input.cropsPurchased : null,
        input.typicalPurchaseQuantityKg ?? null,
        input.serviceAreaKm ?? null,
        // NEVER from input. A new buyer is always unverified.
        VERIFICATION.UNVERIFIED,
        Boolean(input.isDemoData)
      ]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'buyer')
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId]
    );

    await client.query('COMMIT');
    return toOwner(result.rows[0]);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Fetches a profile by its own id.
 * @param {number} buyerId
 * @returns {Promise<object|null>} raw row
 */
const getRawById = async (buyerId) => {
  const result = await query(
    `SELECT ${ALL_COLUMNS} FROM buyer_profiles WHERE id = $1 LIMIT 1`,
    [parseInt(buyerId, 10)]
  );
  return result.rows[0] || null;
};

/**
 * Fetches a profile by owning user id.
 * @param {number} userId
 * @returns {Promise<object|null>} raw row
 */
const getRawByUserId = async (userId) => {
  const result = await query(
    `SELECT ${ALL_COLUMNS} FROM buyer_profiles WHERE user_id = $1 LIMIT 1`,
    [parseInt(userId, 10)]
  );
  return result.rows[0] || null;
};

/** Public view of a buyer, for farmer-facing endpoints. */
const getPublicById = async (buyerId) => toPublic(await getRawById(buyerId));

/**
 * Updates the caller's own profile.
 *
 * Verification and suspension fields are structurally unreachable here: the
 * allow-list below is the only set of columns this function can write, so a
 * request body containing verification_status is silently inert rather than
 * needing a filter that someone might forget to update.
 *
 * @param {number} userId
 * @param {object} input
 * @returns {Promise<object>} owner projection
 * @throws {Error} BUYER_PROFILE_NOT_FOUND / NO_UPDATABLE_FIELDS
 */
const updateOwnProfile = async (userId, input) => {
  const WRITABLE = {
    businessName: 'business_name',
    buyerType: 'buyer_type',
    contactPerson: 'contact_person',
    businessPhone: 'business_phone',
    businessEmail: 'business_email',
    address: 'address',
    villageCity: 'village_city',
    district: 'district',
    state: 'state',
    pinCode: 'pin_code',
    latitude: 'latitude',
    longitude: 'longitude',
    cropsPurchased: 'crops_purchased',
    typicalPurchaseQuantityKg: 'typical_purchase_quantity_kg',
    serviceAreaKm: 'service_area_km'
  };

  const sets = [];
  const params = [];

  for (const [key, column] of Object.entries(WRITABLE)) {
    if (input[key] !== undefined) {
      params.push(input[key]);
      sets.push(`${column} = $${params.length}`);
    }
  }

  if (!sets.length) {
    const err = new Error('No changes were provided.');
    err.code = 'NO_UPDATABLE_FIELDS';
    throw err;
  }

  params.push(parseInt(userId, 10));
  const result = await query(
    `UPDATE buyer_profiles SET ${sets.join(', ')}, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $${params.length}
     RETURNING ${ALL_COLUMNS}`,
    params
  );

  if (!result.rows.length) {
    const err = new Error('No buyer profile found for this account.');
    err.code = 'BUYER_PROFILE_NOT_FOUND';
    throw err;
  }
  return toOwner(result.rows[0]);
};

/**
 * The buyer submits themselves for verification.
 *
 * This is the ONLY status change a buyer may cause, and it can only reach
 * `verification_pending`. Submitting while already verified is rejected rather
 * than silently resetting a granted badge.
 *
 * @param {number} userId
 * @param {object} [input] - { documentPath }
 * @returns {Promise<object>} owner projection
 */
const submitForVerification = async (userId, input = {}) => {
  const current = await getRawByUserId(userId);
  if (!current) {
    const err = new Error('No buyer profile found for this account.');
    err.code = 'BUYER_PROFILE_NOT_FOUND';
    throw err;
  }
  if (current.verification_status === VERIFICATION.VERIFIED) {
    const err = new Error('This business is already verified.');
    err.code = 'ALREADY_VERIFIED';
    throw err;
  }
  if (current.verification_status === VERIFICATION.PENDING) {
    const err = new Error('Verification is already under review.');
    err.code = 'VERIFICATION_ALREADY_PENDING';
    throw err;
  }

  const result = await query(
    `UPDATE buyer_profiles
     SET verification_status = $1,
         verification_submitted_at = CURRENT_TIMESTAMP,
         verification_document_path = COALESCE($2, verification_document_path),
         updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $3
     RETURNING ${ALL_COLUMNS}`,
    [VERIFICATION.PENDING, input.documentPath || null, parseInt(userId, 10)]
  );
  return toOwner(result.rows[0]);
};

/**
 * An ADMIN approves or rejects a verification submission.
 *
 * The caller's admin role is checked here as well as in the route middleware.
 * This is the one status transition that creates a trust signal farmers act on,
 * so it is worth the redundant check: a future refactor that drops the
 * middleware from the route cannot silently make verification self-service.
 *
 * @param {object} input - { buyerId, decision: 'verified'|'verification_rejected', adminUserId, notes }
 * @returns {Promise<object>} owner projection, admin view
 */
const reviewVerification = async ({ buyerId, decision, adminUserId, notes = null } = {}) => {
  if (![VERIFICATION.VERIFIED, VERIFICATION.REJECTED].includes(decision)) {
    const err = new Error(`Decision must be "${VERIFICATION.VERIFIED}" or "${VERIFICATION.REJECTED}".`);
    err.code = 'INVALID_VERIFICATION_DECISION';
    throw err;
  }

  if (!(await roleService.hasRole(adminUserId, roleService.ROLE.ADMIN))) {
    const err = new Error('Only an administrator may change verification status.');
    err.code = 'ADMIN_REQUIRED';
    throw err;
  }

  const result = await query(
    `UPDATE buyer_profiles
     SET verification_status = $1,
         verification_reviewed_at = CURRENT_TIMESTAMP,
         verification_reviewed_by = $2,
         verification_notes = COALESCE($3, verification_notes),
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $4
     RETURNING ${ALL_COLUMNS}`,
    [decision, parseInt(adminUserId, 10), notes, parseInt(buyerId, 10)]
  );

  if (!result.rows.length) {
    const err = new Error(`No buyer profile found with id ${buyerId}.`);
    err.code = 'BUYER_PROFILE_NOT_FOUND';
    throw err;
  }
  return toOwner(result.rows[0], true);
};

/**
 * Admin: suspends or restores a buyer account.
 * @param {object} input - { buyerId, suspended, reason, adminUserId }
 * @returns {Promise<object>}
 */
const setSuspension = async ({ buyerId, suspended, reason = null, adminUserId } = {}) => {
  if (!(await roleService.hasRole(adminUserId, roleService.ROLE.ADMIN))) {
    const err = new Error('Only an administrator may suspend an account.');
    err.code = 'ADMIN_REQUIRED';
    throw err;
  }

  const result = await query(
    `UPDATE buyer_profiles
     SET is_suspended = $1, suspended_reason = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3
     RETURNING ${ALL_COLUMNS}`,
    [Boolean(suspended), suspended ? reason : null, parseInt(buyerId, 10)]
  );
  if (!result.rows.length) {
    const err = new Error(`No buyer profile found with id ${buyerId}.`);
    err.code = 'BUYER_PROFILE_NOT_FOUND';
    throw err;
  }
  return toOwner(result.rows[0], true);
};

/** Admin: lists profiles awaiting review. */
const listPendingVerifications = async (limit = 50) => {
  const result = await query(
    `SELECT ${ALL_COLUMNS} FROM buyer_profiles
     WHERE verification_status = $1
     ORDER BY verification_submitted_at ASC NULLS LAST
     LIMIT $2`,
    [VERIFICATION.PENDING, Math.min(limit, 200)]
  );
  return result.rows.map((row) => toOwner(row, true));
};

module.exports = {
  BUYER_TYPES,
  VERIFICATION,
  VERIFICATION_LABEL,
  createProfile,
  getRawById,
  getRawByUserId,
  getPublicById,
  updateOwnProfile,
  submitForVerification,
  reviewVerification,
  setSuspension,
  listPendingVerifications,
  toPublic,
  toOwner
};
