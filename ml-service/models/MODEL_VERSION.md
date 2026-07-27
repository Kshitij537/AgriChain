# AgriChain Disease Detection Model — Version 1.0.0

This document defines the production specification and performance boundaries for AgriChain's V1 crop disease classification model.

## 1. Specification Overview

- **Model Name**: AgriChain Disease Detection
- **Version**: `1.0.0`
- **Architecture**: `EfficientNetB0` (ImageNet pretrained, top 20% fine-tuned)
- **Input Dimensions**: `224 × 224 × 3` (`tf.float32`, range `[0.0, 255.0]`)
- **External Normalization**: `NO` (EfficientNetB0 contains internal Rescaling/Normalization layers)
- **Classes**: `12` across 3 regional crop types (Cotton, Soybean, Orange)
- **Source Checkpoint**: `ml-service/models/checkpoints/best_finetuned.keras`
- **Production Artifact**: `ml-service/models/disease_model.keras`
- **Production SHA-256**: `f531b46e4cd0903384eeec9e944e64913f3e94051498dc890612509dca34bb76`

## 2. Benchmark Performance (Sealed Test Set: 5,704 Images)

- **Overall Test Accuracy**: **`98.58%`** (5,623 / 5,704 correct predictions)
- **Macro F1 Score**: **`93.65%`**
- **Weighted F1 Score**: **`98.58%`**
- **Cotton Crop Accuracy**: `98.57%` (622 / 631 correct)
- **Soybean Crop Accuracy**: `98.33%` (944 / 960 correct)
- **Orange Crop Accuracy**: `98.64%` (4,057 / 4,113 correct)
- **Cross-Crop Errors**: `11` (99.81% crop identification accuracy)

## 3. Frozen 12-Class Mapping

| Index | Disease Class Name | Crop Type |
| :---: | :--- | :---: |
| `0` | `Cotton Healthy` | `Cotton` |
| `1` | `Cotton Bacterial Blight` | `Cotton` |
| `2` | `Cotton Alternaria Leaf Spot` | `Cotton` |
| `3` | `Cotton Leaf Curl Virus` | `Cotton` |
| `4` | `Soybean Healthy` | `Soybean` |
| `5` | `Soybean Rust` | `Soybean` |
| `6` | `Soybean Bacterial Pustule` | `Soybean` |
| `7` | `Soybean Brown Spot` | `Soybean` |
| `8` | `Orange Healthy` | `Orange` |
| `9` | `Orange Citrus Canker` | `Orange` |
| `10` | `Orange Black Spot` | `Orange` |
| `11` | `Orange Greening` | `Orange` |

## 4. Known Field Limitations & Deployment Guidance

1. **Soybean Bacterial Pustule (Index 6)**: Has limited training/test support (16 test images) and achieved 56.25% recall / 64.29% F1. Predictions for this class should be presented with advisory warnings.
2. **Soybean Rust (Index 5)**: Achieved 80.70% F1 score across 26 test samples.
3. **High-Confidence Misclassifications**: 42 out of 81 total errors occurred with softmax confidence >= 0.90.
4. **Decision Support**: All model outputs must be presented to farmers and extension workers as decision support recommendations rather than standalone diagnostic guarantees.
