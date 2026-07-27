# Disease Detection API Contracts & Integration Freeze

This document details the request/response models, validation rules, integration contracts, and error handling matrix for the Disease Detection module.

---

## 1. Node.js Backend API Endpoints

### 1.1 POST `/api/disease/detect`
Performs crop image uploads and returns real-time prediction, severity, and recommendations.

- **Content-Type**: `multipart/form-data`
- **Headers**:
  - `Authorization: Bearer <JWT_TOKEN>`
- **Request Body Fields**:
  - `image` (File, Required): JPG, JPEG, or PNG image of a crop leaf. Max size: 10MB.
  - `farmId` (Integer, Required): Target farm identifier.

#### Successful Response (200 OK)
```json
{
  "success": true,
  "data": {
    "id": 14,
    "farmId": 2,
    "disease": "Tomato Early Blight",
    "confidence": 92.5,
    "severity": "Medium",
    "recommendations": {
      "treatment": "Remove infected leaves immediately to prevent fungal spread.",
      "medicine": "Apply copper-based fungicides if blight spreads to upper canopy.",
      "prevention": "Perform crop rotation, avoid overhead watering, and ensure adequate spacing.",
      "notes": "Early Blight thrives in warm, humid conditions."
    },
    "detectedDate": "2026-07-18T14:15:30.000Z",
    "createdAt": "2026-07-18T14:15:30.000Z"
  }
}
```

---

### 1.2 GET `/api/disease/farm/:farmId`
Retrieves chronological prediction history for a specific farm.

- **Headers**:
  - `Authorization: Bearer <JWT_TOKEN>`
- **URL Parameters**:
  - `farmId` (Integer, Required)

#### Successful Response (200 OK)
```json
{
  "success": true,
  "data": {
    "count": 1,
    "history": [
      {
        "id": 14,
        "disease": "Tomato Early Blight",
        "confidence": 92.5,
        "severity": "Medium",
        "detectedDate": "2026-07-18T14:15:30.000Z",
        "createdAt": "2026-07-18T14:15:30.000Z"
      }
    ]
  }
}
```

---

## 2. ML Service (FastAPI) API Contract

### 2.1 POST `/predict`
Low-level inference endpoint invoked internally by the Node.js backend.

- **Content-Type**: `multipart/form-data`
- **Request Body Fields**:
  - `file` (File, Required): Raw image binary stream.

#### Successful Response (200 OK)
```json
{
  "class": "Tomato Early Blight",
  "confidence": 0.925
}
```

---

## 3. Validation Rules

### 3.1 Backend Express Layer Validation
- **`farmId`**:
  - Must exist in the request body.
  - Must be a positive integer.
  - The authenticated user must own this `farmId` (verified via query checks against the `farms` table).
- **`image`**:
  - Must exist in the request multipart fields.
  - Supported MIME-types: `image/jpeg`, `image/jpg`, `image/png`.
  - Max file size: `10485760` bytes (10MB).
  - Malformed or empty files must be rejected before calling the ML service.

---

## 4. Error Handling Matrix

| Error Scenario | HTTP Status | Error Code | Example Response Payload | Remediation / Action |
| :--- | :--- | :--- | :--- | :--- |
| **Missing Authentication** | `401 Unauthorized` | `AUTH_MISSING` | `{"success": false, "error": "Access token is required"}` | Redirect user to login screen. |
| **Invalid/Expired Token** | `403 Forbidden` | `AUTH_INVALID` | `{"success": false, "error": "Token is invalid or expired"}` | Clear credentials and redirect to login. |
| **Unauthorized Farm ID** | `403 Forbidden` | `FARM_UNAUTHORIZED` | `{"success": false, "error": "You do not own this farm"}` | Block request. Verify current farm context. |
| **Invalid Farm ID Format**| `400 Bad Request` | `INVALID_FARM_ID` | `{"success": false, "error": "Farm ID must be a positive integer"}` | Prompt selection of a valid farm. |
| **Missing Image File** | `400 Bad Request` | `MISSING_FILE` | `{"success": false, "error": "Image file is required"}` | Force image upload before submitting form. |
| **File Type Unsupported**| `400 Bad Request` | `UNSUPPORTED_TYPE` | `{"success": false, "error": "Only JPEG, JPG, and PNG images are supported"}` | Prompt user to upload correct format. |
| **File Too Large** | `400 Bad Request` | `LIMIT_FILE_SIZE` | `{"success": false, "error": "File size exceeds limit of 10MB"}` | Warn user to resize/compress image. |
| **ML Service Offline** | `502 Bad Gateway` | `ML_UNAVAILABLE` | `{"success": false, "error": "Disease detection engine is temporarily offline"}` | Render error UI with a retry prompt. |
| **ML Prediction Failed** | `500 Internal Server Error`| `ML_ERROR` | `{"success": false, "error": "Inference computation failed"}` | Log internal failure details; show fallback error. |
| **Database Save Failure** | `500 Internal Server Error`| `DB_WRITE_ERROR` | `{"success": false, "error": "Failed to persist detection details"}` | Rollback transactions; render fallback card. |
