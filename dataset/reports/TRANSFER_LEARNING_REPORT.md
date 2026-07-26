# Initial Transfer Learning Stage Final Report

This report documents the full frozen-backbone initial transfer-learning stage for AgriChain V1.

## 1. Executive Summary

- **Architecture**: `EfficientNetB0` (Frozen ImageNet Backbone)
- **Total Epochs Authorized**: `15`
- **Total Epochs Completed**: `15`
- **Global Best Epoch**: `Epoch 15`
- **Global Best Validation Loss**: **`0.044251`**
- **Validation Accuracy at Best Epoch**: **`98.25%`** (`0.982475`)
- **Total Stage Wall-Clock Time**: `15429.99 seconds` (`257.17 minutes`)

## 2. Complete Epoch-by-Epoch History

| Human Epoch | CSV Epoch | Train Loss | Train Accuracy | Val Loss | Val Accuracy | Learning Rate |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `Epoch 1` | `0` | `0.254008` | `94.10%` | **`0.124794`** | `96.39%` | `0.0010000000474974513`  |
| `Epoch 2` | `1` | `0.074893` | `97.96%` | **`0.091165`** | `96.85%` | `0.0010000000474974513`  |
| `Epoch 3` | `2` | `0.068070` | `98.00%` | **`0.092080`** | `96.86%` | `0.0010000000474974513`  |
| `Epoch 4` | `3` | `0.056083` | `98.34%` | **`0.085795`** | `96.95%` | `0.0010000000474974513`  |
| `Epoch 5` | `4` | `0.048136` | `98.58%` | **`0.073741`** | `97.58%` | `0.0010000000474974513`  |
| `Epoch 6` | `5` | `0.045318` | `98.66%` | **`0.060246`** | `97.93%` | `0.0010000000474974513`  |
| `Epoch 7` | `6` | `0.035513` | `98.87%` | **`0.048738`** | `98.12%` | `0.0010000000474974513`  |
| `Epoch 8` | `7` | `0.037952` | `98.79%` | **`0.056730`** | `97.93%` | `0.0010000000474974513`  |
| `Epoch 9` | `8` | `0.034713` | `98.89%` | **`0.046816`** | `98.32%` | `0.0010000000474974513`  |
| `Epoch 10` | `9` | `0.028657` | `98.99%` | **`0.055711`** | `97.86%` | `0.0010000000474974513`  |
| `Epoch 11` | `10` | `0.032981` | `98.93%` | **`0.046162`** | `98.25%` | `0.0010000000474974513`  |
| `Epoch 12` | `11` | `0.034720` | `98.92%` | **`0.050885`** | `98.11%` | `0.0010000000474974513`  |
| `Epoch 13` | `12` | `0.027499` | `99.10%` | **`0.050191`** | `98.11%` | `0.0010000000474974513`  |
| `Epoch 14` | `13` | `0.032350` | `99.03%` | **`0.048579`** | `98.04%` | `0.00020000000949949026`  |
| `Epoch 15` | `14` | `0.025798` | `99.14%` | **`0.044251`** | `98.25%` | `0.00020000000949949026` ⭐ (Best) |

## 3. Best Model Performance Summary

- **Selection Criterion**: Minimum `val_loss`
- **Best Epoch**: `Epoch 15`
- **Best Validation Loss**: `0.044251`
- **Best Validation Accuracy**: `98.25%`
- **Training Loss at Best Epoch**: `0.025798`
- **Training Accuracy at Best Epoch**: `99.14%`
- **Learning Rate at Best Epoch**: `0.00020000000949949026`

## 4. Checkpoint & Asset Integrity

- **Checkpoint Path**: `C:\Projects\AgriChain\ml-service\models\checkpoints\best_transfer.keras`
- **Checkpoint File Size**: `16.44 MB` (`17,235,546 bytes`)
- **Checkpoint Loadable**: `True`
- **Corresponds to Global Min Val Loss**: `YES` (`Epoch 15`)
- **CSV Log Path**: `C:\Projects\AgriChain\ml-service\logs\training\transfer_learning.csv`

## 5. Safety & Test Set Isolation

- [x] **Source Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- [x] **Test Dataset Untouched**: `YES` (0 test images loaded or evaluated)
- [x] **Backbone Remained Frozen**: `YES` (0 backbone parameter updates throughout)
- [x] **Fine-Tuning Executed**: `NO`
- [x] **Final Production Model Exported**: `NO` (`disease_model.keras` not created yet)
