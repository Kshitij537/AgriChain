const multer = require('multer');
const upload = require('../config/multer');

const singleUpload = upload.single('image');

const uploadMiddleware = (req, res, next) => {
  singleUpload(req, res, (err) => {
    if (err) {
      // Handle Multer limits (like file size)
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'Maximum file size is 10 MB.'
            }
          });
        }
        return res.status(400).json({
          success: false,
          error: {
            code: err.code,
            message: err.message
          }
        });
      }

      // Handle custom file filter errors (like INVALID_FILE_TYPE)
      if (err.code === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          success: false,
          error: {
            code: 'INVALID_FILE_TYPE',
            message: err.message || 'Only JPG, JPEG and PNG images are allowed.'
          }
        });
      }

      // Any other unexpected upload error
      return res.status(400).json({
        success: false,
        error: {
          code: 'UPLOAD_ERROR',
          message: err.message || 'An error occurred during file upload.'
        }
      });
    }

    // Standard check if file was provided
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: {
          code: 'MISSING_FILE',
          message: 'Image is required.'
        }
      });
    }

    // Success - move to next middleware
    next();
  });
};

module.exports = uploadMiddleware;
