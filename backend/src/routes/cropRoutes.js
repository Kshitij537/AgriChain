const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');

/**
 * Crop Routes  (mounted at /api/crops)
 *
 * Serves the crop perishability profiles that the spoilage baseline and the
 * market engine are configured from, so a client can populate a crop picker and
 * see which crops actually have market price data behind them.
 */

// GET /api/crops
router.get('/', marketController.listCrops);

// GET /api/crops/:crop
router.get('/:crop', marketController.getCrop);

module.exports = router;
