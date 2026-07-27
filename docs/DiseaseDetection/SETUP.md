# AgriChain Disease Detection V1 — Setup & Developer Guide

This guide details the complete setup, configuration, verification, and testing instructions for AgriChain's **Disease Detection Module V1**. It enables any developer to set up and test the production disease classification service on a fresh environment.

---

## 1. Overview & Architecture

AgriChain Disease Detection V1 uses a 5-tier microservice architecture:

```
React 18 / Vite 5 Frontend (Port 5173)
    ↓ POST /api/diseases/detect (Multipart field: image)
Express Backend API (Port 3000)
    ↓ POST /predict?top_k=3 (Multipart field: file)
FastAPI ML Service (Port 8000)
    ↓ In-memory tensor evaluation (224x224x3 RGB)
EfficientNetB0 (ml-service/models/disease_model.keras)
    ↓ Top-K prediction JSON
Express Backend API
    ↓ Dynamic agronomic enrichment (diseaseKnowledge.js)
    ↓ Persist detection record (PostgreSQL, if farmId supplied)
React 18 / Vite 5 Frontend
    ↓ Render PredictionCard, RecommendationCard, & DiseaseHistory
```

---

## 2. Prerequisites

Ensure your development machine has the following tools installed:

- **Git** (v2.30+)
- **Node.js** (v18.0+ or v20.0+) and **npm**
- **Python** (v3.10+ or v3.11+) and **pip**
- **PostgreSQL** (v14+ or v15+) with `agrichain_db` database
- **Operating System**: Windows 10/11, Linux, or macOS

---

## 3. Clone Repository

```bash
git clone https://github.com/Kshitij537/AgriChain.git
cd AgriChain
```

---

## 4. Production Model Setup (Crucial)

### Model Exclusion Rule
The trained production model binary `disease_model.keras` is **intentionally excluded from Git** via `.gitignore` (`*.keras`) to keep repository clone size minimal (~28 MB). 

### Obtaining the Model
You must obtain `disease_model.keras` separately from project storage and place it at the exact location below:

```text
ml-service/models/disease_model.keras
```

### Production Model Metadata

- **Model Name**: AgriChain Disease Detection
- **Version**: `1.0.0`
- **Architecture**: EfficientNetB0
- **Supported Classes**: 12
- **Input Resolution**: `224x224` RGB (`(224, 224, 3)`)
- **File Size**: ~33.90 MB (35,548,229 bytes)
- **Expected SHA-256 Hash**:
  ```text
  f531b46e4cd0903384eeec9e944e64913f3e94051498dc890612509dca34bb76
  ```

### Verifying SHA-256 Hash on Windows

PowerShell:
```powershell
Get-FileHash -Algorithm SHA256 ml-service/models/disease_model.keras
```

Command Prompt:
```cmd
certutil -hashfile ml-service\models\disease_model.keras SHA256
```

*Note*: `model_metadata.json` and `MODEL_VERSION.md` are tracked documentation files and do **not** replace the actual `.keras` model binary.

---

## 5. Dataset Requirement

### Training Dataset NOT Required for Running Inference
The training dataset is **NOT required** to run disease detection or execute predictions. 

The large dataset directories:
- `dataset/raw/` (~10.2 GB)
- `dataset/processed/` (~1.95 GB)
- `ml-service/models/checkpoints/`

are excluded from Git and are **NOT required** for inference or running the application. For standard inference, only `disease_model.keras` is required.

---

## 6. Service Setup Instructions

### Service Startup Order
To run the full stack, launch services in the following order:

```text
Terminal 1: FastAPI ML Microservice (Port 8000)
Terminal 2: Express Backend API      (Port 3000)
Terminal 3: React Frontend           (Port 5173)
```

---

### Step A: ML Service Setup (FastAPI)

1. Open **Terminal 1** and navigate to `ml-service`:
   ```cmd
   cd ml-service
   ```

2. Create and activate a Python virtual environment:
   ```cmd
   python -m venv venv
   venv\Scripts\activate
   ```

3. Install required Python packages:
   ```cmd
   pip install -r requirements.txt
   ```

4. Start the FastAPI Uvicorn server:
   ```cmd
   python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
   ```

5. Verify ML Service:
   - Base URL: `http://127.0.0.1:8000`
   - Interactive Swagger API Docs: `http://127.0.0.1:8000/docs`
   - Health Check: `http://127.0.0.1:8000/health`

---

### Step B: Backend Setup (Express Node.js)

1. Open **Terminal 2** and navigate to `backend`:
   ```cmd
   cd backend
   ```

2. Install Node.js dependencies:
   ```cmd
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env`:
   ```cmd
   copy .env.example .env
   ```

   Ensure `.env` contains:
   ```env
   PORT=3000
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=postgres
   DB_NAME=agrichain_db
   JWT_SECRET=your_jwt_secret
   ML_SERVICE_URL=http://localhost:8000
   ML_SERVICE_TIMEOUT=10000
   ```

4. Start Express server:
   ```cmd
   npm run dev
   ```

5. Verify Backend:
   - URL: `http://localhost:3000`
   - Disease Health Check: `http://localhost:3000/api/diseases/health`
   - Detection Endpoint: `POST http://localhost:3000/api/diseases/detect?top_k=3` (field: `image`)

---

### Step C: Database Setup (PostgreSQL)

1. Ensure PostgreSQL service is running on `localhost:5432`.
2. Create database `agrichain_db`:
   ```sql
   CREATE DATABASE agrichain_db;
   ```
3. Initialize database tables using schemas in `database/schemas/`:
   ```cmd
   psql -U postgres -d agrichain_db -f database/schemas/users.sql
   psql -U postgres -d agrichain_db -f database/schemas/farms.sql
   psql -U postgres -d agrichain_db -f database/schemas/disease.sql
   ```

#### Standalone vs Farm-Linked Detection
- **Standalone Detection**: Does not require selecting a farm and works even without PostgreSQL database persistence.
- **Farm-Linked Detection & History**: Requires PostgreSQL connection, an authenticated user, and a valid `farmId` owned by that user.

---

### Step D: Frontend Setup (React 18 + Vite)

1. Open **Terminal 3** and navigate to `frontend`:
   ```cmd
   cd frontend
   ```

2. Install Node.js dependencies:
   ```cmd
   npm install
   ```

3. Configure environment variables:
   Copy `.env.example` to `.env`:
   ```cmd
   copy .env.example .env
   ```
   Ensure `.env` contains:
   ```env
   VITE_API_URL=http://localhost:3000
   ```

4. Start Vite development server:
   ```cmd
   npm run dev
   ```

5. Open browser:
   - Application URL: `http://localhost:5173`
   - Disease Detection Module: `http://localhost:5173/disease-detection`

---

## 7. Manual Browser Testing

1. Open `http://localhost:5173/disease-detection`.
2. Click or drag-and-drop any Cotton, Soybean, or Orange leaf image (JPEG, PNG, or WebP up to 10 MB).
3. Click **Analyze Crop Leaf**.
4. Verify the rendered results:
   - **Primary Prediction**: Crop, Disease Name, Healthy/Diseased badge, Confidence %.
   - **Top 3 Predictions List**: Secondary probability distribution.
   - **Model Version**: `1.0.0` tag.
   - **Disease Overview**: Explanation of identified condition.
   - **Symptoms & Causes**: Visible symptoms and environmental drivers.
   - **Management Actions & Prevention**: Safe cultural management guidance.
   - **Confidence Advisory Banner**: Rendered if confidence score $< 80\%$.
   - **Extension Sources**: Citations (ICAR, TNAU, PAU, CCRI).

---

## 8. Optional Farm Detection History Test

1. In `http://localhost:5173/disease-detection`, select an active farm from the **Active Farm Context** header dropdown (or enter a valid Farm ID).
2. Upload a leaf image and click **Analyze Crop Leaf**.
3. Upon prediction completion:
   - A concise detection record (`farm_id`, `disease_name`, `confidence_score`, `severity_level`) is persisted to PostgreSQL.
   - The leaf image itself is **NOT stored**.
   - The **Farm Detection History** table automatically refreshes to display the new entry.
   - Clicking **View Advisory Details** expands the historical record's enriched guidance.

---

## 9. API Testing via Postman or cURL

### A. FastAPI Microservice (Direct Test)
- **Health Check**:
  ```bash
  curl http://127.0.0.1:8000/health
  ```
- **Model Info**:
  ```bash
  curl http://127.0.0.1:8000/model-info
  ```
- **Prediction Request**:
  *Note*: FastAPI expects form-data field named **`file`**.
  ```bash
  curl -X POST "http://127.0.0.1:8000/predict?top_k=3" \
    -F "file=@/path/to/leaf_image.jpg"
  ```

### B. Express Backend API (Integration Test)
- **Disease Detection**:
  *Note*: Express backend expects form-data field named **`image`**.
  ```bash
  curl -X POST "http://localhost:3000/api/diseases/detect?top_k=3" \
    -F "image=@/path/to/leaf_image.jpg" \
    -F "farmId=1"
  ```
- **Fetch Farm Disease History**:
  ```bash
  curl http://localhost:3000/api/diseases/farm/1
  ```

---

## 10. Model Scope & Supported Classes

AgriChain V1 supports **12 frozen classes** across 3 crops:

### 🌿 Cotton
- `Cotton Healthy`
- `Cotton Bacterial Blight`
- `Cotton Alternaria Leaf Spot`
- `Cotton Leaf Curl Virus`

### 🌱 Soybean
- `Soybean Healthy`
- `Soybean Rust`
- `Soybean Bacterial Pustule`
- `Soybean Brown Spot`

### 🍊 Orange
- `Orange Healthy`
- `Orange Citrus Canker`
- `Orange Black Spot`
- `Orange Greening`

*Disclaimer*: Predictions outside these 12 classes are not supported. All model outputs and management practices serve as decision-support guidance and do not replace official agricultural extension officer diagnoses.

---

## 11. Automated Verification Scripts

The codebase includes automated test scripts to verify system health:

- **Full Stack End-to-End Test**:
  ```cmd
  cd frontend
  node src/verify_phase_3_4_frontend.cjs
  ```
- **Backend & Database Test**:
  ```cmd
  cd backend
  node src/verify_phase_3_4.js
  ```
- **Frontend Production Build**:
  ```cmd
  cd frontend
  npm run build
  ```

---

## 12. Troubleshooting & Common Errors

| Error | Cause | Resolution |
|---|---|---|
| `FileNotFoundError: disease_model.keras` | Model binary missing | Obtain `disease_model.keras` and place it in `ml-service/models/`. |
| `SHA256 Mismatch` | Model file corrupted or wrong file | Re-download `disease_model.keras` and verify SHA hash matching `f531b46e...`. |
| `HTTP 503 ML_SERVICE_UNAVAILABLE` | FastAPI service offline | Start FastAPI server on `http://127.0.0.1:8000` (Terminal 1). |
| `HTTP 504 ML_SERVICE_TIMEOUT` | FastAPI server hung or slow CPU | Check FastAPI logs in Terminal 1. Restart FastAPI server. |
| `HTTP 400 INVALID_IMAGE` | Unreadable or corrupted image | Upload a valid, uncorrupted JPEG, PNG, or WebP leaf image. |
| `HTTP 413 FILE_TOO_LARGE` | File size exceeds 10 MB | Compress image or select an image under 10 MB. |
| `HTTP 415 UNSUPPORTED_MEDIA_TYPE` | Unsupported file extension | Upload only `.jpg`, `.jpeg`, `.png`, or `.webp` files. |
| `HTTP 403 FARM_ACCESS_DENIED` | User does not own requested farm | Ensure authenticated user matches farm `user_id`. |
| `EADDRINUSE: 3000 / 8000` | Port already occupied | Kill process occupying port using `npx kill-port 3000 8000`. |
| `ECONNREFUSED 5432` | PostgreSQL service stopped | Start PostgreSQL service on `localhost:5432`. |

---

## 13. Quick Start Checklist

- [ ] Repository cloned (`git clone ...`)
- [ ] `disease_model.keras` obtained and placed in `ml-service/models/`
- [ ] SHA-256 hash verified (`f531b46e4cd0903384eeec9e944e64913f3e94051498dc890612509dca34bb76`)
- [ ] Python virtual environment created & `pip install -r requirements.txt` executed
- [ ] FastAPI running on `http://127.0.0.1:8000` (Terminal 1)
- [ ] Backend `.env` configured & `npm run dev` running on `http://localhost:3000` (Terminal 2)
- [ ] Frontend `.env` configured & `npm run dev` running on `http://localhost:5173` (Terminal 3)
- [ ] `http://127.0.0.1:8000/health` returns `healthy`
- [ ] Browser prediction succeeds at `http://localhost:5173/disease-detection`
