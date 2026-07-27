# FastAPI Disease Prediction Integration Report (Phase ML-0.7)

This report documents the verification and performance of AgriChain's FastAPI Disease Detection HTTP API.

## 1. Application Specification

- **Framework**: `FastAPI` (Uvicorn ASGI Server)
- **API Version**: `1.0.0`
- **Model Artifact**: `ml-service/models/disease_model.keras`
- **SHA-256 Checksum**: `f531b46e4cd0903384eeec9e944e64913f3e94051498dc890612509dca34bb76`
- **Supported Image Upload Formats**: `JPEG`, `PNG`, `WebP`
- **Maximum Upload Limit**: `10 MB` (`HTTP 413 Payload Too Large`)
- **Memory Processing**: In-memory byte array processing (`0` disk files persisted)

## 2. API Endpoints

### `GET /health`
Lightweight health check endpoint returning service operational state and model readiness.

### `GET /model-info`
Exposes public model metadata, architecture details, supported crops, and benchmark test metrics (`98.58%` accuracy, `93.65%` Macro F1).

### `POST /predict?top_k=3`
Multipart image classification endpoint accepting `file` form upload and optional `top_k` query parameter (1..12).

## 3. Response Contract Example

```json
{
  "success": true,
  "prediction": {
    "class_index": 9,
    "crop": "Orange",
    "disease": "Citrus Canker",
    "display_name": "Orange Citrus Canker",
    "is_healthy": false,
    "confidence": 0.9876
  },
  "top_predictions": [
    {"class_index": 9, "crop": "Orange", "disease": "Citrus Canker", "display_name": "Orange Citrus Canker", "is_healthy": false, "confidence": 0.9876},
    {"class_index": 8, "crop": "Orange", "disease": "Healthy", "display_name": "Orange Healthy", "is_healthy": true, "confidence": 0.0102},
    {"class_index": 10, "crop": "Orange", "disease": "Black Spot", "display_name": "Orange Black Spot", "is_healthy": false, "confidence": 0.0021}
  ],
  "model_version": "1.0.0"
}
```

## 4. Benchmark Performance & Latency

- **Cold API Latency**: `660.10 ms`
- **Warm API Latency Average**: `636.90 ms` (across 5 warm requests)
- **Model Cache Singleton**: Confirmed (Loaded once, reused across all requests)

## 5. Postman & Curl Manual Test Instructions

```bash
# Start Uvicorn Server
python -m uvicorn api.app:app --host 127.0.0.1 --port 8000 --reload

# GET Health Check
curl http://127.0.0.1:8000/health

# POST Prediction Request
curl -X POST "http://127.0.0.1:8000/predict?top_k=3" -F "file=@path/to/leaf_image.jpg"
```

