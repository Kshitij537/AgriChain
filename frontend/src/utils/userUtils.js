/**
 * User utility functions for role management
 */

/**
 * Get the current user from localStorage
 * @returns {Object|null} User object or null if not found
 */
export const getCurrentUser = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      return JSON.parse(userStr);
    }
  } catch (error) {
    console.error('Error parsing user from localStorage:', error);
  }
  return null;
};

/**
 * Check if the current user has a specific role
 * @param {string} role - Role to check (e.g., 'buyer', 'farmer', 'admin')
 * @returns {boolean} True if user has the role
 */
export const hasRole = (role) => {
  const user = getCurrentUser();
  return user && user.roles && user.roles.includes(role);
};

/**
 * Get the primary user type for UI purposes
 * Buyers get 'buyer' even if they also have farmer role
 * @returns {string} 'buyer' or 'farmer'
 */
export const getPrimaryUserType = () => {
  const user = getCurrentUser();
  if (user && user.roles) {
    // Prioritize buyer role for UI purposes
    if (user.roles.includes('buyer')) {
      return 'buyer';
    }
  }
  return 'farmer';
};

/**
 * Check if user is authenticated
 * @returns {boolean} True if user is logged in
 */
export const isAuthenticated = () => {
  const token = localStorage.getItem('token');
  const user = getCurrentUser();
  return !!(token && user);
};

/**
 * Get the auth token
 * @returns {string|null} JWT token or null
 */
export const getAuthToken = () => {
  return localStorage.getItem('token');
};

/**
 * Clear user session
 */
export const clearSession = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  localStorage.removeItem('rememberMe');
};
