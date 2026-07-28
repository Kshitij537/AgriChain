# Disease Detection Module Setup

This guide explains only the additional setup required to run the **Disease Detection Module V1**.

> **Prerequisite**
>
> Complete the general project setup described in the project's root `README.md` before following this guide.

---

# Module Overview

The Disease Detection module uses the following architecture:

```
React Frontend
      ↓
Express Backend
      ↓
FastAPI ML Service
      ↓
EfficientNetB0 Disease Classification Model
```

Supported Crops

- Cotton
- Soybean
- Orange

---

# Production Model

The production model is included in the repository at:

```
ml-service/models/disease_model.keras
```

No additional download is required.

Model Information

| Property | Value |
|----------|-------|
| Architecture | EfficientNetB0 |
| Version | 1.0.0 |
| Supported Classes | 12 |
| Input Size | 224×224 RGB |

(Optional) Verify the model integrity:

```powershell
Get-FileHash -Algorithm SHA256 ml-service/models/disease_model.keras
```

Expected SHA-256:

```
f531b46e4cd0903384eeec9e944e64913f3e94051498dc890612509dca34bb76
```

# ML Service Setup

Navigate to the ML service:

```bash
cd ml-service
```

Run to create a virtual environment (first time only):

```bash
python -m venv venv
```

Activate it:

```bash
venv\Scripts\activate
```

Install dependencies (first time only):

```bash
pip install -r requirements.txt
```

Start the ML service:

```bash
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000
```

Verify the service:

```
http://127.0.0.1:8000/health
```

---

# Running the Module

Once the project backend and frontend are running (see root README):

1. Start the ML Service.
2. Open:

```
http://localhost:5173/disease-detection
```

3. Upload a Cotton, Soybean, or Orange leaf image.
4. Click **Analyze Crop Leaf**.

Expected Result

- Disease prediction
- Confidence score
- Top-3 predictions
- Disease recommendations
- Prevention guidance
- (Optional) Farm history if a farm is selected

---

# Notes

- The training dataset is **not required** for inference.
- Only `disease_model.keras` is required.
- Images are **not stored**.
- Disease history is stored only when a valid farm is selected.

---

# Common Issues

| Issue | Solution |
|------|----------|
| `disease_model.keras` missing | Copy the production model into `ml-service/models/` |
| FastAPI not running | Start the ML service on port **8000** |
| Backend cannot connect to ML | Verify `ML_SERVICE_URL=http://localhost:8000` |
| Invalid image | Upload a JPEG, PNG, or WebP image under 10 MB |
