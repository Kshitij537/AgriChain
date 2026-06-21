const axios = require('axios');

/**
 * NDVI Service - Communicates with Python Earth Engine microservice
 */

const PYTHON_SERVICE_URL = process.env.PYTHON_SERVICE_URL || process.env.SATELLITE_SERVICE_URL || 'http://localhost:5001';

/**
 * Validate polygon coordinates
 * @param {Array} coordinates - Array of [lon, lat] pairs
 * @returns {Boolean} - True if valid
 */
const validateCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates) || coordinates.length < 3) {
    throw new Error('Coordinates must be an array with at least 3 points');
  }

  coordinates.forEach((coord, index) => {
    if (!Array.isArray(coord) || coord.length !== 2) {
      throw new Error(`Coordinate ${index} must be [longitude, latitude]`);
    }
    const [lon, lat] = coord;
    if (typeof lon !== 'number' || typeof lat !== 'number') {
      throw new Error(`Coordinate ${index} must contain numeric values`);
    }
    if (lon < -180 || lon > 180) {
      throw new Error(`Coordinate ${index} longitude out of range: ${lon}`);
    }
    if (lat < -90 || lat > 90) {
      throw new Error(`Coordinate ${index} latitude out of range: ${lat}`);
    }
  });

  return true;
};

/**
 * Calculate NDVI using Python Earth Engine service
 * @param {Array} coordinates - Polygon coordinates
 * @returns {Promise<Object>} - NDVI result
 */
const calculateNDVI = async (coordinates) => {
  try {
    // Validate input
    validateCoordinates(coordinates);

    console.log(`[NDVI Service] Calculating NDVI for polygon with ${coordinates.length} points`);

    // Call Python microservice
    const response = await axios.post(`${PYTHON_SERVICE_URL}/api/ndvi/calculate`, {
      coordinates: coordinates,
      timestamp: new Date().toISOString()
    }, {
      timeout: 30000 // 30 second timeout for Earth Engine processing
    });

    const result = response.data;

    // Validate response
    if (!result.ndvi || result.ndvi === null || result.ndvi === undefined) {
      throw new Error('Invalid response from Earth Engine service: missing NDVI value');
    }

    console.log(`[NDVI Service] NDVI calculated successfully: ${result.ndvi}`);

    return {
      success: true,
      ndvi: result.ndvi,
      ndviRaw: typeof result.ndviRaw === 'number' ? result.ndviRaw : (result.ndviRaw != null ? Number(result.ndviRaw) : null),
      health: result.health,
      status: result.status,
      timestamp: new Date().toISOString(),
      imageDate: result.imageDate || null,
      cloudCoverage: result.cloudCoverage || null,
      datasource: result.datasource || null
    };

  } catch (error) {
    console.error('[NDVI Service] Error calculating NDVI:', error.message);

    // Handle specific error cases
    if (error.code === 'ECONNREFUSED') {
      throw new Error(`Satellite service is not available at ${PYTHON_SERVICE_URL}. Ensure satellite-service is running and PYTHON_SERVICE_URL is correct`);
    }

    if (error.response) {
      // Python service returned an error
      const errorData = error.response.data;
      throw new Error(errorData.error || `Earth Engine service error: ${error.response.status}`);
    }

    if (error.code === 'ENOTFOUND') {
      throw new Error('Cannot connect to Python microservice. Check service URL configuration');
    }

    throw error;
  }
};

/**
 * Get NDVI time series using Python satellite service
 * @param {Array} coordinates - Polygon coordinates
 * @param {Number} days - Number of days back
 */
const getNDVITimeSeries = async (coordinates, days = 30) => {
  try {
    validateCoordinates(coordinates);

    const safeDays = Math.max(1, Math.min(365, parseInt(days, 10) || 30));
    console.log(`[NDVI Service] Fetching NDVI time series for last ${safeDays} days`);

    const response = await axios.post(`${PYTHON_SERVICE_URL}/api/ndvi/timeseries`, {
      coordinates,
      days: safeDays,
      timestamp: new Date().toISOString(),
    }, {
      timeout: 60000,
    });

    const result = response.data;
    // Satellite service may return success=false when no imagery is available.
    // Treat this as a valid response so callers can degrade gracefully.
    return result;
  } catch (error) {
    console.error('[NDVI Service] Error fetching time series:', error.message);
    if (error.code === 'ECONNREFUSED') {
      throw new Error('Satellite service is not available. Ensure it is running (default port 5001)');
    }
    if (error.response) {
      const errorData = error.response.data;
      // Prefer returning structured error when available.
      if (errorData && typeof errorData === 'object') {
        return errorData;
      }
      throw new Error(`Satellite service error: ${error.response.status}`);
    }
    throw error;
  }
};

/**
 * Get NDVI health classification
 * @param {Number} ndvi - NDVI value
 * @returns {Object} - Health classification
 */
const getHealthClassification = (ndvi) => {
  let health = 'Unknown';
  let status = 'Unable to classify';

  if (ndvi < 0.3) {
    health = 'Poor';
    status = 'Vegetation under stress - immediate intervention recommended';
  } else if (ndvi >= 0.3 && ndvi < 0.6) {
    health = 'Moderate';
    status = 'Moderate vegetation growth - monitor closely';
  } else if (ndvi >= 0.6) {
    health = 'Good';
    status = 'Healthy vegetation with good growth';
  }

  return { health, status };
};

module.exports = {
  calculateNDVI,
  getNDVITimeSeries,
  validateCoordinates,
  getHealthClassification
};
