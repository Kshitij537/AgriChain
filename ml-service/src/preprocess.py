import io
import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

class InvalidImageError(ValueError):
    """Raised when image bytes are empty, corrupted, or undecodable."""
    pass

class UnsupportedImageError(ValueError):
    """Raised when image mode or format cannot be converted to RGB."""
    pass

def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    Preprocess raw image bytes into an EfficientNetB0-compatible input tensor.

    Contract:
    - Input: raw bytes
    - Output shape: (1, 224, 224, 3)
    - Output dtype: np.float32
    - Output pixel range: [0.0, 255.0]
    - EXIF orientation corrected
    - RGB 3-channel explicitly
    """
    if not image_bytes or not isinstance(image_bytes, bytes) or len(image_bytes) == 0:
        raise InvalidImageError("Empty or invalid image byte input provided.")

    try:
        img_buffer = io.BytesIO(image_bytes)
        img = Image.open(img_buffer)
        img.load()  # Force full pixel decoding to catch truncated or corrupted payloads
    except (UnidentifiedImageError, OSError, SyntaxError, Exception) as e:
        raise InvalidImageError(f"Failed to decode image bytes. Image is corrupted or in an unsupported format: {str(e)}")

    try:
        # Correct EXIF orientation tag if present
        img = ImageOps.exif_transpose(img)
    except Exception:
        pass  # If EXIF transpose fails gracefully fallback to original image

    try:
        # Convert all image modes (RGBA, Grayscale L, Palette P, CMYK) explicitly to RGB
        img = img.convert("RGB")
    except Exception as e:
        raise UnsupportedImageError(f"Failed to convert image mode to RGB: {str(e)}")

    # Resize to exact model contract (224x224)
    img_resized = img.resize((224, 224), Image.Resampling.BILINEAR)

    # Convert to NumPy array with float32 dtype in [0.0, 255.0] range
    arr = np.array(img_resized, dtype=np.float32)

    if arr.shape != (224, 224, 3):
        raise UnsupportedImageError(f"Unexpected image array shape: {arr.shape}. Expected (224, 224, 3).")

    # Expand batch dimension -> (1, 224, 224, 3)
    tensor = np.expand_dims(arr, axis=0)
    return tensor
