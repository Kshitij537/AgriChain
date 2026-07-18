const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';
const ML_SERVICE_TIMEOUT = parseInt(process.env.ML_SERVICE_TIMEOUT, 10) || 10000;

/**
 * Sends image to the ML Service for prediction
 * @param {Object} file - Express req.file object containing buffer, originalname, mimetype
 * @returns {Promise<Object>} - Normalized prediction object
 */
const predictDisease = async (file) => {
  if (!file || !file.buffer) {
    const err = new Error('Invalid file payload provided');
    err.code = 'INVALID_FILE_PAYLOAD';
    throw err;
  }

  const url = `${ML_SERVICE_URL}/predict`;
  console.log(`[ML Service] Calling ML service at ${url}...`);

  try {
    const formData = new FormData();
    const blob = new Blob([file.buffer], { type: file.mimetype });
    formData.append('file', blob, file.originalname);

    const response = await axios.post(url, formData, {
      timeout: ML_SERVICE_TIMEOUT
    });

    console.log('[ML Service] ML prediction received.');

    const data = response.data;

    // Validate structure: prediction exists
    if (!data || data.success !== true || !data.prediction) {
      console.error('[ML Service] Invalid response: missing success or prediction container', data);
      const err = new Error('ML response structure is invalid');
      err.code = 'INVALID_ML_RESPONSE';
      throw err;
    }

    const { disease, confidence, severity, recommendation } = data.prediction;

    // Validate each required field:
    // disease exists
    if (!disease || typeof disease !== 'string' || disease.trim() === '') {
      console.error('[ML Service] Invalid response: missing or invalid disease field', data);
      const err = new Error('ML response: disease field is required');
      err.code = 'INVALID_ML_RESPONSE';
      throw err;
    }

    // confidence is a number
    if (confidence === undefined || typeof confidence !== 'number' || isNaN(confidence)) {
      console.error('[ML Service] Invalid response: missing or invalid confidence field', data);
      const err = new Error('ML response: confidence field must be a number');
      err.code = 'INVALID_ML_RESPONSE';
      throw err;
    }

    // severity exists
    if (!severity || typeof severity !== 'string' || severity.trim() === '') {
      console.error('[ML Service] Invalid response: missing or invalid severity field', data);
      const err = new Error('ML response: severity field is required');
      err.code = 'INVALID_ML_RESPONSE';
      throw err;
    }

    // recommendation exists
    if (!recommendation || typeof recommendation !== 'string' || recommendation.trim() === '') {
      console.error('[ML Service] Invalid response: missing or invalid recommendation field', data);
      const err = new Error('ML response: recommendation field is required');
      err.code = 'INVALID_ML_RESPONSE';
      throw err;
    }

    // Return normalized prediction
    return {
      disease: disease.trim(),
      confidence: confidence,
      severity: severity.trim(),
      recommendation: recommendation.trim()
    };

  } catch (error) {
    if (error.code === 'INVALID_ML_RESPONSE' || error.code === 'INVALID_FILE_PAYLOAD') {
      throw error;
    }

    if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
      console.error('[ML Service] ML service timeout.');
      const err = new Error('ML service request timed out.');
      err.code = 'ML_SERVICE_TIMEOUT';
      throw err;
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error(`[ML Service] Connection refused: ${error.message}`);
      const err = new Error('ML service is temporarily offline.');
      err.code = 'ML_SERVICE_UNAVAILABLE';
      throw err;
    }

    if (error.response) {
      if (error.response.status >= 500) {
        console.error(`[ML Service] Server Error (HTTP ${error.response.status}):`, error.response.data);
        const err = new Error('Inference computation failed on the ML engine.');
        err.code = 'ML_SERVICE_ERROR';
        throw err;
      }
      console.error(`[ML Service] HTTP Error ${error.response.status}:`, error.response.data);
      const err = new Error(`ML service returned error status ${error.response.status}`);
      err.code = 'ML_NETWORK_ERROR';
      throw err;
    }

    console.error(`[ML Service] Network error: ${error.message}`);
    const err = new Error(error.message || 'ML service network error.');
    err.code = 'ML_NETWORK_ERROR';
    throw err;
  }
};

/**
 * Checks if the ML microservice health status endpoint is reachable
 * @returns {Promise<boolean>}
 */
const checkMLHealth = async () => {
  try {
    const url = `${ML_SERVICE_URL}/health`;
    const response = await axios.get(url, {
      timeout: 3000
    });
    return response.status === 200 && response.data && response.data.status === 'healthy';
  } catch (error) {
    console.warn(`[ML Service] Health check failed at ${ML_SERVICE_URL}: ${error.message}`);
    return false;
  }
};

// Backward-compatible export
const detectDiseaseImage = async (imageBuffer, mimeType) => {
  return predictDisease({
    buffer: imageBuffer,
    mimetype: mimeType,
    originalname: 'image.jpg'
  });
};

module.exports = {
  predictDisease,
  checkMLHealth,
  detectDiseaseImage
};
