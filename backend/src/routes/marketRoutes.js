const express = require('express');
const router = express.Router();
const marketController = require('../controllers/marketController');
const optionalAuth = require('../middleware/optionalAuthMiddleware');

/**
 * Market Routes  (mounted at /api/market and /api/markets)
 *
 * Route ordering matters: the literal paths below must be declared before any
 * '/:id' pattern, or Express would match '/prices' as a market id.
 *
 * Endpoints that read or write a specific farm go through optionalAuth so the
 * controller can enforce farm ownership. Purely public reference data (market
 * master list, crop profiles, price observations) needs no identity.
 */

// --- Operations -------------------------------------------------------------

// GET /api/market/health - data coverage, engine versions, external services
router.get('/health', marketController.healthCheck);

// POST /api/market/ingest - trigger a price ingestion pass through the
// configured provider (MARKET_PRICE_PROVIDER). Keyless; no credential to leak.
router.post('/ingest', marketController.ingestPrices);

// GET /api/market/provider/coverage - which of our mandis the provider can price
router.get('/provider/coverage', marketController.providerCoverage);

// --- Reference data --------------------------------------------------------

// GET /api/market/prices?crop=tomato&lat=&lon=&radiusKm=
router.get('/prices', marketController.getPrices);

// GET /api/market/forecast?crop=tomato&market=nagpur
router.get('/forecast', marketController.getForecast);

// GET /api/market/price-trend?crop=tomato&market=nagpur&days=30
router.get('/price-trend', marketController.getPriceTrend);

// GET /api/market/channels?crop=tomato&quantityKg=500
router.get('/channels', marketController.getChannels);

// GET /api/market/transport-options
router.get('/transport-options', marketController.getTransportOptions);

// --- The main endpoint ----------------------------------------------------

// POST /api/market/recommend
router.post('/recommend', optionalAuth, marketController.recommend);

// POST /api/market/explain - farmer-friendly narration of a recommendation
router.post('/explain', marketController.explain);

// GET /api/market/history/:farmId - past recommendations (ownership enforced)
router.get('/history/:farmId', optionalAuth, marketController.getHistory);

// --- Market master data ---------------------------------------------------
// Also reachable as /api/markets/... - see app.js, which mounts this router at
// both paths so REST-style collection URLs and the singular action URLs coexist.

// GET /api/markets
router.get('/', marketController.listMarkets);

// GET /api/markets/:id/prices?crop=&days=
router.get('/:id/prices', marketController.getMarketPrices);

// GET /api/markets/:id
router.get('/:id', marketController.getMarket);

module.exports = router;
