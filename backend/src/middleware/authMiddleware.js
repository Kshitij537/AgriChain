const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: {
        code: 'AUTH_MISSING',
        message: 'Access token is required'
      }
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret');
    req.user = {
      id: decoded.userId,
      email: decoded.email,
      ...decoded
    };
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'AUTH_INVALID',
        message: 'Token is invalid or expired'
      }
    });
  }
};

module.exports = authMiddleware;
