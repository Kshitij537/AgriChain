import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/** Returns Authorization header if a JWT token is stored in localStorage */
const getAuthHeader = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * Sends image file to Express Backend endpoint POST /api/diseases/detect?top_k=3
 * @param {File} file - Leaf image File object
 * @param {number|null} farmId - Optional farm ID for ownership & database persistence
 * @param {number} topK - Number of top predictions (default 3)
 * @returns {Promise<Object>} Backend prediction payload
 */
export const detectDisease = async (file, farmId = null, topK = 3) => {
  if (!file) {
    const error = new Error('No image file selected');
    error.code = 'MISSING_FILE';
    throw error;
  }

  const formData = new FormData();
  formData.append('image', file);

  if (farmId) {
    formData.append('farmId', farmId);
  }

  const url = `${API_BASE_URL}/api/diseases/detect?top_k=${topK}`;

  try {
    const response = await axios.post(url, formData, {
      timeout: 30000, // 30 seconds (ML inference can be slow)
      headers: { ...getAuthHeader() }
    });

    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }

    const err = new Error('Invalid backend response structure');
    err.code = 'INVALID_RESPONSE';
    throw err;
  } catch (error) {
    if (error.response) {
      const status = error.response.status;
      const backendError = error.response.data?.error || {};
      const err = new Error(backendError.message || `Server returned error status ${status}`);
      err.status = status;
      err.code = backendError.code || `HTTP_${status}`;
      throw err;
    }

    if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
      const err = new Error('Disease detection request timed out. Please try again.');
      err.status = 504;
      err.code = 'ML_SERVICE_TIMEOUT';
      throw err;
    }

    const err = new Error('Unable to connect to AgriChain backend server. Please check your network connection.');
    err.status = 503;
    err.code = 'NETWORK_ERROR';
    throw err;
  }
};

/**
 * Fetches disease detection prediction history for a given farm
 * @param {number} farmId 
 * @returns {Promise<Array>}
 */
export const getHistoryByFarm = async (farmId) => {
  const url = `${API_BASE_URL}/api/diseases/farm/${farmId}`;
  try {
    const response = await axios.get(url, { headers: { ...getAuthHeader() } });
    if (response.data && response.data.success && response.data.data) {
      return response.data.data.history || [];
    }
    return [];
  } catch (error) {
    console.warn(`[Disease API] Failed to fetch history for farm ${farmId}:`, error.message);
    return [];
  }
};

/**
 * Fetches multi-source integrated Smart Field Advisory
 */
export const fetchCombinedAdvisory = async ({ diseaseData, farmData, ndviData, weatherData, language = 'en' }) => {
  const url = `${API_BASE_URL}/api/diseases/combined-advisory`;
  try {
    const response = await axios.post(
      url,
      { diseaseData, farmData, ndviData, weatherData, language },
      { headers: { ...getAuthHeader() }, timeout: 25000 }
    );
    if (response.data && response.data.success && response.data.data) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.warn('[Disease API] Failed to fetch combined advisory:', error.message);
    return null;
  }
};

