const express = require('express');
const router = express.Router();
const diseaseController = require('../controllers/diseaseController');
const authMiddleware = require('../middleware/authMiddleware');
const uploadMiddleware = require('../middleware/uploadMiddleware');
const { validateDiseaseDetectionRequest, validateFarmIdParam } = require('../validators/diseaseValidator');

// POST /api/disease/detect
router.post(
  '/detect',
  authMiddleware,
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

