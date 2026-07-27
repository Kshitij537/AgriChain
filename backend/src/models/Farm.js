const { query } = require('../config/db');

/**
 * Checks if the user owns a specific farm.
 * @param {number|string} farmId - The ID of the farm.
 * @param {number|string} userId - The ID of the authenticated user.
 * @returns {Promise<Object|null>} - The farm object if owned, otherwise null.
 */
const checkFarmOwnership = async (farmId, userId) => {
  const result = await query(
    'SELECT * FROM farms WHERE id = $1 AND user_id = $2',
    [parseInt(farmId, 10), parseInt(userId, 10)]
  );
  return result.rows.length > 0 ? result.rows[0] : null;
};

module.exports = {
  checkFarmOwnership
};
