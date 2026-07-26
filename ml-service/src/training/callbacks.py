import os
import sys
import tensorflow as tf
from tensorflow import keras

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from training_config import (
    CHECKPOINT_DIR, CHECKPOINT_FILEPATH, LOGS_DIR, CSV_LOG_FILEPATH,
    CHECKPOINT_MONITOR, EARLY_STOPPING_MONITOR, LR_MONITOR,
    EARLY_STOPPING_PATIENCE, REDUCE_LR_PATIENCE, REDUCE_LR_FACTOR,
    MIN_LEARNING_RATE
)

def build_transfer_callbacks():
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(LOGS_DIR, exist_ok=True)
    
    checkpoint_cb = keras.callbacks.ModelCheckpoint(
        filepath=CHECKPOINT_FILEPATH,
        monitor=CHECKPOINT_MONITOR,
        save_best_only=True,
        save_weights_only=False,
        mode="min"
    )
    
    early_stopping_cb = keras.callbacks.EarlyStopping(
        monitor=EARLY_STOPPING_MONITOR,
        patience=EARLY_STOPPING_PATIENCE,
        mode="min",
        restore_best_weights=True
    )
    
    reduce_lr_cb = keras.callbacks.ReduceLROnPlateau(
        monitor=LR_MONITOR,
        factor=REDUCE_LR_FACTOR,
        patience=REDUCE_LR_PATIENCE,
        min_lr=MIN_LEARNING_RATE,
        mode="min"
    )
    
    csv_logger_cb = keras.callbacks.CSVLogger(
        filename=CSV_LOG_FILEPATH,
        separator=",",
        append=False
    )
    
    return [checkpoint_cb, early_stopping_cb, reduce_lr_cb, csv_logger_cb]
