import os
import sys
import threading
from pathlib import Path
import numpy as np
import tensorflow as tf
from tensorflow import keras

# Ensure package imports work
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from labels import get_class_metadata, CLASS_METADATA
from preprocess import preprocess_image, InvalidImageError, UnsupportedImageError

# Path resolution relative to repository structure
DEFAULT_MODEL_PATH = (CURRENT_DIR.parent / "models" / "disease_model.keras").resolve()

# Thread-safe model cache singleton
_MODEL_CACHE = None
_MODEL_LOCK = threading.Lock()
_LOAD_COUNT = 0

class InferenceError(RuntimeError):
    """Raised when model inference or output numerical validation fails."""
    pass

def get_model(model_path: str = None) -> keras.Model:
    """Retrieve or load the cached production Keras model singleton."""
    global _MODEL_CACHE, _LOAD_COUNT
    target_path = Path(model_path).resolve() if model_path else DEFAULT_MODEL_PATH

    if _MODEL_CACHE is None:
        with _MODEL_LOCK:
            if _MODEL_CACHE is None:
                if not target_path.exists():
                    raise FileNotFoundError(f"Production model artifact not found at: {target_path}")
                print(f"[Model Loader] Loading production model from: {target_path}")
                _MODEL_CACHE = keras.models.load_model(target_path)
                _LOAD_COUNT += 1
                print(f"[Model Loader] Production model loaded successfully (Total Load Count: {_LOAD_COUNT})")
    return _MODEL_CACHE

def get_load_count() -> int:
    """Return total number of times the model artifact was loaded from disk."""
    return _LOAD_COUNT

def warmup_model(model_path: str = None) -> bool:
    """Perform a dummy forward pass to prime TensorFlow execution graphs."""
    model = get_model(model_path)
    dummy_input = np.zeros((1, 224, 224, 3), dtype=np.float32)
    _ = model(dummy_input, training=False)
    return True

def predict_disease(image_bytes: bytes, top_k: int = 3, model_path: str = None) -> dict:
    """
    Perform disease prediction on raw image bytes.

    Parameters:
    - image_bytes: raw bytes of input image
    - top_k: number of top predictions to return (1 <= top_k <= 12)
    - model_path: optional custom model path

    Returns:
    - Structured dictionary containing top prediction metadata, confidence, and top-K list.
    """
    if not (1 <= top_k <= 12):
        raise ValueError(f"Invalid top_k: {top_k}. Must be an integer between 1 and 12.")

    # 1. Preprocess raw image bytes -> (1, 224, 224, 3) float32 tensor
    tensor = preprocess_image(image_bytes)

    # 2. Retrieve cached model instance
    model = get_model(model_path)

    # 3. Execute inference (training=False)
    preds = model(tensor, training=False).numpy()  # Shape: (1, 12)

    # 4. Numerical validation of predictions
    if preds.shape != (1, 12):
        raise InferenceError(f"Model output shape violation: {preds.shape}. Expected (1, 12).")

    if np.isnan(preds).any() or np.isinf(preds).any():
        raise InferenceError("Model returned NaN or Inf probability values!")

    probs = preds[0]  # Shape: (12,)
    prob_sum = float(np.sum(probs))
    if not (0.99 <= prob_sum <= 1.01):
        raise InferenceError(f"Softmax probability sum violation: {prob_sum:.6f}. Expected ~1.0.")

    # 5. Extract top-1 and top-K predictions
    top_indices = np.argsort(probs)[::-1]  # Sort descending

    top1_index = int(top_indices[0])
    top1_meta = get_class_metadata(top1_index)
    top1_confidence = float(probs[top1_index])

    top_predictions = []
    for idx in top_indices[:top_k]:
        c_idx = int(idx)
        meta = get_class_metadata(c_idx)
        meta["confidence"] = float(probs[c_idx])
        top_predictions.append(meta)

    # 6. Build final structured response
    result = {
        "class_index": top1_index,
        "crop": top1_meta["crop"],
        "disease": top1_meta["disease"],
        "display_name": top1_meta["display_name"],
        "is_healthy": top1_meta["is_healthy"],
        "confidence": top1_confidence,
        "top_predictions": top_predictions
    }

    return result
