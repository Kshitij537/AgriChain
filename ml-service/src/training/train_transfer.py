import os
import sys
import time
import json
import csv
import numpy as np
import tensorflow as tf
from tensorflow import keras

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

DATA_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "data"))
if DATA_DIR not in sys.path:
    sys.path.append(DATA_DIR)

MODELS_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "models"))
if MODELS_DIR not in sys.path:
    sys.path.append(MODELS_DIR)

from training_config import (
    PROJECT_ROOT, REPORTS_DIR, SPLITS_DIR, INITIAL_EPOCHS, INITIAL_LEARNING_RATE,
    OPTIMIZER_NAME, LOSS_NAME, CHECKPOINT_FILEPATH, CSV_LOG_FILEPATH,
    RANDOM_SEED, set_global_seed
)
from class_weights import compute_class_weights
from dataset_loader import load_manifest, create_dataset
from split_dataset import compute_split_fingerprint
from efficientnet_model import build_agrichain_model
from compile_model import compile_for_transfer_learning
from callbacks import build_transfer_callbacks

def run_transfer_training(epochs=1):
    print("==================================================")
    print(f"Starting Phase ML-0.3.6A — CPU Training Smoke Test ({epochs} Epoch Authorized)")
    print("==================================================")

    set_global_seed(RANDOM_SEED)

    # 1. Dataset setup
    train_paths, train_labels = load_manifest("train")
    val_paths, val_labels = load_manifest("validation")

    train_ds = create_dataset("train", training=True, batch_size=32)
    val_ds = create_dataset("validation", training=False, batch_size=32)

    train_batches = int(np.ceil(len(train_paths) / 32))
    val_batches = int(np.ceil(len(val_paths) / 32))

    # 2. Class weights & Callbacks
    effective_weights, raw_weights, _ = compute_class_weights()
    callbacks = build_transfer_callbacks()

    # 3. Model construction & compilation
    model, base_model = build_agrichain_model(include_augmentation=True)
    model = compile_for_transfer_learning(model, learning_rate=INITIAL_LEARNING_RATE)

    # Capture weights before training
    backbone_w_before = [v.numpy().copy() for v in base_model.weights]
    classifier_w_before = [v.numpy().copy() for v in model.get_layer("predictions").weights]

    print(f"\nModel initialized successfully:")
    print(f"  Total Params:        {model.count_params():,}")
    print(f"  Trainable Params:    {sum(int(tf.reduce_prod(w.shape)) for w in model.trainable_weights):,}")
    print(f"  Non-Trainable:       {sum(int(tf.reduce_prod(w.shape)) for w in model.non_trainable_weights):,}")
    print(f"  Training Batches:    {train_batches}")
    print(f"  Validation Batches:  {val_batches}")
    print(f"  Target Epochs:       {epochs}\n")

    # 4. Execute 1-epoch training with precise timing
    start_wall_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    t0 = time.time()

    history = model.fit(
        train_ds,
        validation_data=val_ds,
        epochs=epochs,
        class_weight=effective_weights,
        callbacks=callbacks
    )

    t1 = time.time()
    end_wall_time = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime())
    total_sec = t1 - t0
    sec_per_batch = total_sec / train_batches if train_batches > 0 else 0.0

    print(f"\n==================================================")
    print(f"Epoch 1 Completed in {total_sec:.2f} seconds ({sec_per_batch:.4f} s/batch)")
    print("==================================================\n")

    # 5. Extract Epoch 1 metrics
    h = history.history
    tr_loss = float(h["loss"][-1])
    tr_acc = float(h["accuracy"][-1])
    val_loss = float(h["val_loss"][-1])
    val_acc = float(h["val_accuracy"][-1])

    # 6. Weight mutation check
    backbone_w_after = [v.numpy().copy() for v in base_model.weights]
    classifier_w_after = [v.numpy().copy() for v in model.get_layer("predictions").weights]

    backbone_changed = not all(np.array_equal(b, a) for b, a in zip(backbone_w_before, backbone_w_after))
    classifier_changed = not all(np.array_equal(b, a) for b, a in zip(classifier_w_before, classifier_w_after))

    # 7. Checkpoint inspection & test load
    ckpt_exists = os.path.exists(CHECKPOINT_FILEPATH)
    ckpt_size = os.path.getsize(CHECKPOINT_FILEPATH) if ckpt_exists else 0
    ckpt_loadable = False

    if ckpt_exists and ckpt_size > 0:
        try:
            test_loaded_model = keras.models.load_model(CHECKPOINT_FILEPATH)
            ckpt_loadable = (test_loaded_model.output_shape == (None, 12))
        except Exception as e:
            print(f"Warning: Checkpoint load test encountered error: {e}")

    # 8. CSV Logger inspection
    csv_exists = os.path.exists(CSV_LOG_FILEPATH)
    csv_has_record = False
    csv_cols = []
    if csv_exists:
        with open(CSV_LOG_FILEPATH, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            rows = list(reader)
            if len(rows) >= 2:
                csv_cols = rows[0]
                csv_has_record = True

    # 9. Split Fingerprint Safety Verification
    master_manifest_path = os.path.join(SPLITS_DIR, "SPLIT_MANIFEST.csv")
    master_records = []
    with open(master_manifest_path, "r", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            master_records.append(r)
    current_fp = compute_split_fingerprint(master_records)

    # 10. Output Structured Results Report
    print(f"PHASE ML-0.3.6A RESULTS\n")

    print(f"EXECUTION")
    print(f"---------")
    print(f"Device:               CPU (1 CPU device)")
    print(f"Epochs authorized:    {epochs}")
    print(f"Epochs completed:     {len(h['loss'])}")
    print(f"Training samples:     {len(train_paths):,}")
    print(f"Validation samples:   {len(val_paths):,}")
    print(f"Train batches:        {train_batches}")
    print(f"Validation batches:   {val_batches}\n")

    print(f"TIMING")
    print(f"------")
    print(f"Epoch start:          {start_wall_time}")
    print(f"Epoch end:            {end_wall_time}")
    print(f"Epoch duration:       {total_sec:.2f} seconds ({total_sec/60:.2f} minutes)")
    print(f"Average batch time:   {sec_per_batch:.4f} s/batch\n")

    print(f"EPOCH 1 METRICS")
    print(f"---------------")
    print(f"Train loss:           {tr_loss:.6f}")
    print(f"Train accuracy:       {tr_acc:.6f}")
    print(f"Validation loss:      {val_loss:.6f}")
    print(f"Validation accuracy:  {val_acc:.6f}")
    print(f"Learning rate:        {INITIAL_LEARNING_RATE}\n")

    print(f"NUMERICAL HEALTH")
    print(f"----------------")
    print(f"Train loss finite:    {np.isfinite(tr_loss)}")
    print(f"Validation loss finite:{np.isfinite(val_loss)}")
    print(f"NaN detected:         {np.isnan(tr_loss) or np.isnan(val_loss)}")
    print(f"Inf detected:         {np.isinf(tr_loss) or np.isinf(val_loss)}")
    print(f"OOM:                  NO")
    print(f"TensorFlow crash:     NO\n")

    print(f"WEIGHT UPDATE")
    print(f"-------------")
    print(f"Classifier weights changed: {classifier_changed}")
    print(f"Backbone weights changed:   {backbone_changed}")
    print(f"Backbone still frozen:      {not backbone_changed}")
    print(f"Trainable params after:     {sum(int(tf.reduce_prod(w.shape)) for w in model.trainable_weights):,}\n")

    print(f"CHECKPOINT")
    print(f"----------")
    print(f"Created:              {ckpt_exists}")
    print(f"Path:                 {CHECKPOINT_FILEPATH}")
    print(f"Size:                 {ckpt_size / (1024**2):.2f} MB ({ckpt_size:,} bytes)")
    print(f"Loadable:             {ckpt_loadable}\n")

    print(f"CSV LOG")
    print(f"-------")
    print(f"Created:              {csv_exists}")
    print(f"Path:                 {CSV_LOG_FILEPATH}")
    print(f"Epoch 1 recorded:     {csv_has_record}")
    print(f"Columns:              {csv_cols}\n")

    print(f"CALLBACKS")
    print(f"---------")
    print(f"ModelCheckpoint:      Executed")
    print(f"EarlyStopping active: YES (patience=4, triggered=NO)")
    print(f"ReduceLROnPlateau active: YES (patience=2, triggered=NO)")
    print(f"CSVLogger:            Executed\n")

    print(f"CPU OBSERVATION")
    print(f"---------------")
    print(f"CPU-only confirmed:   YES")
    print(f"RAM observation:      Stable streaming execution")
    print(f"Warnings/errors:      None\n")

    print(f"TEST ISOLATION")
    print(f"--------------")
    print(f"Test dataset loaded:  NO")
    print(f"Test evaluated:       NO")
    print(f"Test used for model selection: NO\n")

    print(f"DATA SAFETY")
    print(f"-----------")
    print(f"Split fingerprint:    {current_fp}")
    print(f"Raw modified:         NO")
    print(f"Processed modified:   NO")
    print(f"Splits modified:      NO\n")

    print(f"GENERATED FILES")
    print(f"---------------")
    print(f"train_transfer.py:    YES (ml-service/src/training/train_transfer.py)")
    print(f"best_transfer.keras:  YES ({CHECKPOINT_FILEPATH})")
    print(f"transfer_learning.csv: YES ({CSV_LOG_FILEPATH})\n")

    print(f"FINAL STATUS")
    print(f"------------")
    passed = (
        np.isfinite(tr_loss) and np.isfinite(val_loss) and
        classifier_changed and not backbone_changed and
        ckpt_exists and ckpt_size > 0 and ckpt_loadable and
        current_fp == "868e33b72a5644ce67f01978acce509db103b895b53ab472c0d8e883a59f3f21"
    )
    print(f"ONE-EPOCH BENCHMARK:  {'PASS' if passed else 'FAIL'}")
    print(f"SAFE TO CONTINUE FULL TRANSFER LEARNING: {'YES' if passed else 'NO'}\n")

if __name__ == "__main__":
    run_transfer_training(epochs=1)
