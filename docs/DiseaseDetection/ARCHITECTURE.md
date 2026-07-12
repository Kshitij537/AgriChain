# Disease Detection Architecture

```mermaid
graph TD
    Frontend[Frontend - React] -->|POST /api/disease/detect| Backend[Backend - Node.js]
    Backend -->|POST /predict| ML[ML Service - FastAPI]
    ML -->|Loads Model| Model[CNN Model - disease_model.h5]
    ML -.->|Response| Backend
    Backend -.->|Response| Frontend
```

## Description
1. **Frontend**: Image selection, preview, custom hook `useDiseaseDetection` to coordinate API requests, separate components for rendering.
2. **Backend**: Express router and controller, upload middleware for image validation, and ML client service communicating with the FastAPI instance.
3. **ML Service**: FastAPI application utilizing TensorFlow/Keras to load `disease_model.h5`, preprocessing the incoming image, predicting classes, and mapping to severity levels and recommendations.
