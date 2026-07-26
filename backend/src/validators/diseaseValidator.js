// Disease Detection Request Validator
// Purpose: Validates incoming request data formats before calling controllers

const isValidPositiveInteger = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return false;
  }
  const num = Number(value);
  return Number.isInteger(num) && num > 0 && String(num) === String(value).trim();
};

const validateDiseaseDetectionRequest = (req, res, next) => {
  const { farmId } = req.body || {};

  // Rule 1: Validate farmId if provided
  if (farmId !== undefined && farmId !== null && String(farmId).trim() !== '') {
    if (!isValidPositiveInteger(farmId)) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FARM_ID',
          message: 'Farm ID must be a positive integer.'
        }
      });
    }
  }

  // Rule 2: Image Exists (Defensive Check)
  if (!req.file) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'IMAGE_REQUIRED',
        message: 'Image is required.'
      }
    });
  }

  next();
};

const validateFarmIdParam = (req, res, next) => {
  const { farmId } = req.params;

  if (farmId === undefined || farmId === null || String(farmId).trim() === '') {
    return res.status(400).json({
      success: false,
      error: {
        code: 'FARM_ID_REQUIRED',
        message: 'Farm ID is required.'
      }
    });
  }

  if (!isValidPositiveInteger(farmId)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_FARM_ID',
        message: 'Farm ID must be a positive integer.'
      }
    });
  }

  next();
};

module.exports = {
  isValidPositiveInteger,
  validateDiseaseDetectionRequest,
  validateFarmIdParam
};
