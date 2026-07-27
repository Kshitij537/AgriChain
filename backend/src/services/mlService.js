const axios = require('axios');
const FormData = require('form-data');

const getMLServiceUrl = () => {
  const url = process.env.ML_SERVICE_URL || 'http://127.0.0.1:8000';
  return url.replace(/\/+$/, '');
};

const getMLServiceTimeout = () => {
  return parseInt(process.env.ML_SERVICE_TIMEOUT, 10) || 10000;
};

/**
 * Sends image buffer to FastAPI ML Service for prediction
 * @param {Object} file - Express req.file object containing buffer, originalname, mimetype
 * @param {number} topK - Number of top predictions (default 3)
 * @returns {Promise<Object>} - Normalized prediction object
 */
const predictDisease = async (file, topK = 3) => {
  if (!file || !file.buffer) {
    const err = new Error('Invalid file payload provided');
    err.code = 'INVALID_FILE_PAYLOAD';
    throw err;
  }

  const baseUrl = getMLServiceUrl();
  const timeout = getMLServiceTimeout();
  const url = `${baseUrl}/predict?top_k=${topK}`;

  console.log(`[ML Service] Forwarding image (${file.buffer.length} bytes, ${file.mimetype}) to ${url}...`);

  try {
    const form = new FormData();
    form.append('file', file.buffer, {
      filename: file.originalname || 'leaf.jpg',
      contentType: file.mimetype || 'image/jpeg'
    });

    const response = await axios.post(url, form, {
      headers: form.getHeaders(),
      timeout: timeout
    });

    console.log('[ML Service] ML prediction response received from FastAPI.');

    const data = response.data;
    if (!data || data.success !== true || !data.prediction) {
      console.error('[ML Service] Invalid response structure from FastAPI:', data);
      const err = new Error('ML response structure is invalid');
      err.code = 'INVALID_ML_RESPONSE';
      throw err;
    }

    return {
      prediction: data.prediction,
      top_predictions: data.top_predictions || [data.prediction],
      model_version: data.model_version || '1.0.0'
    };
  } catch (error) {
    if (error.code === 'INVALID_ML_RESPONSE' || error.code === 'INVALID_FILE_PAYLOAD') {
      throw error;
    }

    if (error.code === 'ECONNABORTED' || (error.message && error.message.includes('timeout'))) {
      console.error('[ML Service] ML service request timed out.');
      const err = new Error('Disease detection request timed out');
      err.code = 'ML_SERVICE_TIMEOUT';
      throw err;
    }

    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error(`[ML Service] Connection refused: ${error.message}`);
      const err = new Error('Disease detection engine is temporarily offline');
      err.code = 'ML_SERVICE_UNAVAILABLE';
      throw err;
    }

    if (error.response) {
      const status = error.response.status;
      const detail = error.response.data && error.response.data.detail ? error.response.data.detail : 'ML Service Error';

      console.error(`[ML Service] FastAPI returned HTTP ${status}: ${detail}`);

      if (status === 400) {
        const err = new Error(detail || 'Uploaded image is invalid');
        err.code = 'INVALID_IMAGE';
        err.statusCode = 400;
        throw err;
      }

      if (status === 413) {
        const err = new Error(detail || 'Uploaded file size exceeds maximum 10 MB limit');
        err.code = 'FILE_TOO_LARGE';
        err.statusCode = 413;
        throw err;
      }

      if (status === 415) {
        const err = new Error(detail || 'Unsupported media type');
        err.code = 'UNSUPPORTED_MEDIA_TYPE';
        err.statusCode = 415;
        throw err;
      }

      if (status === 422) {
        const err = new Error(detail || 'Invalid top_k parameter');
        err.code = 'INVALID_PARAM';
        err.statusCode = 422;
        throw err;
      }

      if (status >= 500) {
        const err = new Error('Inference computation failed on the ML engine');
        err.code = 'ML_SERVICE_ERROR';
        err.statusCode = 500;
        throw err;
      }

      const err = new Error(`ML service returned status ${status}`);
      err.code = 'ML_NETWORK_ERROR';
      err.statusCode = status;
      throw err;
    }

    console.error(`[ML Service] Network error: ${error.message}`);
    const err = new Error(error.message || 'ML service network error');
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
    const baseUrl = getMLServiceUrl();
    const url = `${baseUrl}/health`;
    const response = await axios.get(url, {
      timeout: 3000
    });
    return response.status === 200 && response.data && response.data.status === 'healthy';
  } catch (error) {
    console.warn(`[ML Service] Health check failed at ${getMLServiceUrl()}: ${error.message}`);
    return false;
  }
};

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
