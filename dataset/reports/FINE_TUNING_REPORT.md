# EfficientNetB0 Fine-Tuning Stage Final Report

This report documents the conservative upper-layer fine-tuning stage (Phase ML-0.3.7) for AgriChain V1.

## 1. Executive Summary & Baseline Comparison

- **Transfer Learning Baseline (`best_transfer.keras`)**:
  - Validation Loss: `0.044251`
  - Validation Accuracy: `98.25%`
- **Fine-Tuning Candidate (`best_finetuned.keras`)**:
  - Best Fine-Tuning Epoch: `Epoch 10`
  - Best Fine-Tuning Validation Loss: `0.034535`
  - Best Fine-Tuning Validation Accuracy: `98.58%`
- **Fine-Tuning Improved Baseline**: `True`
- **Recommended Model Candidate for ML-0.4**: **`best_finetuned.keras`**

## 2. Fine-Tuning Architecture & Trainability Breakdown

- **Total Backbone Layers**: `238`
- **Unfreeze Cutoff Index**: `190` (Top 20% upper backbone layers)
- **Frozen Backbone Non-BN Layers**: `151`
- **Trainable Backbone Non-BN Layers**: `38`
- **Total BatchNorm Layers**: `49`
- **Trainable BatchNorm Layers**: `0` (Strictly 0)
- **Trainable Backbone Parameters**: `2,287,504`
- **Trainable Classifier Parameters**: `15,372`
- **Total Trainable Parameters**: `2,302,876`
- **Non-Trainable Parameters**: `1,762,067`

## 3. Complete Fine-Tuning Epoch History

| Epoch | Train Loss | Train Accuracy | Val Loss | Val Accuracy | Learning Rate |
| :---: | :---: | :---: | :---: | :---: | :---: |
| `Epoch 1` | `0.017140` | `99.37%` | **`0.038766`** | `98.49%` | `9.999999747378752e-06`  |
| `Epoch 2` | `0.012834` | `99.49%` | **`0.039490`** | `98.55%` | `9.999999747378752e-06`  |
| `Epoch 3` | `0.012614` | `99.49%` | **`0.040431`** | `98.48%` | `9.999999747378752e-06`  |
| `Epoch 4` | `0.012435` | `99.53%` | **`0.036125`** | `98.56%` | `1.9999999949504854e-06`  |
| `Epoch 5` | `0.010217` | `99.55%` | **`0.035913`** | `98.62%` | `1.9999999949504854e-06`  |
| `Epoch 6` | `0.008957` | `99.61%` | **`0.035058`** | `98.63%` | `1.9999999949504854e-06`  |
| `Epoch 7` | `0.009148` | `99.62%` | **`0.034976`** | `98.67%` | `1.9999999949504854e-06`  |
| `Epoch 8` | `0.008768` | `99.64%` | **`0.035227`** | `98.62%` | `1.9999999949504854e-06`  |
| `Epoch 9` | `0.008586` | `99.62%` | **`0.034579`** | `98.65%` | `4.0000000467443897e-07`  |
| `Epoch 10` | `0.007859` | `99.65%` | **`0.034535`** | `98.58%` | `4.0000000467443897e-07` ⭐ (Best) |

## 4. Safety & Test Set Isolation

- [x] **Source Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- [x] **Transfer Baseline Preserved**: `best_transfer.keras` remains intact and unmodified
- [x] **Test Dataset Isolation**: `100%` (0 test images accessed or evaluated)
- [x] **Production Export Sealed**: `disease_model.keras` NOT created yet
