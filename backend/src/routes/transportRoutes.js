const express = require('express');
const router = express.Router();
const transportController = require('../controllers/transportController');
const authMiddleware = require('../middleware/authMiddleware');
const { requireRole } = require('../middleware/roleMiddleware');

/**
 * Transport Routes  (mounted at /api/transport)
 *
 * The frontend calls these; it never calls Google Places directly. That is what
 * keeps GOOGLE_MAPS_API_KEY server-side and lets us validate, filter, cap and
 * cache requests before any billed call is made.
 */

// GET /api/transport/health - is Google Places configured, and what it provides
router.get('/health', transportController.healthCheck);

// GET /api/transport/search?marketId=nagpur&farmId=39&quantityKg=500
// Transport businesses near the recommended mandi, plus AgriChain's own
// estimated trip cost (which does not depend on Google).
router.get('/search', transportController.search);

// --- freight rate provenance ------------------------------------------------

// GET /api/transport/rate-basis?district=Wardha - what each vehicle is priced at
// and on what evidence. Public: it explains numbers the farmer is already shown.
router.get('/rate-basis', transportController.rateBasis);

// GET /api/transport/fuel-price/history
router.get('/fuel-price/history', transportController.fuelHistory);

// POST /api/transport/fuel-price - record an observed pump price. Authenticated,
// because every observation is attributed to whoever reported it.
router.post('/fuel-price', authMiddleware, transportController.recordFuelPrice);

// POST /api/transport/quotes - record a rate a named transporter quoted.
router.post('/quotes', authMiddleware, transportController.recordQuote);

// POST /api/transport/config/reload - admin only: picks up rate changes made in
// SQL without waiting out the 5-minute vehicle-config cache.
router.post('/config/reload', authMiddleware, requireRole('admin'), transportController.reloadConfig);

module.exports = router;
