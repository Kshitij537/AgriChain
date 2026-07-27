const path = require('path');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

// Load environment variables from backend/.env
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { getDiseaseKnowledge, getConfidenceAssessment, DISEASE_KNOWLEDGE_BASE } = require('./constants/diseaseKnowledge');
const app = require('./app');

const PORT = process.env.PORT || 3000;

const runTests = async () => {
  console.log("==================================================");
  console.log("Starting Phase 3.3 — Backend Enrichment Verification");
  console.log("==================================================");

  // 1. Verify All 12 Class Index Mappings (0..11)
  console.log("\n--- 1. Knowledge Base 12-Class Mapping Audit ---");
  for (let idx = 0; idx < 12; idx++) {
    const entry = getDiseaseKnowledge(idx);
    const valid = (
      entry.class_index === idx &&
      typeof entry.crop === 'string' &&
      typeof entry.disease === 'string' &&
      typeof entry.description === 'string' &&
      Array.isArray(entry.symptoms) &&
      Array.isArray(entry.causes) &&
      Array.isArray(entry.recommendations) &&
      Array.isArray(entry.prevention) &&
      Array.isArray(entry.sources) &&
      entry.sources.length > 0
    );

    if (!valid) {
      throw new Error(`Knowledge mapping failed for class_index ${idx}`);
    }
    console.log(`[Class ${idx.toString().padStart(2, '0')}] ${entry.crop} - ${entry.disease} (${entry.severity_level}): ${entry.recommendations.length} recommendations, ${entry.sources.length} sources`);
  }
  console.log("✅ All 12 class knowledge entries verified successfully.");

  // 2. Verify Confidence Assessment Threshold Rules
  console.log("\n--- 2. Confidence Assessment Level Rules ---");
  const confHigh = getConfidenceAssessment(0.95);
  const confMod = getConfidenceAssessment(0.65);
  const confLow = getConfidenceAssessment(0.35);

  console.log(`Confidence 0.95 -> Level: ${confHigh.level} | Message: ${confHigh.message}`);
  console.log(`Confidence 0.65 -> Level: ${confMod.level} | Message: ${confMod.message}`);
  console.log(`Confidence 0.35 -> Level: ${confLow.level} | Message: ${confLow.message}`);

  if (confHigh.level !== 'high' || confMod.level !== 'moderate' || confLow.level !== 'low') {
    throw new Error("Confidence assessment rules failed!");
  }
  console.log("✅ Confidence assessment rules verified.");

  // 3. Fallback Safety Verification
  console.log("\n--- 3. Fallback Safety Verification ---");
  const fallbackEntry = getDiseaseKnowledge(999);
  if (!fallbackEntry || fallbackEntry.crop !== 'Crop Leaf' || fallbackEntry.recommendations.length === 0) {
    throw new Error("Fallback knowledge retrieval failed!");
  }
  console.log("✅ Fallback safety verified.");

  // 4. Start Express Server & Test Real HTTP Prediction Enrichment
  console.log("\n--- 4. HTTP Prediction Response Enrichment & Parity ---");
  const server = app.listen(PORT, async () => {
    console.log(`[Express Test Server] Running on http://127.0.0.1:${PORT}`);
    const BASE_API_URL = `http://127.0.0.1:${PORT}`;

    try {
      const datasetDir = path.resolve(__dirname, '..', '..', 'dataset');
      const testManifestPath = path.join(datasetDir, 'splits', 'test.csv');

      if (!fs.existsSync(testManifestPath)) {
        throw new Error(`Test manifest not found at ${testManifestPath}`);
      }

      const manifestLines = fs.readFileSync(testManifestPath, 'utf-8').split('\n').filter(l => l.trim());

      let cottonPath = null, soybeanPath = null, orangePath = null;
      for (let i = 1; i < manifestLines.length; i++) {
        const parts = manifestLines[i].split(',');
        const classIdx = parseInt(parts[4], 10);
        const relPath = parts[6];
        const fullPath = path.join(datasetDir, relPath);

        if (!cottonPath && classIdx <= 3 && fs.existsSync(fullPath)) cottonPath = fullPath;
        if (!soybeanPath && classIdx >= 4 && classIdx <= 7 && fs.existsSync(fullPath)) soybeanPath = fullPath;
        if (!orangePath && classIdx >= 8 && classIdx <= 11 && fs.existsSync(fullPath)) orangePath = fullPath;
        if (cottonPath && soybeanPath && orangePath) break;
      }

      const formCot = new FormData();
      formCot.append('image', fs.createReadStream(cottonPath));
      const resCot = await axios.post(`${BASE_API_URL}/api/diseases/detect?top_k=3`, formCot, { headers: formCot.getHeaders() });
      
      const payload = resCot.data;
      if (!payload.success || !payload.data.prediction || !payload.data.top_predictions || !payload.data.model_version || !payload.data.details) {
        throw new Error("HTTP response enrichment contract mismatch!");
      }

      const details = payload.data.details;
      console.log(`HTTP Prediction Enriched Response Received:`);
      console.log(`- Display Name:           ${payload.data.prediction.display_name}`);
      console.log(`- Severity Level:         ${details.severity_level}`);
      console.log(`- Confidence Assessment:  ${details.confidence_assessment.level} (${details.confidence_assessment.message})`);
      console.log(`- Recommendations Count:  ${details.recommendations.length}`);
      console.log(`- Sources Count:          ${details.sources.length}`);

      console.log("\n✅ HTTP prediction enrichment and backward compatibility verified successfully.");

    } catch (err) {
      console.error("[Test Failure Error]:", err.message);
      process.exit(1);
    } finally {
      server.close(() => {
        console.log("[Express Test Server] Stopped cleanly.");
        process.exit(0);
      });
    }
  });
};

runTests();
