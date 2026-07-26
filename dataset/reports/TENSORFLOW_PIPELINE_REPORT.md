# TensorFlow Data Pipeline Verification Report

This report documents the verification of the TensorFlow tf.data input pipeline for AgriChain V1.

## 1. Environment & Framework Configuration

- **Python Version**: `3.10.5`
- **TensorFlow Version**: `2.21.0`
- **Keras Version**: `3.12.3`
- **Target Image Size**: `224 × 224 × 3`
- **Batch Size**: `32`
- **Number of Classes**: `12`
- **Shuffle Buffer Size**: `10000`
- **Random Seed**: `42`
- **RAM Cache Enabled**: `False`

## 2. EfficientNetB0 Input Contract & Normalization

- **Pipeline Output Dtype**: `tf.float32`
- **Pipeline Pixel Range**: `[0.0, 255.0]`
- **EfficientNetB0 Expected Input Range**: `[0.0, 255.0]`
- **Internal Model Preprocessing**: `Rescaling(1./255)` & ImageNet `Normalization` layers are embedded inside Keras EfficientNetB0.
- **Additional Pipeline Normalization**: `NO`
- **Double-Normalization Avoided**: `YES`

## 3. Class Index Mapping

| Index | Crop | Disease Class Name |
| :---: | :--- | :--- |
| `0` | `Cotton` | `Cotton Healthy` |
| `1` | `Cotton` | `Cotton Bacterial Blight` |
| `2` | `Cotton` | `Cotton Alternaria Leaf Spot` |
| `3` | `Cotton` | `Cotton Leaf Curl Virus` |
| `4` | `Soybean` | `Soybean Healthy` |
| `5` | `Soybean` | `Soybean Rust` |
| `6` | `Soybean` | `Soybean Bacterial Pustule` |
| `7` | `Soybean` | `Soybean Brown Spot` |
| `8` | `Orange` | `Orange Healthy` |
| `9` | `Orange` | `Orange Citrus Canker` |
| `10` | `Orange` | `Orange Black Spot` |
| `11` | `Orange` | `Orange Greening` |

## 4. Manifest & Dataset Sample Counts

| Split | Manifest Rows | Decoded Samples | Total Batches | Shuffled | Drop Remainder |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Train** | `26640` | `26640` | `833` | `YES` | `False` |
| **Validation** | `5706` | `5706` | `179` | `NO` | `False` |
| **Test** | `5704` | `5704` | `179` | `NO` | `False` |
| **Total** | `38050` | `38050` | `1191` | - | - |

## 5. Representative Batch Inspection

### Train Batch
- Image Shape: `[32, 224, 224, 3]`
- Label Shape: `[32]`
- Dtypes: Image `float32`, Label `int32`
- Pixel Range: `[0.00, 255.00]`

### Validation Batch
- Image Shape: `[32, 224, 224, 3]`
- Label Shape: `[32]`
- Dtypes: Image `float32`, Label `int32`
- Pixel Range: `[0.00, 255.00]`

### Test Batch
- Image Shape: `[32, 224, 224, 3]`
- Label Shape: `[32]`
- Dtypes: Image `float32`, Label `int32`
- Pixel Range: `[0.00, 255.00]`

## 6. Verification Checklist & Data Safety

- [x] **Source Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- [x] **Decode Failures**: `0` across all 38,050 images
- [x] **Missing Images**: `0`
- [x] **Partial Batches Preserved**: `YES` (drop_remainder=False)
- [x] **Read-Only Split Manifests Unchanged**: `YES`
- [x] **Processed/Raw Images Unchanged**: `YES`
