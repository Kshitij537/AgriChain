# Production Inference Pipeline Report (Phase ML-0.6)

This report documents the implementation and verification of AgriChain's production inference pipeline.

## 1. Production Model & Preprocessing Contract

- **Production Model**: `C:\Projects\AgriChain\ml-service\models\disease_model.keras`
- **SHA-256 Checksum**: `f531b46e4cd0903384eeec9e944e64913f3e94051498dc890612509dca34bb76`
- **Target Tensor Shape**: `(1, 224, 224, 3)`
- **Tensor Dtype**: `np.float32`
- **Pixel Value Range**: `[0.0, 255.0]` (No external /255 rescaling; internal EfficientNet scaling utilized)
- **EXIF Orientation**: Handled via `ImageOps.exif_transpose`
- **Image Mode Handling**: Explicitly converts RGB, RGBA, Grayscale, Palette to 3-channel RGB

## 2. Invalid Input & Exception Handling

- **Empty Bytes**: Rejected cleanly with `InvalidImageError`
- **Non-Image Bytes**: Rejected cleanly with `InvalidImageError`
- **Corrupted Bytes**: Rejected cleanly with `InvalidImageError`

## 3. Structured Prediction Schema & Top-K Support

```json
{
  "class_index": 9,
  "crop": "Orange",
  "disease": "Citrus Canker",
  "display_name": "Orange Citrus Canker",
  "is_healthy": false,
  "confidence": 0.9876,
  "top_predictions": [
    {"class_index": 9, "display_name": "Orange Citrus Canker", "confidence": 0.9876},
    {"class_index": 8, "display_name": "Orange Healthy", "confidence": 0.0102},
    {"class_index": 10, "display_name": "Orange Black Spot", "confidence": 0.0021}
  ]
}
```

## 4. Benchmark Performance & Latency

- **Cold Inference Latency**: `3833.64 ms` (Model load + initial inference)
- **Warm Inference Latency Average**: `511.58 ms` (Across 5 warm runs)
- **Model Cache Singleton**: Confirmed (Loaded once, reused across all requests)

