# Class Balance & Training Augmentation Report

This report documents the training-only online augmentation configuration and class balancing weights for AgriChain V1.

## 1. Strategy Summary

- **Online Augmentation**: Enabled (Applied dynamically during training only)
- **Class-Weighted Loss**: Standard balanced inverse-frequency weighting calculated from `train.csv`
- **Weight Clipping Threshold**: `5.0`
- **Oversampling / Undersampling**: None
- **Offline Augmented Images**: `0`

## 2. Online Augmentation Parameters

- **Horizontal Flip**: `True`
- **Rotation Factor**: `±0.08` (~28°)
- **Zoom Factor**: `±0.1` (±10%)
- **Translation Factor**: `Height ±0.05, Width ±0.05`
- **Contrast Factor**: `±0.1`
- **Output Value Clipping**: `[0.0, 255.0]` float32
- **Random Seed**: `42`

## 3. Class Weighting Distribution

| Index | Disease Class Name | Training Count | Train % | Raw Weight | Effective Weight | Clipped? |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: |
| `0` | `Cotton Healthy` | `1277` | `4.79%` | `1.7384` | **`1.7384`** | `NO` |
| `1` | `Cotton Bacterial Blight` | `1286` | `4.83%` | `1.7263` | **`1.7263`** | `NO` |
| `2` | `Cotton Alternaria Leaf Spot` | `121` | `0.45%` | `18.3471` | **`5.0000`** | `YES` |
| `3` | `Cotton Leaf Curl Virus` | `265` | `0.99%` | `8.3774` | **`5.0000`** | `YES` |
| `4` | `Soybean Healthy` | `4231` | `15.88%` | `0.5247` | **`0.5247`** | `NO` |
| `5` | `Soybean Rust` | `123` | `0.46%` | `18.0488` | **`5.0000`** | `YES` |
| `6` | `Soybean Bacterial Pustule` | `78` | `0.29%` | `28.4615` | **`5.0000`** | `YES` |
| `7` | `Soybean Brown Spot` | `57` | `0.21%` | `38.9474` | **`5.0000`** | `YES` |
| `8` | `Orange Healthy` | `6929` | `26.01%` | `0.3204` | **`0.3204`** | `NO` |
| `9` | `Orange Citrus Canker` | `8015` | `30.09%` | `0.2770` | **`0.2770`** | `NO` |
| `10` | `Orange Black Spot` | `144` | `0.54%` | `15.4167` | **`5.0000`** | `YES` |
| `11` | `Orange Greening` | `4114` | `15.44%` | `0.5396` | **`0.5396`** | `NO` |

## 4. Weight Statistics & Impact Analysis

- **Total Training Samples**: `26640`
- **Minimum Raw Weight**: `0.2770` (`Orange Citrus Canker`)
- **Maximum Raw Weight**: `38.9474` (`Soybean Brown Spot`)
- **Minimum Effective Weight**: `0.2770`
- **Maximum Effective Weight**: `5.0000`
- **Clipped Classes Count**: `6` / 12 (Classes exceeding clip max `5.0`)
- **Clipped Classes**: `Soybean Brown Spot` (raw 38.95 -> 5.0), `Soybean Bacterial Pustule` (raw 28.46 -> 5.0), `Cotton Alternaria Leaf Spot` (raw 18.35 -> 5.0), `Soybean Rust` (raw 18.05 -> 5.0), `Orange Black Spot` (raw 15.42 -> 5.0), `Cotton Leaf Curl Virus` (raw 8.38 -> 5.0)

## 5. Pipeline Isolation & Data Safety Verification

- [x] **Train Pipeline Augmented**: `YES`
- [x] **Validation Pipeline Augmented**: `NO`
- [x] **Test Pipeline Augmented**: `NO`
- [x] **Source Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- [x] **Read-Only Split Manifests Unchanged**: `YES`
- [x] **Processed/Raw Images Unchanged**: `YES`
