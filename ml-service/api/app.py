import os
import sys
import json
from pathlib import Path
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, UploadFile, File, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure ml-service/src modules are resolvable
API_DIR = Path(__file__).resolve().parent
SRC_DIR = API_DIR.parent / "src"
MODELS_DIR = API_DIR.parent / "models"

if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

from labels import CLASS_NAMES
from preprocess import preprocess_image, InvalidImageError, UnsupportedImageError
from predict import predict_disease, warmup_model, InferenceError, get_model

MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB limit

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Application startup: prime TensorFlow graph & cache model singleton
    try:
        warmup_model()
        print("[FastAPI Startup] Production disease model primed and cached successfully.")
    except Exception as e:
        print(f"[FastAPI Startup Warning] Model warmup encountered error: {e}")
    yield

app = FastAPI(
    title="AgriChain Disease Detection API",
    version="1.0.0",
    description="CNN-based crop disease classification service for Cotton, Soybean, and Orange.",
    lifespan=lifespan
)

# Configure CORS safely for local development and application frontend
allowed_origins_env = os.getenv("CORS_ORIGINS")
if allowed_origins_env:
    origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]
else:
    origins = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# Pydantic Response Schemas
class PredictionItem(BaseModel):
    class_index: int = Field(..., description="Class index (0..11)")
    crop: str = Field(..., description="Crop type (Cotton, Soybean, Orange)")
    disease: str = Field(..., description="Disease name")
    display_name: str = Field(..., description="Full class display name")
    is_healthy: bool = Field(..., description="True if healthy crop")
    confidence: float = Field(..., description="Softmax probability score (0.0 to 1.0)")

class PredictionResponse(BaseModel):
    success: bool = True
    prediction: PredictionItem
    top_predictions: List[PredictionItem]
    model_version: str = "1.0.0"

class HealthResponse(BaseModel):
    status: str = "healthy"
    service: str = "AgriChain Disease Detection"
    version: str = "1.0.0"
    model_loaded: bool = True

class ModelInfoResponse(BaseModel):
    model_name: str
    model_version: str
    architecture: str
    input_size: str
    classes: int
    supported_crops: List[str]
    test_accuracy: float
    macro_f1: float
    weighted_f1: float

# Endpoints
@app.get("/health", response_model=HealthResponse, tags=["Status"])
async def health_check():
    """Check service operational status and model readiness."""
    is_loaded = get_model() is not None
    return HealthResponse(
        status="healthy" if is_loaded else "degraded",
        service="AgriChain Disease Detection",
        version="1.0.0",
        model_loaded=is_loaded
    )

@app.get("/model-info", response_model=ModelInfoResponse, tags=["Metadata"])
async def model_info():
    """Retrieve public production model metadata and performance benchmarks."""
    metadata_path = MODELS_DIR / "model_metadata.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model metadata not found.")
    
    try:
        with open(metadata_path, "r", encoding="utf-8") as f:
            meta = json.load(f)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to read model metadata: {e}")

    return ModelInfoResponse(
        model_name=meta.get("model_name", "AgriChain Disease Detection"),
        model_version=meta.get("model_version", "1.0.0"),
        architecture=meta.get("architecture", "EfficientNetB0"),
        input_size=f"{meta.get('input_width', 224)}x{meta.get('input_height', 224)}x{meta.get('channels', 3)}",
        classes=meta.get("number_of_classes", 12),
        supported_crops=["Cotton", "Soybean", "Orange"],
        test_accuracy=meta.get("test_accuracy", 0.9858),
        macro_f1=meta.get("macro_f1", 0.9365),
        weighted_f1=meta.get("weighted_f1", 0.9858)
    )

@app.post("/predict", response_model=PredictionResponse, tags=["Inference"])
async def predict_disease_endpoint(
    file: UploadFile = File(..., description="Uploaded leaf image file (JPEG, PNG, WebP)"),
    top_k: int = Query(default=3, ge=1, le=12, description="Number of top predictions to return (1..12)")
):
    """
    Classify uploaded crop leaf image into 12 disease classes across Cotton, Soybean, and Orange.
    """
    # 1. Read payload bytes into memory
    try:
        image_bytes = await file.read()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Failed to read upload payload: {str(e)}")

    # 2. Size limit check (10 MB)
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Uploaded file size exceeds maximum 10 MB limit.")

    # 3. Empty file check
    if len(image_bytes) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Uploaded image is empty.")

    # 4. Optional MIME type verification boundary
    allowed_mimes = ["image/jpeg", "image/png", "image/webp", "image/jpg", "application/octet-stream"]
    if file.content_type and file.content_type.lower() not in allowed_mimes:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported media type '{file.content_type}'. Accepted formats: JPEG, PNG, WebP."
        )

    # 5. Execute production inference pipeline
    try:
        res_dict = predict_disease(image_bytes, top_k=top_k)
    except InvalidImageError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except UnsupportedImageError as e:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail=str(e))
    except InferenceError as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Inference pipeline failure: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An unexpected error occurred during prediction.")

    # 6. Format response
    top_items = [PredictionItem(**item) for item in res_dict["top_predictions"]]
    pred_item = PredictionItem(
        class_index=res_dict["class_index"],
        crop=res_dict["crop"],
        disease=res_dict["disease"],
        display_name=res_dict["display_name"],
        is_healthy=res_dict["is_healthy"],
        confidence=res_dict["confidence"]
    )

    return PredictionResponse(
        success=True,
        prediction=pred_item,
        top_predictions=top_items,
        model_version="1.0.0"
    )
