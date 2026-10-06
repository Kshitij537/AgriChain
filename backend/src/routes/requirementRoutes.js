const express = require('express');
const router = express.Router();
const controller = require('../controllers/marketplaceController');
const authMiddleware = require('../middleware/authMiddleware');
const optionalBuyer = require('../middleware/optionalBuyerMiddleware');
const { requireBuyer } = require('../middleware/roleMiddleware');

/**
 * Buyer requirement routes (mounted at /api/buyer-requirements)
 *
 * Reads use optionalBuyer so farmers can browse while buyers additionally see
 * their own drafts. Writes use requireBuyer, and the service then verifies the
 * requirement actually belongs to that buyer - a farmer can never edit a
 * requirement, and one buyer can never edit another's.
 */

// POST /api/buyer-requirements - post a requirement
router.post('/', authMiddleware, requireBuyer(), controller.createRequirement);

// GET /api/buyer-requirements[?mine=true&crop=&minPricePerKg=&verifiedOnly=]
router.get('/', authMiddleware, optionalBuyer, controller.listRequirements);

// GET /api/buyer-requirements/:id/matching-farmers - buyer's own requirement only
router.get('/:id/matching-farmers', authMiddleware, requireBuyer(), controller.getMatchingFarmers);

// GET /api/buyer-requirements/:id
router.get('/:id', authMiddleware, optionalBuyer, controller.getRequirement);

// PATCH /api/buyer-requirements/:id
router.patch('/:id', authMiddleware, requireBuyer(), controller.updateRequirement);

// POST /api/buyer-requirements/:id/publish - draft -> active
router.post('/:id/publish', authMiddleware, requireBuyer(), controller.publishRequirement);

// POST /api/buyer-requirements/:id/close - stops new offers; existing deals stand
router.post('/:id/close', authMiddleware, requireBuyer(), controller.closeRequirement);

module.exports = router;
