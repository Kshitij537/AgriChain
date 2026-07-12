# Disease Detection API Contracts

## Backend API

### Detect Disease from Image
- **Endpoint**: `POST /api/disease/detect`
- **Content-Type**: `multipart/form-data`
- **Request Body**:
  - `image`: File (PNG, JPG, GIF)
  - `farmId`: String (associated farm ID)
- **Response**:
  ```json
  {
    "success": true,
    "disease": "Tomato Early Blight",
    "confidence": 92.5,
    "severity": "Medium",
    "recommendations": {
      "treatment": "Remove infected leaves.",
      "medicine": "Fungicide",
      "prevention": "Crop rotation"
    }
  }
  ```

### Get Disease Detection History by Farm
- **Endpoint**: `GET /api/disease/farm/:farmId`
- **Response**:
  ```json
  [
    {
      "id": "pred_123",
      "disease": "Tomato Early Blight",
      "confidence": 92.5,
      "severity": "Medium",
      "createdAt": "2026-07-12T15:20:00Z"
    }
  ]
  ```

## ML Service (FastAPI) API

### Predict Disease
- **Endpoint**: `POST /predict`
- **Content-Type**: `multipart/form-data`
- **Request Body**:
  - `file`: File
- **Response**:
  ```json
  {
    "class": "Tomato Early Blight",
    "confidence": 0.925
  }
  ```
