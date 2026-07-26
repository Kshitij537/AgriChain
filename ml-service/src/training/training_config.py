import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")
SPLITS_DIR = os.path.join(PROJECT_ROOT, "dataset", "splits")
TRAIN_MANIFEST_PATH = os.path.join(SPLITS_DIR, "train.csv")

AUGMENTATION_ENABLED = True

HORIZONTAL_FLIP = True
ROTATION_FACTOR = 0.08       # ±8% (~28°)
ZOOM_FACTOR = 0.10           # ±10%
TRANSLATION_HEIGHT = 0.05    # ±5%
TRANSLATION_WIDTH = 0.05     # ±5%
CONTRAST_FACTOR = 0.10       # ±10%

CLASS_WEIGHT_METHOD = "balanced"
CLASS_WEIGHT_CLIP_MAX = 5.0

RANDOM_SEED = 42

# Initial Transfer-Learning Parameters
INITIAL_EPOCHS = 15
INITIAL_LEARNING_RATE = 1e-3

OPTIMIZER_NAME = "adam"
LOSS_NAME = "sparse_categorical_crossentropy"

EARLY_STOPPING_PATIENCE = 4
REDUCE_LR_PATIENCE = 2
REDUCE_LR_FACTOR = 0.2
MIN_LEARNING_RATE = 1e-6

CHECKPOINT_MONITOR = "val_loss"
EARLY_STOPPING_MONITOR = "val_loss"
LR_MONITOR = "val_loss"

CHECKPOINT_DIR = os.path.normpath(os.path.join(PROJECT_ROOT, "ml-service", "models", "checkpoints"))
CHECKPOINT_FILEPATH = os.path.join(CHECKPOINT_DIR, "best_transfer.keras")

LOGS_DIR = os.path.normpath(os.path.join(PROJECT_ROOT, "ml-service", "logs", "training"))
CSV_LOG_FILEPATH = os.path.join(LOGS_DIR, "transfer_learning.csv")

def set_global_seed(seed=RANDOM_SEED):
    import random
    import numpy as np
    import tensorflow as tf
    random.seed(seed)
    np.random.seed(seed)
    tf.random.set_seed(seed)

