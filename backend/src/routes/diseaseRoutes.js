const express = require('express');
const router = express.Router();
const diseaseController = require('../controllers/diseaseController');
const authMiddleware = require('../middleware/authMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');
const { validateDiseaseDetectionRequest, validateFarmIdParam } = require('../validators/diseaseValidator');

// Optional auth helper to populate req.user if token is present, without blocking unauthenticated prediction calls
const optionalAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authMiddleware(req, res, next);
  }
  next();
};

// GET /api/disease/health or /api/diseases/health
router.get('/health', diseaseController.getMLHealth);

// POST /api/disease/detect or /api/diseases/detect
router.post(
  '/detect',
  optionalAuth,
  uploadMiddleware,
  validateDiseaseDetectionRequest,
  diseaseController.detectDisease
);

// GET /api/disease/farm/:farmId
router.get(
  '/farm/:farmId',
  authMiddleware,
  validateFarmIdParam,
  diseaseController.getHistoryByFarm
);

module.exports = router;
