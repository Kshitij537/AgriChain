# Transfer Learning Training Configuration Report

This report documents the initial transfer-learning stage configuration for AgriChain V1.

## 1. Initial Stage Parameters

- **Architecture**: `EfficientNetB0` (Frozen Backbone)
- **Training Stage**: `Initial Transfer Learning (Classifier Head Only)`
- **Maximum Initial Epochs**: `15`
- **Initial Learning Rate**: `0.001` (`1e-3`)
- **Optimizer**: `adam` (`keras.optimizers.Adam`)
- **Loss Function**: `sparse_categorical_crossentropy` (`keras.losses.SparseCategoricalCrossentropy`)
- **Primary Metric**: `keras.metrics.SparseCategoricalAccuracy` (`accuracy`)
- **Random Seed**: `42`

## 2. Model Freeze & Parameter Summary

- **Backbone Frozen**: `True`
- **Total Parameters**: `4,064,943`
- **Trainable Parameters**: `15,372` (Custom Dense Head)
- **Non-Trainable Parameters**: `4,049,571` (Frozen EfficientNetB0 Backbone)

## 3. Callback Specifications

- **ModelCheckpoint**:
  - Filepath: `C:\Projects\AgriChain\ml-service\models\checkpoints\best_transfer.keras`
  - Monitor: `val_loss` (`mode=min`)
  - Save Best Only: `True`
- **EarlyStopping**:
  - Monitor: `val_loss` (`mode=min`)
  - Patience: `4` epochs
  - Restore Best Weights: `True`
- **ReduceLROnPlateau**:
  - Monitor: `val_loss` (`mode=min`)
  - Factor: `0.2`
  - Patience: `2` epochs
  - Minimum Learning Rate: `1e-06`
- **CSVLogger**:
  - Filepath: `C:\Projects\AgriChain\ml-service\logs\training\transfer_learning.csv`

## 4. Class Weighting Summary

- **Weights Calculated From**: `dataset/splits/train.csv` ONLY
- **Validation/Test Used For Weights**: `NO`
- **Clip Maximum**: `5.0`
- **Weight Range**: `0.2770` (Orange Citrus Canker) to `5.0000` (Clipped minority classes)

## 5. One-Batch Loss & Safety Verification

- **Batch Shape**: `(32, 224, 224, 3)`
- **Forward Pass Loss Value**: `2.972979`
- **Loss Finite & Positive**: `YES`
- **NaN/Inf Count**: `0`
- **Weights Mutated During Verification**: `NO`

## 6. Safety & Test Dataset Isolation

- [x] **Source Split Fingerprint**: `868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21`
- [x] **Test Dataset Isolation**: Test dataset was NOT loaded or used for config, callbacks, or weight calculation
- [x] **Epochs Trained**: `0` (`model.fit()` not executed)
- [x] **Git Exclusions Updated**: `.gitignore` configured to ignore checkpoints and logs
