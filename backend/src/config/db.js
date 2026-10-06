const { Pool } = require('pg');
require('dotenv').config();

const dbConfig = {
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 5432,
  database: process.env.DB_NAME || 'agrichain_db',
};
const shouldLogQueries = process.env.DB_LOG_QUERIES === 'true';

console.log('📊 Database Config:', {
  user: dbConfig.user,
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  password: dbConfig.password ? '***' : '(empty)'
});

const pool = new Pool(dbConfig);

const startupMigrations = [
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS location VARCHAR(255)",
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS latitude FLOAT",
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS longitude FLOAT",
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS area_hectares FLOAT",
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS boundary_coordinates JSONB",
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS crop_type VARCHAR(100)",
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE farms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)",
  "ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS captured_date TIMESTAMP",
  "ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS satellite_source VARCHAR(100)",
  "ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS health_status VARCHAR(50)",
  "ALTER TABLE ndvi ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS health_status VARCHAR(50)",
  "ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS image_date DATE",
  "ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS cloud_coverage FLOAT",
  "ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS source VARCHAR(100)",
  "ALTER TABLE ndvi_history ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS severity_level VARCHAR(50)",
  "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS confidence_score FLOAT",
  "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS image_url VARCHAR(500)",
  "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS description TEXT",
  "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS treatment_recommendation TEXT",
  "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS detected_date TIMESTAMP",
  "ALTER TABLE diseases ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS crop_batch_id VARCHAR(100)",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS spoilage_risk_percentage FLOAT",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS storage_condition VARCHAR(100)",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS expected_shelf_life INTEGER",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS current_condition VARCHAR(100)",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS recommendation TEXT",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS assessment_date TIMESTAMP",
  "ALTER TABLE spoilage ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
  "CREATE INDEX IF NOT EXISTS idx_farms_user_id ON farms(user_id)",
  "CREATE INDEX IF NOT EXISTS idx_ndvi_farm_id ON ndvi(farm_id)",
  "CREATE INDEX IF NOT EXISTS idx_ndvi_captured_date ON ndvi(captured_date)",
  "CREATE UNIQUE INDEX IF NOT EXISTS uq_ndvi_history_field_date ON ndvi_history(field_id, captured_date)",
  "CREATE INDEX IF NOT EXISTS idx_ndvi_history_field_id ON ndvi_history(field_id)",
  "CREATE INDEX IF NOT EXISTS idx_ndvi_history_captured_date ON ndvi_history(captured_date)",
  "CREATE INDEX IF NOT EXISTS idx_diseases_farm_id ON diseases(farm_id)",
  "CREATE INDEX IF NOT EXISTS idx_diseases_detected_date ON diseases(detected_date)",
  "CREATE INDEX IF NOT EXISTS idx_spoilage_farm_id ON spoilage(farm_id)",
  "CREATE INDEX IF NOT EXISTS idx_spoilage_assessment_date ON spoilage(assessment_date)",
];

/**
 * Applies the market intelligence schema from database/schemas/market.sql.
 *
 * That file is the single source of truth for the market tables and is fully
 * idempotent (every statement is IF NOT EXISTS), so running it on each boot is
 * safe and keeps a fresh clone working without a manual psql step.
 */
const runMarketSchema = async () => {
  const fsModule = require('fs');
  const pathModule = require('path');

  // Applied in order. Both files are fully idempotent (every statement is
  // IF NOT EXISTS), so running them on each boot is safe and keeps a fresh clone
  // working without a manual psql step. marketplace.sql comes second because its
  // foreign keys reference users and farms, which the startup migrations above
  // have already ensured.
  // transport_rates.sql comes after market.sql because it ALTERs transport_config,
  // which market.sql creates.
  const schemaFiles = ['market.sql', 'marketplace.sql', 'transport_rates.sql', 'market_providers.sql'];

  for (const file of schemaFiles) {
    const schemaPath = pathModule.join(__dirname, '../../../database/schemas', file);
    if (!fsModule.existsSync(schemaPath)) {
      console.warn(`⚠️ Schema file not found at ${schemaPath}`);
      continue;
    }
    await pool.query(fsModule.readFileSync(schemaPath, 'utf8'));
  }
};

const runStartupMigrations = async () => {
  for (const statement of startupMigrations) {
    await pool.query(statement);
  }
  await runMarketSchema();
};

// Test connection immediately
pool.connect((err, client, done) => {
  if (err) {
    console.error('❌ Database Connection Error:', err.message);
  } else {
    console.log('✅ Connected to PostgreSQL database');
    done();

    // Best-effort backward-compatible migrations for existing databases.
    // If the DB user lacks privileges, we log a warning and continue.
    runStartupMigrations()
      .then(() => console.log('✅ DB startup migrations complete'))
      .catch((e) => console.warn('⚠️ DB startup migrations skipped/failed:', e.message));
  }
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

// Query helper function
const query = async (text, params) => {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    if (shouldLogQueries) {
      const duration = Date.now() - start;
      console.log('Executed query', { text, duration, rows: result.rowCount });
    }
    return result;
  } catch (error) {
    console.error('Database query error:', error);
    throw error;
  }
};

module.exports = { pool, query };
