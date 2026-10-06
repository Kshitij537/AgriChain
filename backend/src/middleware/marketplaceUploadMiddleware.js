/**
 * Marketplace attachment upload.
 *
 * Disk storage under backend/uploads/marketplace/, NOT served by express.static.
 * The only route to the bytes is GET /api/marketplace/messages/:id/attachment,
 * which verifies the caller is a participant in the conversation first. That is
 * the whole reason for a private directory rather than a public one.
 */
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const UPLOAD_DIR = path.join(__dirname, '../../uploads/marketplace');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

/** Images only, and only formats a browser renders safely. */
const ALLOWED_MIME = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    // Random name, never the user's. An uploaded filename is attacker-controlled
    // and could contain path traversal or a misleading double extension.
    const ext = (path.extname(file.originalname || '') || '.jpg').toLowerCase().slice(0, 6);
    const safeExt = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? ext : '.jpg';
    cb(null, `msg_${Date.now()}_${crypto.randomBytes(8).toString('hex')}${safeExt}`);
  }
});

const messageAttachmentUpload = multer({
  storage,
  limits: { fileSize: MAX_SIZE_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(String(file.mimetype).toLowerCase())) {
      const err = new Error('Only JPEG, PNG or WebP photos can be attached.');
      err.code = 'UNSUPPORTED_ATTACHMENT_TYPE';
      return cb(err);
    }
    return cb(null, true);
  }
}).single('attachment');

/** Wraps multer so its errors become the project's JSON error shape. */
const uploadAttachment = (req, res, next) => {
  messageAttachmentUpload(req, res, (error) => {
    if (!error) return next();
    const code = error.code === 'LIMIT_FILE_SIZE'
      ? 'ATTACHMENT_TOO_LARGE'
      : (error.code || 'ATTACHMENT_UPLOAD_FAILED');
    return res.status(400).json({
      success: false,
      error: {
        code,
        message: code === 'ATTACHMENT_TOO_LARGE'
          ? 'Photos must be under 5 MB.'
          : error.message
      }
    });
  });
};

module.exports = { uploadAttachment, ALLOWED_MIME, MAX_SIZE_BYTES, UPLOAD_DIR };
