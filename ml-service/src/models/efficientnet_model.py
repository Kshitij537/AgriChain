import os
import sys
import tensorflow as tf
from tensorflow import keras
from tensorflow.keras import layers

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

DATA_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "data"))
if DATA_DIR not in sys.path:
    sys.path.append(DATA_DIR)

TRAINING_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "training"))
if TRAINING_DIR not in sys.path:
    sys.path.append(TRAINING_DIR)

from pipeline_config import IMAGE_HEIGHT, IMAGE_WIDTH, CHANNELS, NUM_CLASSES
from training_config import RANDOM_SEED
from augmentation import build_augmentation

MODEL_NAME = "EfficientNetB0"
INPUT_SHAPE = (IMAGE_HEIGHT, IMAGE_WIDTH, CHANNELS)
IMAGENET_WEIGHTS = "imagenet"
INCLUDE_TOP = False
DROPOUT_RATE = 0.3
BASE_MODEL_TRAINABLE = False

def build_agrichain_model(include_augmentation=True, seed=RANDOM_SEED):
    inputs = keras.Input(shape=INPUT_SHAPE, dtype=tf.float32, name="input_image")
    
    if include_augmentation:
        augmentation_layer = build_augmentation(seed=seed)
        x = augmentation_layer(inputs)
    else:
        x = inputs

    # Instantiate EfficientNetB0 backbone
    base_model = tf.keras.applications.EfficientNetB0(
        include_top=INCLUDE_TOP,
        weights=IMAGENET_WEIGHTS,
        input_shape=INPUT_SHAPE
    )
    
    # Freeze backbone for initial transfer learning
    base_model.trainable = BASE_MODEL_TRAINABLE
    
    # Call base model with explicit training=False to preserve stable BatchNorm statistics
    x = base_model(x, training=False)
    
    # Lightweight classification head
    x = layers.GlobalAveragePooling2D(name="global_average_pooling")(x)
    x = layers.Dropout(DROPOUT_RATE, name="classifier_dropout")(x)
    outputs = layers.Dense(NUM_CLASSES, activation="softmax", name="predictions")(x)
    
    model = keras.Model(inputs=inputs, outputs=outputs, name="AgriChain_EfficientNetB0")
    return model, base_model
