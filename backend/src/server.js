require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') }); // ← MUST be first
const app = require('./app');
const { startNdviRefreshScheduler } = require('./jobs/ndviRefreshJob');

const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 AgriChain Backend Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`📡 API URL: http://localhost:${PORT}\n`);
});

const stopNdviRefreshScheduler = startNdviRefreshScheduler();

// Handle graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  stopNdviRefreshScheduler();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
