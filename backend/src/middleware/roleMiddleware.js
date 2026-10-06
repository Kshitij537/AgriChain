/**
 * Role-based authorization middleware.
 *
 * Runs AFTER authMiddleware, which has already established req.user from a
 * verified JWT. These guards answer "may this authenticated user do this at
 * all?"; per-record ownership ("is this THEIR requirement?") is checked in the
 * services, because only they know the record.
 *
 * WHY THE MARKETPLACE USES STRICT AUTH
 * ------------------------------------
 * The rest of AgriChain runs on optionalAuthMiddleware, where an unauthenticated
 * caller is resolved to a development user id. That is tolerable for reading your
 * own NDVI history. It is not tolerable here: the marketplace holds private
 * conversations between two businesses, negotiated prices, and contact details.
 * An anonymous caller who could be resolved to "user 1" could read user 1's
 * messages. So every marketplace route requires a real token.
 */

const roleService = require('../services/roleService');

/**
 * Requires that the caller holds a role.
 *
 * @param {string|Array<string>} roles - role, or any-of list
 * @returns {Function} Express middleware
 */
const requireRole = (roles) => {
  const allowed = Array.isArray(roles) ? roles : [roles];

  return async (req, res, next) => {
    const userId = req.user && req.user.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        error: { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' }
      });
    }

    try {
      for (const role of allowed) {
        if (await roleService.hasRole(userId, role)) {
          req.roles = await roleService.getRoles(userId);
          return next();
        }
      }

      // The message names the missing role so the frontend can offer the right
      // next step - "Register as a buyer" rather than a dead end.
      return res.status(403).json({
        success: false,
        error: {
          code: 'ROLE_REQUIRED',
          message: allowed.includes(roleService.ROLE.BUYER)
            ? 'This action needs a buyer account. Register your business to continue.'
            : 'You do not have permission to perform this action.',
          requiredRoles: allowed
        }
      });
    } catch (error) {
      console.error('[Role Middleware] Role check failed:', error.message);
      return res.status(500).json({
        success: false,
        error: { code: 'ROLE_CHECK_FAILED', message: 'Could not verify permissions.' }
      });
    }
  };
};

/**
 * Requires a buyer account, and attaches the resolved profile as req.buyerProfile.
 *
 * Also rejects suspended buyers, so an admin suspension takes effect immediately
 * across every buyer endpoint rather than needing each one to remember to check.
 *
 * @returns {Function} Express middleware
 */
const requireBuyer = () => async (req, res, next) => {
  const userId = req.user && req.user.id;

  if (!userId) {
    return res.status(401).json({
      success: false,
      error: { code: 'AUTH_REQUIRED', message: 'Please sign in to continue.' }
    });
  }

  try {
    const profile = await roleService.getBuyerProfileForUser(userId);

    if (!profile) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'BUYER_PROFILE_REQUIRED',
          message: 'Create your buyer profile first to post requirements.'
        }
      });
    }

    if (profile.isSuspended) {
      return res.status(403).json({
        success: false,
        error: {
          code: 'BUYER_SUSPENDED',
          message: 'This buyer account has been suspended. Contact support.'
        }
      });
    }

    req.buyerProfile = profile;
    return next();
  } catch (error) {
    console.error('[Role Middleware] Buyer resolution failed:', error.message);
    return res.status(500).json({
      success: false,
      error: { code: 'BUYER_CHECK_FAILED', message: 'Could not verify buyer account.' }
    });
  }
};

/** Requires the admin role. Verification and moderation only. */
const requireAdmin = () => requireRole(roleService.ROLE.ADMIN);

module.exports = { requireRole, requireBuyer, requireAdmin };
