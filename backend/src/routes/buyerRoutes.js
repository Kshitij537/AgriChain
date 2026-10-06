const express = require('express');
const router = express.Router();
const buyerController = require('../controllers/buyerController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireAdmin } = require('../middleware/roleMiddleware');

/**
 * Buyer Routes  (mounted at /api/buyers)
 *
 * STRICT auth on every route - not optionalAuth.
 *
 * The rest of AgriChain tolerates an unauthenticated caller resolved to a
 * development user id, which is fine for reading your own NDVI history. It is not
 * fine here: these routes expose business contact details and accept profile
 * edits, so an anonymous caller resolved to "user 1" could read and rewrite user
 * 1's business. Every marketplace route therefore requires a real token.
 *
 * Route order matters: the literal '/admin/...' and '/me' paths are declared
 * before '/:id', or Express would match 'me' as a buyer id.
 */

// --- the caller's own identity and roles -----------------------------------

// GET /api/buyers/me/roles - drives UI gating (is this user a buyer? an admin?)
router.get('/me/roles', authMiddleware, buyerController.getMyRoles);

// GET /api/buyers/me - own profile, including own contact details
router.get('/me', authMiddleware, buyerController.getMyProfile);

// PATCH /api/buyers/me - edit own profile (cannot touch verification)
router.patch('/me', authMiddleware, buyerController.updateMyProfile);

// POST /api/buyers/me/verification - submit for review (reaches 'pending' only)
router.post('/me/verification', authMiddleware, buyerController.submitVerification);

// --- registration ----------------------------------------------------------

// POST /api/buyers/profile - register a business, grants the buyer role
router.post('/profile', authMiddleware, buyerController.createProfile);

// --- admin moderation ------------------------------------------------------

// GET /api/buyers/admin/pending
router.get('/admin/pending', authMiddleware, requireAdmin(), buyerController.listPending);

// POST /api/buyers/admin/:id/verification  { decision, notes }
router.post('/admin/:id/verification', authMiddleware, requireAdmin(), buyerController.reviewVerification);

// POST /api/buyers/admin/:id/suspension  { suspended, reason }
router.post('/admin/:id/suspension', authMiddleware, requireAdmin(), buyerController.setSuspension);

// --- public buyer view (farmer-facing) -------------------------------------

// GET /api/buyers/:id - PUBLIC projection: no phone, email or documents
router.get('/:id', authMiddleware, buyerController.getBuyerPublic);

module.exports = router;
