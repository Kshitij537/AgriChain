# Dataset Split Report

This report documents the group-aware 70/15/15 train-validation-test split for AgriChain V1.

## 1. Overall Distribution Summary

| Split | Images | Actual % | Target % |
| :--- | :---: | :---: | :---: |
| **Train** | `26640` | `70.01%` | `70.0%` |
| **Validation** | `5706` | `15.0%` | `15.0%` |
| **Test** | `5704` | `14.99%` | `15.0%` |
| **Total** | `38050` | `100.0%` | `100.0%` |

## 2. Per-Class Stratification Breakdown

| Class Name | Total | Train Count | Train % | Val Count | Val % | Test Count | Test % |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `cotton/Alternaria_Leaf_Spot` | 173 | 121 | 69.94% | 26 | 15.03% | 26 | 15.03% |
| `cotton/Bacterial_Blight` | 1837 | 1286 | 70.01% | 276 | 15.02% | 275 | 14.97% |
| `cotton/Healthy` | 1823 | 1277 | 70.05% | 273 | 14.98% | 273 | 14.98% |
| `cotton/Leaf_Curl_Virus` | 379 | 265 | 69.92% | 57 | 15.04% | 57 | 15.04% |
| `orange/Black_Spot` | 206 | 144 | 69.9% | 31 | 15.05% | 31 | 15.05% |
| `orange/Citrus_Canker` | 11449 | 8015 | 70.01% | 1717 | 15.0% | 1717 | 15.0% |
| `orange/Greening` | 5876 | 4114 | 70.01% | 881 | 14.99% | 881 | 14.99% |
| `orange/Healthy` | 9898 | 6929 | 70.0% | 1485 | 15.0% | 1484 | 14.99% |
| `soybean/Bacterial_Pustule` | 110 | 78 | 70.91% | 16 | 14.55% | 16 | 14.55% |
| `soybean/Brown_Spot` | 81 | 57 | 70.37% | 12 | 14.81% | 12 | 14.81% |
| `soybean/Healthy` | 6043 | 4231 | 70.01% | 906 | 14.99% | 906 | 14.99% |
| `soybean/Rust` | 175 | 123 | 70.29% | 26 | 14.86% | 26 | 14.86% |

## 3. Leakage & Overlap Validation

- [x] **Train ↔ Validation Group Overlap**: `0`
- [x] **Train ↔ Test Group Overlap**: `0`
- [x] **Validation ↔ Test Group Overlap**: `0`
- [x] **Duplicate Processed Paths**: `0`
- [x] **Missing Processed Paths**: `0`
- [x] **All 12 Classes Covered in All Splits**: `YES`

## 4. Reproducibility & Fingerprints

- **Random Seed**: `42`
- **Source Content Fingerprint**: `bd22a4ae6881a5d7729a5b2cc434c88a992c9a837f20b1a703c86ebcfd8cac19`
- **Source Leakage Fingerprint**: `9a00c066415794adaefffb89c19aa20d0a31ed489885759758240a3c27ab0339`
- **Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
