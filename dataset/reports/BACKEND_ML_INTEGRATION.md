# Backend <-> ML Disease Service Integration Report (Phase 3.1)

This report documents the integration of AgriChain's Express backend with the FastAPI ML disease detection microservice.

## 1. Environment & Network Flow

- **Frontend -> Express Backend**: `POST /api/diseases/detect` (field: `image`)
- **Express Backend -> FastAPI ML Service**: `POST {ML_SERVICE_URL}/predict?top_k=3` (field: `file`)
- **FastAPI ML Service**: `http://127.0.0.1:8000`
- **Development Timeout**: `10,000 ms` (10 seconds)
- **Upload Memory Handling**: `multer.memoryStorage()` (`0` disk files persisted)

## 2. API Response Contract Example

```json
{
  "success": true,
  "data": {
    "prediction": {
      "class_index": 9,
      "crop": "Orange",
      "disease": "Citrus Canker",
      "display_name": "Orange Citrus Canker",
      "is_healthy": false,
      "confidence": 0.9876
    },
    "top_predictions": [
      {
        "class_index": 9,
        "crop": "Orange",
        "disease": "Citrus Canker",
        "display_name": "Orange Citrus Canker",
        "is_healthy": false,
        "confidence": 0.9876
      }
    ],
    "model_version": "1.0.0"
  }
}
```

## 3. Error Code Mapping Matrix

| Scenario | FastAPI Code | Express Status Code | Response Code |
| :--- | :---: | :---: | :--- |
| Missing Image File | — | **HTTP 400** | `IMAGE_REQUIRED` |
| Invalid File Type / Corrupted | HTTP 400 / 415 | **HTTP 400 / 415** | `INVALID_IMAGE` / `INVALID_FILE_TYPE` |
| Payload Exceeds 10 MB | HTTP 413 | **HTTP 413** | `FILE_TOO_LARGE` |
| FastAPI Service Offline | ECONNREFUSED | **HTTP 503** | `ML_SERVICE_UNAVAILABLE` |
| FastAPI Service Timeout | ECONNABORTED | **HTTP 504** | `ML_SERVICE_TIMEOUT` |

## 4. Verification Summary

- [x] Express backend endpoint `POST /api/diseases/detect` operational
- [x] Multipart field forwarding (`image` -> `file`) verified
- [x] Real-image tests passed for Cotton, Soybean, and Orange crops
- [x] Memory storage verified (0 uploaded image files written to disk)
- [x] Error handling & HTTP status mappings verified
