import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Fetches current weather data for given coordinates
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<Object>} Weather payload
 */
export const getCurrentWeather = async (lat, lon) => {
  if (!lat || !lon) return null;
  const url = `${API_BASE_URL}/api/weather/current?lat=${lat}&lon=${lon}`;
  try {
    const response = await axios.get(url, { timeout: 15000 });
    if (response.data && response.data.success) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.warn('[Weather Service] Failed to fetch weather:', error.message);
    return null;
  }
};

/**
 * Fetches complete weather data including forecast and alerts
 */
export const getCompleteWeather = async (lat, lon) => {
  if (!lat || !lon) return null;
  const url = `${API_BASE_URL}/api/weather/complete?lat=${lat}&lon=${lon}`;
  try {
    const response = await axios.get(url, { timeout: 15000 });
    if (response.data && response.data.success) {
      return response.data.data;
    }
    return null;
  } catch (error) {
    console.warn('[Weather Service] Failed to fetch complete weather:', error.message);
    return null;
  }
};
