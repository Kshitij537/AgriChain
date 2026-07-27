# Final Unbiased Model Evaluation Report (Phase ML-0.4)

This report documents the final unbiased test evaluation of AgriChain's selected disease model on the sealed 5,704-image test dataset.

## 1. Selected Model & Evaluation Environment

- **Selected Model Checkpoint**: `C:\Projects\AgriChain\ml-service\models\checkpoints\best_finetuned.keras`
- **Architecture**: `EfficientNetB0` (Fine-Tuned Upper 20% Backbone)
- **Test Manifest**: `dataset/splits/test.csv` (`5,704` images across 12 classes)
- **Source Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- **Test Augmentation**: `OFF` | **Test Shuffle**: `OFF`
- **Evaluation Time**: `150.18 seconds` (`0.8390 s/batch`)

## 2. Overall Test Metrics

- **Test Loss**: **`0.052479`**
- **Test Accuracy**: **`98.58%`** (`0.985799`)
- **Macro Precision**: `93.26%` (`0.9326`)
- **Macro Recall**: `94.52%` (`0.9452`)
- **Macro F1 Score**: **`93.65%`** (`0.9365`)
- **Weighted Precision**: `98.62%` (`0.9862`)
- **Weighted Recall**: `98.58%` (`0.9858`)
- **Weighted F1 Score**: **`98.58%`** (`0.9858`)

## 3. Validation vs Test Generalization

- **Selected Validation Loss**: `0.034535` | **Test Loss**: `0.052479` (Diff: `+0.017944`)
- **Selected Validation Accuracy**: `98.58%` | **Test Accuracy**: `98.58%` (Diff: `-0.00%`)
- **Generalization Assessment**: Outstanding generalization with virtually zero performance drop on unseen test data.

## 4. Per-Class Performance Breakdown

| Index | Disease Class Name | Support | Correct | Incorrect | Precision | Recall | F1 Score |
| :---: | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `0` | `Cotton Healthy` | `273` | `268` | `5` | `98.89%` | `98.17%` | **`98.53%`** |
| `1` | `Cotton Bacterial Blight` | `275` | `273` | `2` | `97.50%` | `99.27%` | **`98.38%`** |
| `2` | `Cotton Alternaria Leaf Spot` | `26` | `26` | `0` | `92.86%` | `100.00%` | **`96.30%`** |
| `3` | `Cotton Leaf Curl Virus` | `57` | `55` | `2` | `100.00%` | `96.49%` | **`98.21%`** |
| `4` | `Soybean Healthy` | `906` | `900` | `6` | `99.78%` | `99.34%` | **`99.56%`** |
| `5` | `Soybean Rust` | `26` | `23` | `3` | `74.19%` | `88.46%` | **`80.70%`** |
| `6` | `Soybean Bacterial Pustule` | `16` | `9` | `7` | `75.00%` | `56.25%` | **`64.29%`** |
| `7` | `Soybean Brown Spot` | `12` | `12` | `0` | `100.00%` | `100.00%` | **`100.00%`** |
| `8` | `Orange Healthy` | `1484` | `1436` | `48` | `99.86%` | `96.77%` | **`98.29%`** |
| `9` | `Orange Citrus Canker` | `1717` | `1709` | `8` | `97.27%` | `99.53%` | **`98.39%`** |
| `10` | `Orange Black Spot` | `31` | `31` | `0` | `83.78%` | `100.00%` | **`91.18%`** |
| `11` | `Orange Greening` | `881` | `881` | `0` | `100.00%` | `100.00%` | **`100.00%`** |

## 5. Minority Class Audit

- **Cotton Alternaria Leaf Spot** (Index `2`):
  - Support: `26` | Correct: `26` | Incorrect: `0`
  - Precision: `92.86%` | Recall: `100.00%` | F1: `96.30%`
- **Cotton Leaf Curl Virus** (Index `3`):
  - Support: `57` | Correct: `55` | Incorrect: `2`
  - Precision: `100.00%` | Recall: `96.49%` | F1: `98.21%`
- **Soybean Rust** (Index `5`):
  - Support: `26` | Correct: `23` | Incorrect: `3`
  - Precision: `74.19%` | Recall: `88.46%` | F1: `80.70%`
- **Soybean Bacterial Pustule** (Index `6`):
  - Support: `16` | Correct: `9` | Incorrect: `7`
  - Precision: `75.00%` | Recall: `56.25%` | F1: `64.29%`
- **Soybean Brown Spot** (Index `7`):
  - Support: `12` | Correct: `12` | Incorrect: `0`
  - Precision: `100.00%` | Recall: `100.00%` | F1: `100.00%`
- **Orange Black Spot** (Index `10`):
  - Support: `31` | Correct: `31` | Incorrect: `0`
  - Precision: `83.78%` | Recall: `100.00%` | F1: `91.18%`

## 6. Crop-Level Analysis & Error Breakdown

- **Cotton**: Total=`631`, Correct=`622`, Incorrect=`9`, Accuracy=**`98.57%`**
- **Soybean**: Total=`960`, Correct=`944`, Incorrect=`16`, Accuracy=**`98.33%`**
- **Orange**: Total=`4113`, Correct=`4057`, Incorrect=`56`, Accuracy=**`98.64%`**
- **Cross-Crop Errors**: `11` (Cases where true crop differed from predicted crop)
- **Within-Crop Disease Errors**: `70` (Same crop, misclassified disease)

## 7. Confidence & High-Confidence Errors

- **Mean Confidence**: `0.9910` | **Median Confidence**: `1.0000`
- **Correct Mean Confidence**: `0.9934` | **Incorrect Mean Confidence**: `0.8273`
- **High-Confidence Errors (>= 0.90)**: `42` samples

## 8. Safety & Integrity Check

- [x] **Model Weights Modified**: `NO` (Evaluation only)
- [x] **Raw/Processed Datasets Modified**: `NO`
- [x] **Split Manifests Modified**: `NO`
- [x] **Production Export Sealed**: `disease_model.keras` NOT exported yet
