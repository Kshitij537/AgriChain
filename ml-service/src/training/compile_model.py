import os
import sys
import tensorflow as tf
from tensorflow import keras

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from training_config import INITIAL_LEARNING_RATE

def compile_for_transfer_learning(model, learning_rate=INITIAL_LEARNING_RATE):
    optimizer = keras.optimizers.Adam(learning_rate=learning_rate)
    loss = keras.losses.SparseCategoricalCrossentropy()
    metrics = [keras.metrics.SparseCategoricalAccuracy(name="accuracy")]
    
    model.compile(
        optimizer=optimizer,
        loss=loss,
        metrics=metrics
    )
    return model
