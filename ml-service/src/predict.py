import sys
import threading
from pathlib import Path
from typing import Any
import numpy as np

# ── Out-of-Distribution (OOD) thresholds ─────────────────────────────────────
# If top-1 confidence is below this, the image is likely not a crop leaf.
OOD_CONFIDENCE_THRESHOLD = 0.55
# Normalised entropy ceiling: 1.0 = fully uniform (maximum confusion).
# If entropy_ratio > this, the model has no strong opinion → likely OOD.
OOD_ENTROPY_THRESHOLD = 0.70

# Ensure package imports work
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.append(str(CURRENT_DIR))

from labels import get_class_metadata, CLASS_METADATA
from preprocess import preprocess_image, InvalidImageError, UnsupportedImageError

# Path resolution relative to repository structure
DEFAULT_MODEL_PATH = (CURRENT_DIR.parent / "models" / "disease_model.keras").resolve()
SUPPORTED_TENSORFLOW_PYTHONS = {(3, 11), (3, 12)}

# Thread-safe model cache singleton
_MODEL_CACHE = None
_MODEL_LOCK = threading.Lock()
_LOAD_COUNT = 0

class InferenceError(RuntimeError):
    """Raised when model inference or output numerical validation fails."""
    pass

def is_supported_tensorflow_runtime() -> bool:
    """Return whether the current Python runtime is known to work with the bundled TensorFlow wheel."""
    return sys.version_info[:2] in SUPPORTED_TENSORFLOW_PYTHONS

def get_runtime_support_message() -> str:
    """Describe the current runtime compatibility status for TensorFlow-backed inference."""
    current_version = f"{sys.version_info.major}.{sys.version_info.minor}"
    if is_supported_tensorflow_runtime():
        return f"Python {current_version} is supported for TensorFlow-backed inference."
    return (
        f"TensorFlow-backed inference is not supported on Python {current_version}. "
        "Use Python 3.11 or 3.12 for the ml-service virtual environment."
    )

def get_model(model_path: str = None) -> Any:
    """Retrieve or load the cached production Keras model singleton."""
    global _MODEL_CACHE, _LOAD_COUNT
    target_path = Path(model_path).resolve() if model_path else DEFAULT_MODEL_PATH

    if not is_supported_tensorflow_runtime():
        raise InferenceError(get_runtime_support_message())

    if _MODEL_CACHE is None:
        with _MODEL_LOCK:
            if _MODEL_CACHE is None:
                if not target_path.exists():
                    raise InferenceError(f"Production model artifact not found at: {target_path}")
                print(f"[Model Loader] Loading production model from: {target_path}")
                from tensorflow import keras

                # compile=False: we only need weights for inference, not optimizer/loss.
                # This also allows loading models trained with custom losses (e.g. Focal Loss)
                # without requiring custom_objects to be passed.
                _MODEL_CACHE = keras.models.load_model(target_path, compile=False)
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

    # 6. Out-of-distribution (OOD) reliability check
    #    a) Confidence gate: top-1 score too low → model is guessing
    low_confidence = top1_confidence < OOD_CONFIDENCE_THRESHOLD

    #    b) Entropy gate: H(p) / H_max where H_max = log(12) for 12 classes
    #       High entropy → probability mass spread evenly → model confused
    eps = 1e-9  # numerical stability
    entropy = -float(np.sum(probs * np.log(probs + eps)))
    max_entropy = float(np.log(len(probs)))  # log(12) ≈ 2.485
    entropy_ratio = entropy / max_entropy if max_entropy > 0 else 0.0
    high_entropy = entropy_ratio > OOD_ENTROPY_THRESHOLD

    is_reliable = not (low_confidence or high_entropy)

    warning_parts = []
    if low_confidence:
        warning_parts.append(
            f"Low confidence ({top1_confidence * 100:.1f}% < {OOD_CONFIDENCE_THRESHOLD * 100:.0f}%)"
        )
    if high_entropy:
        warning_parts.append(
            f"High prediction entropy ({entropy_ratio * 100:.1f}% of max)"
        )
    low_confidence_warning = (
        "This image may not be a crop leaf. " + "; ".join(warning_parts) + ". "
        "Please upload a clear, close-up photo of a single crop leaf for accurate results."
        if warning_parts else None
    )

    # 7. Limited training data advisory for known weak classes
    #    These classes have insufficient training samples and documented low F1 scores.
    #    Class 5 (Soybean Rust): 123 train samples, F1=80.7%
    #    Class 6 (Soybean Bacterial Pustule): 78 train samples, F1=64.3%
    #    Class 7 (Soybean Brown Spot): 57 train samples (very small test set)
    LIMITED_DATA_CLASSES = {
        5: ("Soybean Rust", "80.7%"),
        6: ("Soybean Bacterial Pustule", "64.3%"),
        7: ("Soybean Brown Spot", "100% on only 12 test samples — unreliable benchmark"),
    }
    limited_data_warning = None
    if top1_index in LIMITED_DATA_CLASSES:
        cls_name, f1 = LIMITED_DATA_CLASSES[top1_index]
        limited_data_warning = (
            f"{cls_name} has limited training data (F1 score: {f1}). "
            "This prediction may be less reliable. "
            "Consult an agronomist or upload a clearer, zoomed-in leaf photo."
        )

    # 8. Build final structured response
    result = {
        "class_index": top1_index,
        "crop": top1_meta["crop"],
        "disease": top1_meta["disease"],
        "display_name": top1_meta["display_name"],
        "is_healthy": top1_meta["is_healthy"],
        "confidence": top1_confidence,
        "top_predictions": top_predictions,
        "is_reliable": is_reliable,
        "low_confidence_warning": low_confidence_warning,
        "limited_data_warning": limited_data_warning,
    }

    return result
