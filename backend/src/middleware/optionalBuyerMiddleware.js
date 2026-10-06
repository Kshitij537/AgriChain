/**
 * Attaches req.buyerProfile when the authenticated caller happens to be a buyer,
 * without requiring one.
 *
 * Needed by the endpoints that serve both audiences from one handler - listing
 * requirements, reading one requirement - where being a buyer changes WHAT you
 * see (your own drafts, your suspended listings) but is not a precondition for
 * seeing anything at all. requireBuyer() would lock farmers out of browsing.
 */
const roleService = require('../services/roleService');

const optionalBuyerMiddleware = async (req, res, next) => {
  if (!req.user || !req.user.id) return next();
  try {
    req.buyerProfile = await roleService.getBuyerProfileForUser(req.user.id);
  } catch (error) {
    // A failed lookup must not block a farmer from browsing.
    console.warn('[Optional Buyer] Lookup failed:', error.message);
    req.buyerProfile = null;
  }
  return next();
};

module.exports = optionalBuyerMiddleware;
