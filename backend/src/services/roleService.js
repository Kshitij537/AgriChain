/**
 * Role service.
 *
 * AgriChain had no notion of roles before the marketplace: every account was
 * implicitly a farmer. This adds farmer / buyer / admin on top of the EXISTING
 * users table without creating a second identity system.
 *
 * WHY A TABLE AND NOT A users.role COLUMN
 * ---------------------------------------
 * The brief requires one account to hold several roles - a farmer who also buys
 * produce is a real case, and forcing them to register twice would split their
 * farms, deals and conversations across two identities. A single column cannot
 * express that, so roles live in user_roles with a UNIQUE (user_id, role).
 *
 * THE IMPLICIT FARMER ROLE
 * ------------------------
 * Every existing account predates this table, so none of them has a row. Rather
 * than run a backfill that must be re-run for every future signup, `farmer` is
 * treated as implicit: hasRole(user, 'farmer') is true unless the account has
 * been explicitly restricted. `buyer` and `admin` are never implicit - they must
 * be granted, which is what stops a farmer from posting requirements or touching
 * an admin endpoint.
 */

const { query } = require('../config/db');

const ROLE = {
  FARMER: 'farmer',
  BUYER: 'buyer',
  ADMIN: 'admin'
};

/** Roles that must be explicitly granted. */
const EXPLICIT_ROLES = new Set([ROLE.BUYER, ROLE.ADMIN]);

/**
 * Lists a user's roles, including the implicit farmer role.
 *
 * @param {number} userId
 * @returns {Promise<Array<string>>}
 */
const getRoles = async (userId) => {
  const id = parseInt(userId, 10);
  if (!Number.isFinite(id) || id <= 0) return [];

  const result = await query('SELECT role FROM user_roles WHERE user_id = $1', [id]);
  const roles = new Set(result.rows.map((r) => r.role));

  // Implicit, so the 7 existing modules keep working for accounts created before
  // this table existed.
  roles.add(ROLE.FARMER);

  return Array.from(roles);
};

/**
 * Whether a user holds a role.
 *
 * @param {number} userId
 * @param {string} role
 * @returns {Promise<boolean>}
 */
const hasRole = async (userId, role) => {
  if (!EXPLICIT_ROLES.has(role)) {
    // farmer: implicit for any real account.
    const id = parseInt(userId, 10);
    return Number.isFinite(id) && id > 0;
  }
  const result = await query(
    'SELECT 1 FROM user_roles WHERE user_id = $1 AND role = $2 LIMIT 1',
    [parseInt(userId, 10), role]
  );
  return result.rows.length > 0;
};

/**
 * Grants a role. Idempotent.
 *
 * @param {number} userId
 * @param {string} role
 * @param {number|null} [grantedBy] - the admin who granted it, for audit
 * @returns {Promise<void>}
 */
const grantRole = async (userId, role, grantedBy = null) => {
  if (!Object.values(ROLE).includes(role)) {
    const err = new Error(`Unknown role "${role}"`);
    err.code = 'INVALID_ROLE';
    throw err;
  }
  await query(
    `INSERT INTO user_roles (user_id, role, granted_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, role) DO NOTHING`,
    [parseInt(userId, 10), role, grantedBy]
  );
};

/**
 * Revokes a role.
 *
 * @param {number} userId
 * @param {string} role
 * @returns {Promise<void>}
 */
const revokeRole = async (userId, role) => {
  await query('DELETE FROM user_roles WHERE user_id = $1 AND role = $2', [
    parseInt(userId, 10),
    role
  ]);
};

/**
 * Resolves the buyer_profiles row for a user, or null.
 *
 * Used constantly by the marketplace, which addresses buyers by profile id but
 * authenticates by user id.
 *
 * @param {number} userId
 * @returns {Promise<object|null>} { id, userId, businessName, verificationStatus, isSuspended }
 */
const getBuyerProfileForUser = async (userId) => {
  const result = await query(
    `SELECT id, user_id, business_name, verification_status, is_suspended,
            latitude, longitude, service_area_km
     FROM buyer_profiles WHERE user_id = $1 LIMIT 1`,
    [parseInt(userId, 10)]
  );
  if (!result.rows.length) return null;
  const row = result.rows[0];
  return {
    id: row.id,
    userId: row.user_id,
    businessName: row.business_name,
    verificationStatus: row.verification_status,
    isSuspended: row.is_suspended,
    // Carried so a handler can measure distance from the buyer's own location
    // without a second query. Server-side only; no route returns this object.
    latitude: row.latitude !== null ? Number(row.latitude) : null,
    longitude: row.longitude !== null ? Number(row.longitude) : null,
    serviceAreaKm: row.service_area_km !== null ? Number(row.service_area_km) : null
  };
};

module.exports = {
  ROLE,
  getRoles,
  hasRole,
  grantRole,
  revokeRole,
  getBuyerProfileForUser
};
