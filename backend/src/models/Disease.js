// TODO (Milestone 2.6):
// Replace placeholder with PostgreSQL persistence.

/**
 * Simulates saving a disease prediction to the database
 * @param {Object} predictionData - Prediction data containing farmId, disease, confidence, severity, recommendation
 * @returns {Promise<Object>} - The simulated saved database record
 */
const savePredictionPlaceholder = async (predictionData) => {
  return {
    id: Math.floor(Math.random() * 1000) + 1,
    farmId: predictionData.farmId,
    diseaseName: predictionData.disease,
    severityLevel: predictionData.severity,
    confidenceScore: predictionData.confidence,
    treatmentRecommendation: predictionData.recommendation,
    createdAt: new Date().toISOString()
  };
};

/**
 * Simulates fetching prediction history for a farm sorted newest-first
 * @param {number|string} farmId - The ID of the farm
 * @returns {Promise<Array>} - Simulated array of prediction records
 */
const getHistoryByFarmPlaceholder = async (farmId) => {
  return [
    {
      id: 101,
      disease: 'Tomato Early Blight',
      confidence: 92.5,
      severity: 'Medium',
      createdAt: new Date(Date.now() - 3600000).toISOString() // 1 hour ago
    },
    {
      id: 100,
      disease: 'Tomato Healthy',
      confidence: 98.2,
      severity: 'Low',
      createdAt: new Date(Date.now() - 86400000).toISOString() // 1 day ago
    }
  ];
};

module.exports = {
  savePredictionPlaceholder,
  getHistoryByFarmPlaceholder
};
