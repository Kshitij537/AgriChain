const express = require('express');
const router = express.Router();
const spoilageController = require('../controllers/spoilageController');
const authMiddleware = require('../middleware/authMiddleware');

/**
 * Spoilage Routes
 * Post-harvest spoilage risk assessment endpoints
 */

// Health check
// GET /api/spoilage/health
router.get('/health', spoilageController.healthCheck);

// Form options: supported crops, storage types, transport modes
// GET /api/spoilage/options
router.get('/options', spoilageController.getOptions);

// Assess spoilage risk for a harvested batch
// POST /api/spoilage/assess
router.post('/assess', spoilageController.assessRisk);

// Assessment history for a farm (ownership enforced)
// GET /api/spoilage/history/:farmId
router.get('/history/:farmId', authMiddleware, spoilageController.getHistory);

module.exports = router;
