# EfficientNetB0 Model Architecture Report

This report documents the AgriChain V1 disease classification model architecture.

## 1. Environment & Framework

- **Architecture**: `EfficientNetB0`
- **Framework**: TensorFlow `2.21.0` / Keras `3.12.3`
- **Input Shape**: `224 × 224 × 3`
- **Input Dtype**: `tf.float32`
- **Pixel Range**: `[0.0, 255.0]` (Compatible with EfficientNetB0 built-in Rescaling/Normalization layers)
- **External /255 Normalization**: `NO`

## 2. Backbone & Transfer Learning Freeze State

- **Feature Extractor**: `EfficientNetB0`
- **Pretrained Weights**: `imagenet`
- **include_top**: `False`
- **base_model.trainable**: `False` (Frozen backbone)
- **Backbone Feature Output Shape**: `[None, 7, 7, 1280]`
- **BatchNorm Mode**: Called with `training=False` to preserve ImageNet statistics

## 3. Classification Head & Layer Details

| Layer Name | Layer Type | Output Shape | Parameters |
| :--- | :--- | :---: | :---: |
| `input_image` | `InputLayer` | `unknown` | `0` |
| `online_augmentation` | `Sequential` | `(None, 224, 224, 3)` | `0` |
| `efficientnetb0` | `Functional` | `(None, 7, 7, 1280)` | `4,049,571` |
| `global_average_pooling` | `GlobalAveragePooling2D` | `unknown` | `0` |
| `classifier_dropout` | `Dropout` | `unknown` | `0` |
| `predictions` | `Dense` | `unknown` | `15,372` |

## 4. Parameter Breakdown

- **Total Parameters**: `4,064,943`
- **Trainable Parameters**: `15,372` (Custom Dense Head)
- **Non-Trainable Parameters**: `4,049,571` (Frozen EfficientNetB0 Backbone)
- **Trainable Ratio**: `0.38%`

## 5. Forward Pass & Probability Validation

- **Test Batch Output Shape**: `(32, 12)`
- **NaN Count**: `0`
- **Inf Count**: `0`
- **Min Probability**: `0.006919`
- **Max Probability**: `0.255090`
- **Row Sums Range**: `[1.000000, 1.000000]` (Valid Softmax Distribution)
- **Deterministic Inference Verified**: `YES` (`diff = 0.0`)
- **Stochastic Training Path Verified**: `YES` (`diff = 0.078686`)

## 6. Model Safety & Split Integrity

- [x] **Source Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- [x] **Model Compiled**: `NO`
- [x] **Model Trained**: `NO` (`model.fit()` not called)
- [x] **Fake Trained Model Saved**: `NO` (`ml-service/models/` empty)
- [x] **Read-Only Split Manifests Unchanged**: `YES`
- [x] **Processed/Raw Images Unchanged**: `YES`
