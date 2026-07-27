const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { query } = require('./config/db');
const app = require('./app');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret';

const runTests = async () => {
  console.log("==================================================");
  console.log("Starting Phase 3.4 — Backend Persistence & History Verification");
  console.log("==================================================");

  // 1. Ensure test farm exists in DB
  let testFarmId = null;
  const user1Token = jwt.sign({ userId: 1, email: 'testuser1@agrichain.com' }, JWT_SECRET);
  const user2Token = jwt.sign({ userId: 9999, email: 'otheruser@agrichain.com' }, JWT_SECRET);

  try {
    const farmCheck = await query('SELECT id FROM farms WHERE user_id = 1 LIMIT 1');
    if (farmCheck.rows.length > 0) {
      testFarmId = farmCheck.rows[0].id;
    } else {
      const newFarm = await query(
        'INSERT INTO farms (name, user_id, location, area_hectares, created_at) VALUES ($1, $2, $3, $4, NOW()) RETURNING id',
        ['Phase 3.4 Test Farm', 1, 'Test Location', 5.0]
      );
      testFarmId = newFarm.rows[0].id;
    }
  } catch (dbErr) {
    console.warn('[Test Preflight] DB query warning:', dbErr.message);
    testFarmId = 1;
  }

  console.log(`Test Farm ID: ${testFarmId}`);

  // 2. Start Express Server & FastAPI ML Server check
  const server = app.listen(PORT, async () => {
    console.log(`[Express Test Server] Running on http://127.0.0.1:${PORT}`);
    const BASE_API_URL = `http://127.0.0.1:${PORT}`;

    const createdRecordIds = [];

    try {
      // Find sample image
      const datasetDir = path.resolve(__dirname, '..', '..', 'dataset');
      const testManifestPath = path.join(datasetDir, 'splits', 'test.csv');
      const manifestLines = fs.readFileSync(testManifestPath, 'utf-8').split('\n').filter(l => l.trim());
      
      let sampleImagePath = null;
      for (let i = 1; i < manifestLines.length; i++) {
        const parts = manifestLines[i].split(',');
        const fullPath = path.join(datasetDir, parts[6]);
        if (fs.existsSync(fullPath)) {
          sampleImagePath = fullPath;
          break;
        }
      }

      console.log(`Sample Image for Detection: ${sampleImagePath}\n`);

      // Test A: Detection WITHOUT farmId (Must NOT persist)
      console.log("--- Test A: Prediction WITHOUT farmId (No Persistence) ---");
      const initialCountRes = await query('SELECT COUNT(*) FROM diseases WHERE farm_id = $1', [testFarmId]);
      const initialCount = parseInt(initialCountRes.rows[0].count, 10);

      const formNoFarm = new FormData();
      formNoFarm.append('image', fs.createReadStream(sampleImagePath));
      const resNoFarm = await axios.post(`${BASE_API_URL}/api/diseases/detect?top_k=3`, formNoFarm, { headers: formNoFarm.getHeaders() });
      
      const countAfterNoFarmRes = await query('SELECT COUNT(*) FROM diseases WHERE farm_id = $1', [testFarmId]);
      const countAfterNoFarm = parseInt(countAfterNoFarmRes.rows[0].count, 10);

      const noFarmPass = (resNoFarm.status === 200 && resNoFarm.data.success === true && !resNoFarm.data.data.record && countAfterNoFarm === initialCount);
      console.log(`Prediction without farmId: ${noFarmPass ? 'PASS (0 records persisted)' : 'FAIL'}`);

      // Test B: Prediction WITH valid farmId (Must persist exactly 1 record)
      console.log("\n--- Test B: Prediction WITH farmId (Persisted Record) ---");
      const formWithFarm = new FormData();
      formWithFarm.append('image', fs.createReadStream(sampleImagePath));
      formWithFarm.append('farmId', testFarmId);

      const resWithFarm = await axios.post(
        `${BASE_API_URL}/api/diseases/detect?top_k=3`,
        formWithFarm,
        {
          headers: {
            ...formWithFarm.getHeaders(),
            Authorization: `Bearer ${user1Token}`
          }
        }
      );

      const rec = resWithFarm.data.data.record;
      if (rec && rec.id) {
        createdRecordIds.push(rec.id);
      }

      const countAfterWithFarmRes = await query('SELECT COUNT(*) FROM diseases WHERE farm_id = $1', [testFarmId]);
      const countAfterWithFarm = parseInt(countAfterWithFarmRes.rows[0].count, 10);

      const withFarmPass = (resWithFarm.status === 200 && rec && rec.farmId === testFarmId && countAfterWithFarm === initialCount + 1);
      console.log(`Prediction with farmId:    ${withFarmPass ? 'PASS (1 record persisted cleanly)' : 'FAIL'} (Record ID: ${rec ? rec.id : 'N/A'})`);

      // Verify stored row in database
      const dbRowRes = await query('SELECT * FROM diseases WHERE id = $1', [rec.id]);
      const dbRow = dbRowRes.rows[0];
      const dbRowPass = (
        dbRow.farm_id === testFarmId &&
        dbRow.disease_name &&
        dbRow.confidence_score > 0 &&
        dbRow.image_url === null
      );
      console.log(`DB Row Verification:       ${dbRowPass ? 'PASS' : 'FAIL'} (disease_name: "${dbRow.disease_name}", image_url: ${dbRow.image_url})`);

      // Test C: History Retrieval & Dynamic Details Reconstruction
      console.log("\n--- Test C: History Retrieval & Reconstructed Details ---");
      const resHistory = await axios.get(`${BASE_API_URL}/api/diseases/farm/${testFarmId}`, {
        headers: { Authorization: `Bearer ${user1Token}` }
      });

      const historyData = resHistory.data.data;
      const firstHistItem = historyData.history[0];

      const histPass = (
        resHistory.status === 200 &&
        historyData.count > 0 &&
        firstHistItem.details &&
        firstHistItem.details.recommendations.length > 0 &&
        firstHistItem.details.confidence_assessment
      );
      console.log(`History Retrieval E2E:     ${histPass ? 'PASS' : 'FAIL'} (${historyData.count} items, Reconstructed recommendations: ${firstHistItem.details ? firstHistItem.details.recommendations.length : 0})`);

      // Test D: Security / Unauthorized Farm Access Rejection (HTTP 403)
      console.log("\n--- Test D: Security / Unauthorized Access Rejection ---");
      let securityPass = false;
      try {
        await axios.get(`${BASE_API_URL}/api/diseases/farm/${testFarmId}`, {
          headers: { Authorization: `Bearer ${user2Token}` } // user 9999 does not own user 1's farm
        });
      } catch (err) {
        if (err.response && err.response.status === 403) {
          securityPass = true;
        }
      }
      console.log(`Unauthorized Farm Access Rejection (HTTP 403): ${securityPass ? 'PASS' : 'FAIL'}`);

      // Test E: Invalid Farm ID Rejection (HTTP 400)
      console.log("\n--- Test E: Invalid Farm ID Rejection ---");
      let invalidIdPass = false;
      try {
        await axios.get(`${BASE_API_URL}/api/diseases/farm/abc`, {
          headers: { Authorization: `Bearer ${user1Token}` }
        });
      } catch (err) {
        if (err.response && err.response.status === 400) {
          invalidIdPass = true;
        }
      }
      console.log(`Invalid Farm ID Rejection (HTTP 400):         ${invalidIdPass ? 'PASS' : 'FAIL'}\n`);

      if (!noFarmPass || !withFarmPass || !dbRowPass || !histPass || !securityPass || !invalidIdPass) {
        throw new Error("Backend Phase 3.4 verification tests failed!");
      }

      console.log("✅ All Backend Phase 3.4 verification tests PASSED successfully.");

    } catch (err) {
      console.error("[Test Failure Error]:", err.message);
      process.exit(1);
    } finally {
      // Clean up ONLY test-created records
      if (createdRecordIds.length > 0) {
        await query('DELETE FROM diseases WHERE id = ANY($1)', [createdRecordIds]);
        console.log(`[Test Cleanup] Deleted ${createdRecordIds.length} test-created history records.`);
      }

      server.close(() => {
        console.log("[Express Test Server] Stopped cleanly.");
        process.exit(0);
      });
    }
  });
};

runTests();
