/**
 * Buyer Controller
 *
 * HTTP layer for buyer profiles and admin verification. Follows the response
 * convention used across this backend: { success, data, meta } or
 * { success, error: { code, message, requestId } }.
 *
 * AUTHORIZATION MODEL
 * -------------------
 * Every route here sits behind authMiddleware, so req.user comes from a verified
 * JWT and is never taken from the request body. The brief is explicit that buyer
 * and farmer ids supplied by the frontend must not be trusted when the
 * authenticated identity determines them, so `userId` in a body is ignored
 * throughout this module.
 */

const buyerService = require('../services/buyerService');
const roleService = require('../services/roleService');
const validator = require('../validators/marketplaceValidator');

const newRequestId = () => Math.random().toString(36).slice(2, 8);

const STATUS_BY_CODE = {
  BUYER_PROFILE_EXISTS: 409,
  BUYER_PROFILE_NOT_FOUND: 404,
  NO_UPDATABLE_FIELDS: 400,
  ALREADY_VERIFIED: 409,
  VERIFICATION_ALREADY_PENDING: 409,
  INVALID_VERIFICATION_DECISION: 400,
  ADMIN_REQUIRED: 403,
  INVALID_ROLE: 400
};

const sendError = (res, error, requestId) => {
  const code = error.code || 'INTERNAL_ERROR';
  const status = STATUS_BY_CODE[code] || 500;
  if (status >= 500) console.error(`[Buyer Controller] [${requestId}] ${code}: ${error.message}`);
  else console.warn(`[Buyer Controller] [${requestId}] ${code}: ${error.message}`);
  return res.status(status).json({
    success: false,
    error: { code, message: error.message || 'Unexpected server error', requestId }
  });
};

const sendValidationError = (res, errors, requestId) =>
  res.status(400).json({
    success: false,
    error: {
      code: 'VALIDATION_FAILED',
      message: errors[0].message,
      fields: errors,
      requestId
    }
  });

// ---------------------------------------------------------------------------
// POST /api/buyers/profile
// ---------------------------------------------------------------------------

/**
 * Registers a buyer profile for the authenticated user and grants the buyer role.
 * The new profile is always `unverified` - see buyerService.
 */
const createProfile = async (req, res) => {
  const requestId = newRequestId();
  try {
    const { valid, value, errors } = validator.validateBuyerProfile(req.body, false);
    if (!valid) return sendValidationError(res, errors, requestId);

    console.log(
      `[Buyer Controller] [${requestId}] create profile user=${req.user.id} ` +
      `business="${value.businessName}" type=${value.buyerType}`
    );

    const profile = await buyerService.createProfile(req.user.id, value);

    return res.status(201).json({
      success: true,
      data: profile,
      meta: {
        requestId,
        // Stated plainly so the UI never shows an unearned badge.
        note: 'Your business is registered but not yet verified. An administrator reviews verification requests.'
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/buyers/me
// ---------------------------------------------------------------------------

/** Returns the caller's own buyer profile, with their contact details included. */
const getMyProfile = async (req, res) => {
  const requestId = newRequestId();
  try {
    const row = await buyerService.getRawByUserId(req.user.id);
    if (!row) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'BUYER_PROFILE_NOT_FOUND',
          message: 'You have not registered a buyer profile yet.',
          requestId
        }
      });
    }
    const isAdmin = await roleService.hasRole(req.user.id, roleService.ROLE.ADMIN);
    return res.json({
      success: true,
      data: buyerService.toOwner(row, isAdmin),
      meta: { requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// PATCH /api/buyers/me
// ---------------------------------------------------------------------------

/**
 * Updates the caller's own profile.
 *
 * Verification status and suspension are unreachable through this route: the
 * service writes only an explicit column allow-list.
 */
const updateMyProfile = async (req, res) => {
  const requestId = newRequestId();
  try {
    const { valid, value, errors } = validator.validateBuyerProfile(req.body, true);
    if (!valid) return sendValidationError(res, errors, requestId);

    const profile = await buyerService.updateOwnProfile(req.user.id, value);
    return res.json({ success: true, data: profile, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// GET /api/buyers/:id  - PUBLIC projection
// ---------------------------------------------------------------------------

/**
 * Returns a buyer as a farmer sees them.
 *
 * Deliberately the public projection even when the caller happens to be the
 * owner: this is the endpoint farmers hit, and having one code path means a
 * future change cannot accidentally start leaking contact details to everyone.
 * Owners use GET /api/buyers/me.
 */
const getBuyerPublic = async (req, res) => {
  const requestId = newRequestId();
  try {
    const profile = await buyerService.getPublicById(req.params.id);
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: { code: 'BUYER_NOT_FOUND', message: 'No such buyer.', requestId }
      });
    }
    return res.json({ success: true, data: profile, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// POST /api/buyers/me/verification
// ---------------------------------------------------------------------------

/** The buyer submits themselves for review. Reaches `verification_pending` only. */
const submitVerification = async (req, res) => {
  const requestId = newRequestId();
  try {
    const profile = await buyerService.submitForVerification(req.user.id, {
      documentPath: req.file ? req.file.path : null
    });
    return res.json({
      success: true,
      data: profile,
      meta: {
        requestId,
        note: 'Submitted for review. Only an administrator can approve verification.'
      }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/** GET /api/buyers/admin/pending - profiles awaiting verification review. */
const listPending = async (req, res) => {
  const requestId = newRequestId();
  try {
    const limit = parseInt(req.query.limit, 10);
    const rows = await buyerService.listPendingVerifications(
      Number.isFinite(limit) && limit > 0 ? limit : 50
    );
    return res.json({ success: true, data: rows, meta: { count: rows.length, requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/**
 * POST /api/buyers/admin/:id/verification
 * Body: { decision: 'verified' | 'verification_rejected', notes }
 */
const reviewVerification = async (req, res) => {
  const requestId = newRequestId();
  try {
    console.log(
      `[Buyer Controller] [${requestId}] admin=${req.user.id} reviewing buyer=${req.params.id} ` +
      `decision=${req.body && req.body.decision}`
    );
    const profile = await buyerService.reviewVerification({
      buyerId: req.params.id,
      decision: req.body && req.body.decision,
      adminUserId: req.user.id,
      notes: (req.body && req.body.notes) || null
    });
    return res.json({ success: true, data: profile, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** POST /api/buyers/admin/:id/suspension  Body: { suspended, reason } */
const setSuspension = async (req, res) => {
  const requestId = newRequestId();
  try {
    const profile = await buyerService.setSuspension({
      buyerId: req.params.id,
      suspended: req.body && req.body.suspended === true,
      reason: (req.body && req.body.reason) || null,
      adminUserId: req.user.id
    });
    return res.json({ success: true, data: profile, meta: { requestId } });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

/** GET /api/buyers/me/roles - what the caller may do, for UI gating. */
const getMyRoles = async (req, res) => {
  const requestId = newRequestId();
  try {
    const roles = await roleService.getRoles(req.user.id);
    const buyerProfile = await roleService.getBuyerProfileForUser(req.user.id);
    return res.json({
      success: true,
      data: {
        userId: req.user.id,
        roles,
        isFarmer: roles.includes(roleService.ROLE.FARMER),
        isBuyer: roles.includes(roleService.ROLE.BUYER),
        isAdmin: roles.includes(roleService.ROLE.ADMIN),
        buyerProfileId: buyerProfile ? buyerProfile.id : null,
        buyerVerificationStatus: buyerProfile ? buyerProfile.verificationStatus : null
      },
      meta: { requestId }
    });
  } catch (error) {
    return sendError(res, error, requestId);
  }
};

module.exports = {
  createProfile,
  getMyProfile,
  updateMyProfile,
  getBuyerPublic,
  submitVerification,
  listPending,
  reviewVerification,
  setSuspension,
  getMyRoles
};
