const { query } = require('../config/db');

const isFiniteNumber = (value) => typeof value === 'number' && Number.isFinite(value);

// Normalize boundary coordinates to flat [[lon,lat], ...] array (or null)
// Accepts: flat array, ring array, GeoJSON-ish object, or JSON string.
const normalizeBoundaryCoordinates = (raw) => {
  if (!raw) return null;

  let value = raw;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(value.coordinates)) {
      value = value.coordinates;
    } else {
      return null;
    }
  }

  if (!Array.isArray(value) || value.length === 0) return null;

  // If ring/polygon, use outer ring
  if (Array.isArray(value[0]) && Array.isArray(value[0][0])) {
    value = value[0];
  }

  if (!Array.isArray(value) || value.length < 3) return null;

  const pairs = value
    .filter((p) => Array.isArray(p) && p.length >= 2)
    .map((p) => [Number(p[0]), Number(p[1])])
    .filter(([a, b]) => isFiniteNumber(a) && isFiniteNumber(b));

  if (pairs.length < 3) return null;

  // Heuristic: swap if stored as [lat,lon]
  let lonLatScore = 0;
  let latLonScore = 0;
  for (const [a, b] of pairs) {
    const lonLatValid = Math.abs(a) <= 180 && Math.abs(b) <= 90;
    const latLonValid = Math.abs(a) <= 90 && Math.abs(b) <= 180;
    if (lonLatValid) lonLatScore++;
    if (latLonValid) latLonScore++;
  }

  if (latLonScore > lonLatScore) {
    return pairs.map(([a, b]) => [b, a]);
  }

  return pairs;
};

/**
 * Farm Controller - Handles farm/field management
 */

/**
 * GET /api/farms/user
 * Get all farms for the logged-in user with latest NDVI data
 */
const getUserFarms = async (req, res) => {
  try {
    // Get user ID from token (you'll need to add auth middleware)
    // For now, we'll get it from query params or use a default
    const userId = req.query.userId || req.user?.id || 1; // Default to user 1 for testing

    console.log(`[Farm Controller] Fetching farms for user: ${userId}`);

    // Query that joins farms with their latest NDVI data
    const result = await query(
      `SELECT 
        f.id, 
        f.name, 
        f.location, 
        f.latitude, 
        f.longitude, 
        f.area_hectares, 
        f.boundary_coordinates,
        f.crop_type, 
        f.created_at, 
        f.updated_at,
        n.ndvi_value,
        n.health_status,
        n.captured_date as ndvi_captured_date,
        n.image_url
      FROM farms f
      LEFT JOIN (
        SELECT DISTINCT ON (farm_id) 
          farm_id, 
          ndvi_value, 
          health_status, 
          captured_date, 
          image_url
        FROM ndvi
        ORDER BY farm_id, captured_date DESC
      ) n ON f.id = n.farm_id
      WHERE f.user_id = $1 
      ORDER BY f.created_at DESC`,
      [userId]
    );

    const farms = result.rows.map(farm => ({
      id: farm.id,
      name: farm.name,
      location: farm.location,
      latitude: farm.latitude,
      longitude: farm.longitude,
      area: farm.area_hectares,
      boundaryCoordinates: farm.boundary_coordinates || null,
      cropType: farm.crop_type,
      ndviValue: farm.ndvi_value || null,
      healthStatus: farm.health_status || null,
      ndviCapturedDate: farm.ndvi_captured_date || null,
      imageUrl: farm.image_url || null,
      createdAt: farm.created_at,
      updatedAt: farm.updated_at,
    }));

    res.status(200).json({
      success: true,
      count: farms.length,
      farms: farms,
    });

  } catch (error) {
    console.error('[Farm Controller] Error fetching farms:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch farms'
    });
  }
};

/**
 * GET /api/farms/:id
 * Get a specific farm by ID with latest NDVI data
 */
const getFarmById = async (req, res) => {
  try {
    const { id } = req.params;

    console.log(`[Farm Controller] Fetching farm: ${id}`);

    const result = await query(
      `SELECT 
        f.id, 
        f.name, 
        f.location, 
        f.latitude, 
        f.longitude, 
        f.area_hectares, 
        f.boundary_coordinates, 
        f.crop_type, 
        f.created_at, 
        f.updated_at,
        n.ndvi_value,
        n.health_status,
        n.captured_date as ndvi_captured_date,
        n.image_url
      FROM farms f
      LEFT JOIN (
        SELECT DISTINCT ON (farm_id) 
          farm_id, 
          ndvi_value, 
          health_status, 
          captured_date, 
          image_url
        FROM ndvi
        ORDER BY farm_id, captured_date DESC
      ) n ON f.id = n.farm_id
      WHERE f.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    const farm = result.rows[0];
    res.status(200).json({
      success: true,
      farm: {
        id: farm.id,
        name: farm.name,
        location: farm.location,
        latitude: farm.latitude,
        longitude: farm.longitude,
        area: farm.area_hectares,
        boundaryCoordinates: farm.boundary_coordinates || null,
        cropType: farm.crop_type,
        ndviValue: farm.ndvi_value || null,
        healthStatus: farm.health_status || null,
        ndviCapturedDate: farm.ndvi_captured_date || null,
        imageUrl: farm.image_url || null,
        createdAt: farm.created_at,
        updatedAt: farm.updated_at,
      },
    });

  } catch (error) {
    console.error('[Farm Controller] Error fetching farm:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch farm'
    });
  }
};

/**
 * POST /api/farms
 * Create a new farm
 */
const createFarm = async (req, res) => {
  try {
    const { name, location, latitude, longitude, area, cropType, boundaryCoordinates } = req.body;
    const userId = req.query.userId || req.user?.id || 1;

    // Validate input
    if (!name || !latitude || !longitude || !area) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, latitude, longitude, area'
      });
    }

    console.log(`[Farm Controller] Creating farm: ${name}`);

    const normalizedBoundary = normalizeBoundaryCoordinates(boundaryCoordinates);
    const boundaryJson = normalizedBoundary ? JSON.stringify(normalizedBoundary) : null;

    const result = await query(
      `INSERT INTO farms (user_id, name, location, latitude, longitude, area_hectares, boundary_coordinates, crop_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
       RETURNING id, name, location, latitude, longitude, area_hectares, boundary_coordinates, crop_type, created_at, updated_at`,
      [userId, name, location || null, latitude, longitude, area, boundaryJson, cropType || null]
    );

    const farm = result.rows[0];
    res.status(201).json({
      success: true,
      message: 'Farm created successfully',
      farm: {
        id: farm.id,
        name: farm.name,
        location: farm.location,
        latitude: farm.latitude,
        longitude: farm.longitude,
        area: farm.area_hectares,
        boundaryCoordinates: farm.boundary_coordinates || null,
        cropType: farm.crop_type,
        createdAt: farm.created_at,
        updatedAt: farm.updated_at,
      },
    });

  } catch (error) {
    console.error('[Farm Controller] Error creating farm:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to create farm'
    });
  }
};

/**
 * PUT /api/farms/:id
 * Update a farm
 */
const updateFarm = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, location, latitude, longitude, area, cropType, boundaryCoordinates } = req.body;

    console.log(`[Farm Controller] Updating farm: ${id}`);

    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (location !== undefined) {
      updates.push(`location = $${paramCount++}`);
      values.push(location);
    }
    if (latitude !== undefined) {
      updates.push(`latitude = $${paramCount++}`);
      values.push(latitude);
    }
    if (longitude !== undefined) {
      updates.push(`longitude = $${paramCount++}`);
      values.push(longitude);
    }
    if (area !== undefined) {
      updates.push(`area_hectares = $${paramCount++}`);
      values.push(area);
    }
    if (boundaryCoordinates !== undefined) {
      updates.push(`boundary_coordinates = $${paramCount++}`);
      const normalized = normalizeBoundaryCoordinates(boundaryCoordinates);
      values.push(normalized ? JSON.stringify(normalized) : null);
    }
    if (cropType !== undefined) {
      updates.push(`crop_type = $${paramCount++}`);
      values.push(cropType);
    }

    if (updates.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    updates.push(`updated_at = NOW()`);
    values.push(id);

    const result = await query(
      `UPDATE farms SET ${updates.join(', ')} WHERE id = $${paramCount} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    const farm = result.rows[0];
    res.status(200).json({
      success: true,
      message: 'Farm updated successfully',
      farm: {
        id: farm.id,
        name: farm.name,
        location: farm.location,
        latitude: farm.latitude,
        longitude: farm.longitude,
        area: farm.area_hectares,
        boundaryCoordinates: farm.boundary_coordinates || null,
        cropType: farm.crop_type,
        createdAt: farm.created_at,
        updatedAt: farm.updated_at,
      },
    });

  } catch (error) {
    console.error('[Farm Controller] Error updating farm:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to update farm'
    });
  }
};

/**
 * DELETE /api/farms/:id
 * Delete a farm
 */
const deleteFarm = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.query.userId || req.user?.id || 1;

    console.log(`[Farm Controller] Deleting farm: ${id} (user: ${userId})`);

    const result = await query(
      'DELETE FROM farms WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Farm not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Farm deleted successfully'
    });

  } catch (error) {
    console.error('[Farm Controller] Error deleting farm:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to delete farm'
    });
  }
};

/**
 * POST /api/farms/:farmId/ndvi
 * Save NDVI data for a farm
 */
const saveNDVIData = async (req, res) => {
  try {
    const { farmId } = req.params;
    const { ndviValue, healthStatus, imageDate, cloudCoverage, imageUrl } = req.body;

    if (!ndviValue || !healthStatus) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: ndviValue, healthStatus'
      });
    }

    console.log(`[Farm Controller] Saving NDVI for farm: ${farmId}`);

    const result = await query(
      `INSERT INTO ndvi (farm_id, ndvi_value, health_status, captured_date, image_url, satellite_source, created_at)
       VALUES ($1, $2, $3, $4, $5, 'satellite-service', NOW())
       RETURNING *`,
      [parseInt(farmId), parseFloat(ndviValue), healthStatus, imageDate || new Date().toISOString().split('T')[0], imageUrl || null]
    );

    res.status(200).json({
      success: true,
      message: 'NDVI data saved successfully',
      ndvi: result.rows[0],
    });

  } catch (error) {
    console.error('[Farm Controller] Error saving NDVI:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to save NDVI data'
    });
  }
};

module.exports = {
  getUserFarms,
  getFarmById,
  createFarm,
  updateFarm,
  deleteFarm,
  saveNDVIData,
};
