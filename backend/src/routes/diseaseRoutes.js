const express = require('express');
const router = express.Router();
const diseaseController = require('../controllers/diseaseController');

// POST /api/disease/detect
router.post('/detect', diseaseController.detectDisease);

// GET /api/disease/farm/:farmId
router.get('/farm/:farmId', diseaseController.getHistoryByFarm);

module.exports = router;
