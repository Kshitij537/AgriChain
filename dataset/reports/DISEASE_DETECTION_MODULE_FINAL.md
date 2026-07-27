# AgriChain Disease Detection & Decision Support Module (Final Frozen Report)

## Executive Summary

The AgriChain Disease Detection Module delivers real-time AI crop disease diagnosis and agricultural decision support across 12 target crop classes (Cotton, Soybean, and Orange). Built on a fine-tuned EfficientNetB0 deep convolutional neural network, the system integrates a FastAPI prediction microservice, an Express backend API with dynamic agronomic knowledge enrichment, PostgreSQL detection history tracking, and a responsive React 18 user interface.

---

## 1. End-to-End System Architecture

```
React 18 / Vite 5 Frontend
    ↓ POST /api/diseases/detect (Multipart image + optional farmId)
Express Backend (Port 3000)
    ↓ POST /predict?top_k=3 (Multipart image)
FastAPI ML Service (Port 8000)
    ↓ In-memory tensor evaluation
EfficientNetB0 (disease_model.keras)
    ↓ 12-class probability distribution
FastAPI ML Service
    ↓ Top-K prediction JSON
Express Backend
    ↓ Enrich prediction with diseaseKnowledge.js metadata
    ↓ Persist concise detection record to PostgreSQL (if farmId supplied)
React 18 / Vite 5 Frontend
    ↓ Render PredictionCard, RecommendationCard, & DiseaseHistory
```

---

## 2. Supported Crops & Frozen 12-Class Mapping

| Class Index | Crop | Disease / Condition | Status | Display Name |
|---|---|---|---|---|
| 0 | Cotton | Healthy | Healthy | Cotton Healthy |
| 1 | Cotton | Bacterial Blight | Diseased | Cotton Bacterial Blight |
| 2 | Cotton | Alternaria Leaf Spot | Diseased | Cotton Alternaria Leaf Spot |
| 3 | Cotton | Leaf Curl Virus | Diseased | Cotton Leaf Curl Virus |
| 4 | Soybean | Healthy | Healthy | Soybean Healthy |
| 5 | Soybean | Rust | Diseased | Soybean Rust |
| 6 | Soybean | Bacterial Pustule | Diseased | Soybean Bacterial Pustule |
| 7 | Soybean | Brown Spot | Diseased | Soybean Brown Spot |
| 8 | Orange | Healthy | Healthy | Orange Healthy |
| 9 | Orange | Citrus Canker | Diseased | Orange Citrus Canker |
| 10 | Orange | Black Spot | Diseased | Orange Black Spot |
| 11 | Orange | Greening | Diseased | Orange Greening |

---

## 3. Production Model & Freeze Specifications

- **Model File**: `ml-service/models/disease_model.keras`
- **Architecture**: EfficientNetB0 (Fine-tuned transfer learning)
- **Model Version**: `1.0.0`
- **SHA-256 Hash**: `f531b46e4cd0903384eeec9e944e64913f3e94051498dc890612509dca34bb76`
- **Input Dimension**: `(224, 224, 3)`
- **Input Pixel Range**: `[0, 255]` (raw RGB tensor fed directly to EfficientNetB0 internal normalization layer)
- **Output Layer**: 12-unit Softmax activation
- **Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- **Frozen Test Evaluation**:
  - Test Dataset: 5,704 images across 12 classes
  - Test Accuracy: **98.58%**
  - Macro F1 Score: **93.65%**
  - Weighted F1 Score: **98.58%**

---

## 4. Key Components & Implementation Summary

### A. FastAPI ML Service (`ml-service/api/app.py`)
- `GET /health`: Health status check.
- `GET /model-info`: Returns model metadata, version, input shape, and SHA-256.
- `POST /predict?top_k=3`: Accepts JPEG, PNG, WebP image up to 10 MB in memory; returns top-K predictions.
- **Model Caching**: Singleton model loaded into RAM at server startup.

### B. Express Backend API & Enrichment (`backend/src/controllers/diseaseController.js`)
- `POST /api/diseases/detect`: Forwards uploaded image to FastAPI, enriches prediction with `diseaseKnowledge.js` metadata, and conditionally persists concise detection records when `farmId` is provided.
- `GET /api/diseases/farm/:farmId`: Enforces farm ownership (`FarmModel.checkFarmOwnership`) returning HTTP 403 Forbidden for unauthorized access, orders records newest-first, and dynamically reconstructs Phase 3.3 structured `details`.

### C. Agronomic Knowledge Base (`backend/src/constants/diseaseKnowledge.js`)
- Evidence-based, conservative advice for all 12 classes referencing ICAR (CICR, IISR, CCRI), TNAU, PAU, JNKVV, and HAU extension literature.
- Contains: `description`, `symptoms`, `causes`, `recommendations`, `prevention`, `severity_level`, `advisory`, `sources`, and confidence-level assessments (`high` $\ge 80\%$, `moderate` $50\%-79\%$, `low` $< 50\%$).
- Healthy classes (0, 4, 8) receive non-prescriptive scouting advisories: *"No visible signs of the supported disease classes were detected in the submitted image."*

### D. PostgreSQL Persistence (`diseases` table)
- Persisted Fields: `farm_id`, `disease_name`, `severity_level`, `confidence_score`, `description`, `treatment_recommendation`, `created_at`.
- Image Storage Policy: `image_url` defaults to `NULL`. Zero image binaries stored on disk or in cloud storage.
- Standalone Predictions: Predictions without `farmId` succeed without database logging.

### E. User Interface (`frontend/src/pages/DiseaseDetection.jsx`)
- Built using React 18, Vite 5, and TailwindCSS.
- Features: Drag-and-drop & file picker upload, local image preview with auto object URL revocation, active farm context selector, loading spinner overlay, `PredictionCard`, `RecommendationCard`, and expandable `DiseaseHistory`.

---

## 5. Security & Safety Summary

- **File Validation**: Strict MIME type checking (JPEG, PNG, WebP) and 10 MB file size limit enforced in both Express and FastAPI layers.
- **Authorization**: `FarmModel.checkFarmOwnership` prevents unauthorized farmers from logging or viewing another farmer's disease history.
- **SQL Injection Prevention**: 100% parameterized SQL queries (`$1`, `$2`).
- **Data Privacy**: Uploaded leaf images are processed transiently in memory and never written to disk or cloud storage.

---

## 6. Known Limitations & Agricultural Disclaimer

1. **Domain Scope**: The model is trained and evaluated strictly for the 12 supported classes across Cotton, Soybean, and Orange crops. Leaves from other crop species or unmapped diseases cannot be classified.
2. **Minority Class Variation**: While overall test accuracy is 98.58%, minor classes with fewer training samples (e.g., Soybean Bacterial Pustule) exhibit slightly lower class F1 scores.
3. **Decision Support Only**: All predictions, descriptions, and management guidance serve as agricultural decision support tools and do not constitute guaranteed diagnostic certifications.
4. **Chemical Advice**: Chemical pesticide trade names, application rates, and schedules are omitted. Farmers should consult local agricultural extension officers and official product labels before chemical application.
5. **Farm Context Selection**: Manual farm ID input is supported as a fallback option for development and testing environments.

---

## 7. Major Completed Phases

- **Phase ML-0.1 to ML-0.3**: Data validation, leakage-free split creation, EfficientNetB0 training & fine-tuning.
- **Phase ML-0.4**: Unbiased evaluation on frozen test dataset (98.58% accuracy).
- **Phase ML-0.5**: Production packaging (`disease_model.keras`, SHA-256 verification).
- **Phase ML-0.6 & ML-0.7**: Production inference pipeline & FastAPI HTTP service implementation.
- **Phase 3.1 & 3.2**: Express backend integration & React frontend disease detection UI.
- **Phase 3.3**: Evidence-based recommendation enrichment & confidence guidance.
- **Phase 3.4**: PostgreSQL persistence & farm disease history retrieval.
- **Phase 3.5**: Dead-code cleanup, regression verification, UI layout alignment, and module freeze.
