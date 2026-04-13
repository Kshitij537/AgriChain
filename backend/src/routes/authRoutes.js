const express = require('express');
const { register, login } = require('../controllers/authController');

const router = express.Router();

// Register route - POST /api/auth/register
router.post('/register', register);

// Login route - POST /api/auth/login
router.post('/login', login);

module.exports = router;
