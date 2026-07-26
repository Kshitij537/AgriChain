import os
import sys
import tensorflow as tf
from tensorflow.keras import layers

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from training_config import (
    AUGMENTATION_ENABLED, HORIZONTAL_FLIP, ROTATION_FACTOR,
    ZOOM_FACTOR, TRANSLATION_HEIGHT, TRANSLATION_WIDTH,
    CONTRAST_FACTOR, RANDOM_SEED
)

def build_augmentation(seed=RANDOM_SEED):
    aug_layers = []
    
    if HORIZONTAL_FLIP:
        aug_layers.append(layers.RandomFlip("horizontal", seed=seed))
        
    if ROTATION_FACTOR > 0:
        aug_layers.append(layers.RandomRotation(
            factor=(-ROTATION_FACTOR, ROTATION_FACTOR),
            fill_mode="nearest",
            seed=seed
        ))
        
    if ZOOM_FACTOR > 0:
        aug_layers.append(layers.RandomZoom(
            height_factor=(-ZOOM_FACTOR, ZOOM_FACTOR),
            width_factor=(-ZOOM_FACTOR, ZOOM_FACTOR),
            fill_mode="nearest",
            seed=seed
        ))
        
    if TRANSLATION_HEIGHT > 0 or TRANSLATION_WIDTH > 0:
        aug_layers.append(layers.RandomTranslation(
            height_factor=(-TRANSLATION_HEIGHT, TRANSLATION_HEIGHT),
            width_factor=(-TRANSLATION_WIDTH, TRANSLATION_WIDTH),
            fill_mode="nearest",
            seed=seed
        ))
        
    if CONTRAST_FACTOR > 0:
        aug_layers.append(layers.RandomContrast(
            factor=CONTRAST_FACTOR,
            seed=seed
        ))
        
    return tf.keras.Sequential(aug_layers, name="online_augmentation")

def augment_and_clip_image(image_tensor, augmentation_layer, training=True):
    if training and AUGMENTATION_ENABLED:
        augmented = augmentation_layer(image_tensor, training=True)
        # Guarantee pixel values remain in valid [0.0, 255.0] float32 range
        clipped = tf.clip_by_value(augmented, 0.0, 255.0)
        return clipped
    return image_tensor
