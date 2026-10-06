const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Parse allowed origins
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',').map(origin => origin.trim());

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static uploaded files (leaf images, etc.)
const path = require('path');
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../uploads/diseases');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/farms', require('./routes/farmRoutes'));
app.use('/api/ndvi', require('./routes/ndviRoutes'));
app.use('/api/disease', require('./routes/diseaseRoutes'));
app.use('/api/diseases', require('./routes/diseaseRoutes'));
app.use('/api/weather', require('./routes/weatherRoutes'));
app.use('/api/spoilage', require('./routes/spoilageRoutes'));

// Market intelligence.
//
// The same router is mounted at both paths on purpose:
//   /api/market/*   singular, for actions and cross-market queries
//                   (recommend, prices, forecast, channels, health)
//   /api/markets/*  plural, for REST collection access to market master data
//                   (list, one market, that market's prices)
// One router keeps the handlers in one place; see routes/marketRoutes.js.
const marketRoutes = require('./routes/marketRoutes');
app.use('/api/market', marketRoutes);
app.use('/api/markets', marketRoutes);

// Crop perishability profiles used by the spoilage and market engines
app.use('/api/crops', require('./routes/cropRoutes'));

// Transporter discovery near a recommended mandi (Google Places API, called
// server-side only so the API key never reaches the browser)
app.use('/api/transport', require('./routes/transportRoutes'));

// Buyer Marketplace: a second selling channel alongside the APMC mandi.
// Every route here requires a real JWT (not optionalAuth) because the module
// holds private business-to-business conversations and negotiated prices.
app.use('/api/buyers', require('./routes/buyerRoutes'));
app.use('/api/buyer-requirements', require('./routes/requirementRoutes'));
app.use('/api/marketplace', require('./routes/marketplaceRoutes'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
