/**
 * Optional authentication.
 *
 * Decodes a Bearer token when one is present and attaches req.user, but does not
 * reject the request when it is absent.
 *
 * WHY THIS EXISTS RATHER THAN authMiddleware
 * ------------------------------------------
 * The rest of this application is mid-migration to enforced auth: farmRoutes and
 * ndviRoutes currently run unauthenticated and resolve the farmer as
 * `req.query.userId || req.user?.id || 1`. The existing React pages rely on that,
 * and the Market page reaches the API through the same path.
 *
 * Adding hard authMiddleware to the market routes alone would break the working
 * frontend; ignoring identity altogether would let any caller pass any farmId and
 * read another farmer's field. This middleware takes the third option: it resolves
 * an identity by the same rule the rest of the app uses, records how confident we
 * are in it, and lets the controller enforce farm ownership against whatever
 * identity was resolved.
 *
 * `req.auth.authenticated` distinguishes the two cases, so ownership failures can
 * be reported accurately and the fallback is visible in logs rather than implicit.
 *
 * MIGRATION: when the frontend sends a token on every request, swap this for
 * authMiddleware on the market routes and delete the fallback branch. The
 * ownership check in the controller needs no change.
 */

const jwt = require('jsonwebtoken');

/** The development identity used when no token is supplied, matching farmRoutes. */
const DEV_FALLBACK_USER_ID = 1;

const optionalAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
      req.user = { id: decoded.userId, email: decoded.email, ...decoded };
      req.auth = { authenticated: true, source: 'JWT', userId: decoded.userId };
      return next();
    } catch (error) {
      // An expired or forged token is an explicit failure, not an anonymous
      // request: honouring it as anonymous would make tampering the easy path.
      return res.status(403).json({
        success: false,
        error: { code: 'AUTH_INVALID', message: 'Token is invalid or expired' }
      });
    }
  }

  const suppliedUserId = parseInt(req.body?.userId ?? req.query?.userId, 10);
  const userId = Number.isFinite(suppliedUserId) && suppliedUserId > 0
    ? suppliedUserId
    : DEV_FALLBACK_USER_ID;

  req.user = { id: userId };
  req.auth = {
    authenticated: false,
    source: Number.isFinite(suppliedUserId) ? 'QUERY_USER_ID' : 'DEV_FALLBACK',
    userId
  };

  return next();
};

module.exports = optionalAuthMiddleware;
module.exports.DEV_FALLBACK_USER_ID = DEV_FALLBACK_USER_ID;

/**
 * Best-effort token decode, for handlers that are NOT behind auth middleware.
 *
 * Returns the token's user id when a valid Bearer token is present, and null
 * otherwise — including when the token is malformed or expired. It never throws
 * and never rejects the request, so adding it to an existing unauthenticated
 * handler cannot change that handler's success/failure behaviour.
 *
 * WHY THIS IS NEEDED
 * ------------------
 * /api/farms/user resolves the farmer from `req.query.userId`, while
 * /api/market/recommend enforces ownership against the JWT. When those disagree —
 * a browser logged in as user 2 fetching `?userId=1` — the farms list happily
 * returns fields the caller may not use, and every recommendation for them fails
 * with 403 FARM_FORBIDDEN. The list must be built for the same identity that
 * ownership is later checked against.
 *
 * @param {object} req - Express request
 * @returns {number|null} verified user id, or null
 */
const decodeOptionalToken = (req) => {
  const authHeader = req.headers && req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  try {
    const decoded = jwt.verify(
      authHeader.split(' ')[1],
      process.env.JWT_SECRET || 'fallback_secret'
    );
    const userId = parseInt(decoded.userId, 10);
    return Number.isFinite(userId) && userId > 0 ? userId : null;
  } catch {
    // A stale or forged token is treated as "no token" here, because this helper
    // is used by endpoints that legitimately serve unauthenticated callers.
    return null;
  }
};

module.exports.decodeOptionalToken = decodeOptionalToken;
