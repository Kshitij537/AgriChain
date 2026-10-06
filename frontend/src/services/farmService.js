import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Fetches user farms from backend GET /api/farms/user
 * @param {number} userId - Optional user ID (defaults to 1 for testing)
 * @returns {Promise<Array>} List of farm objects
 */
export const getUserFarms = async (userId = 1) => {
  try {
    // Send the token when one exists. The backend gives a verified token priority
    // over ?userId, so the field list is built for the SAME identity that
    // /api/market/recommend later checks ownership against. Without this the page
    // could list fields belonging to another account and then 403 on every one.
    const token = localStorage.getItem('token');
    const response = await axios.get(`${API_BASE_URL}/api/farms/user?userId=${userId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    });
    const payload = response.data;
    if (!payload || !payload.success) return [];

    // The endpoint returns the list under `farms`, not `data` — which is what
    // SavedFields, Dashboard and SpoilageRisk all read. This service previously
    // only checked `data`, so it always returned [] and the Market page silently
    // fell back to demonstration figures with no farm attached. Both keys are
    // accepted so either response shape works.
    const farms = Array.isArray(payload.farms)
      ? payload.farms
      : Array.isArray(payload.data)
        ? payload.data
        : [];

    return farms;
  } catch (error) {
    console.warn('[Farm Service] Failed to fetch user farms:', error.message);
    return [];
  }
};
