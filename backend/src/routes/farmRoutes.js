const express = require('express');
const router = express.Router();
const farmController = require('../controllers/farmController');

/**
 * Farm Routes
 */

// Get all farms for logged-in user
router.get('/user', farmController.getUserFarms);

// Get a specific farm by ID
router.get('/:id', farmController.getFarmById);

// Create a new farm
router.post('/', farmController.createFarm);

// Save NDVI data for a farm
router.post('/:farmId/ndvi', farmController.saveNDVIData);

// Update a farm
router.put('/:id', farmController.updateFarm);

// Delete a farm
router.delete('/:id', farmController.deleteFarm);

module.exports = router;
