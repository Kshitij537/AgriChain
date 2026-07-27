import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Fetches user farms from backend GET /api/farms/user
 * @param {number} userId - Optional user ID (defaults to 1 for testing)
 * @returns {Promise<Array>} List of farm objects
 */
export const getUserFarms = async (userId = 1) => {
  try {
    const response = await axios.get(`${API_BASE_URL}/api/farms/user?userId=${userId}`);
    if (response.data && response.data.success && Array.isArray(response.data.data)) {
      return response.data.data;
    }
    return [];
  } catch (error) {
    console.warn('[Farm Service] Failed to fetch user farms:', error.message);
    return [];
  }
};
