const multer = require('multer');
const path = require('path');
const { MAX_FILE_SIZE, ALLOWED_MIME_TYPES, ALLOWED_EXTENSIONS } = require('../constants/uploadConstants');

// Setup memory storage
const storage = multer.memoryStorage();

// File filter validation
const fileFilter = (req, file, cb) => {
  // Validate MIME Type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    const error = new Error('Only JPG, JPEG and PNG images are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  // Validate File Extension
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const error = new Error('Only JPG, JPEG and PNG images are allowed.');
    error.code = 'INVALID_FILE_TYPE';
    return cb(error, false);
  }

  cb(null, true);
};

// Configured multer instance
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

module.exports = upload;
