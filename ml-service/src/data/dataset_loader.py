import os
import csv
import sys
import tensorflow as tf

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from pipeline_config import (
    PROJECT_ROOT, SPLITS_DIR, IMAGE_HEIGHT, IMAGE_WIDTH,
    CHANNELS, BATCH_SIZE, NUM_CLASSES, SHUFFLE_BUFFER_SIZE,
    RANDOM_SEED, RAM_CACHE, CLASS_INDEX_TO_NAME
)

EXPECTED_ROW_COUNTS = {
    "train": 26640,
    "validation": 5706,
    "test": 5704
}

def load_manifest(split_name):
    if split_name not in ["train", "validation", "test"]:
        raise ValueError(f"Invalid split name '{split_name}'. Must be train, validation, or test.")
        
    csv_path = os.path.join(SPLITS_DIR, f"{split_name}.csv")
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"Manifest file not found: {csv_path}")
        
    paths = []
    labels = []
    
    with open(csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for idx, row in enumerate(reader, 1):
            rel_path = row["processed_path"]
            # Convert 'processed/crop/disease/file.jpg' to absolute path
            abs_path = os.path.normpath(os.path.join(PROJECT_ROOT, "dataset", rel_path.replace("/", os.sep)))
            
            if not os.path.exists(abs_path):
                raise FileNotFoundError(f"Image path does not exist on disk at row {idx}: {abs_path}")
                
            class_idx = int(row["class_index"])
            if class_idx < 0 or class_idx >= NUM_CLASSES:
                raise ValueError(f"Invalid class index {class_idx} at row {idx} for path {abs_path}")
                
            paths.append(abs_path)
            labels.append(class_idx)
            
    expected_count = EXPECTED_ROW_COUNTS[split_name]
    if len(paths) != expected_count:
        raise ValueError(f"Split '{split_name}' row count mismatch! Expected {expected_count}, loaded {len(paths)}")
        
    return paths, labels

def parse_and_process_image(path, label):
    # Load raw file bytes
    image_bytes = tf.io.read_file(path)
    # Decode image (handles JPEG, PNG, BMP, WEBP)
    image = tf.io.decode_image(image_bytes, channels=CHANNELS, expand_animations=False)
    image.set_shape([None, None, CHANNELS])
    # Resize to target 224x224
    image = tf.image.resize(image, [IMAGE_HEIGHT, IMAGE_WIDTH], method=tf.image.ResizeMethod.BILINEAR)
    # Cast to float32 range [0.0, 255.0] for EfficientNetB0 built-in rescaling layer
    image = tf.cast(image, tf.float32)
    label = tf.cast(label, tf.int32)
    return image, label

def create_dataset(split_name, training=False, batch_size=BATCH_SIZE, ram_cache=RAM_CACHE):
    paths, labels = load_manifest(split_name)
    
    dataset = tf.data.Dataset.from_tensor_slices((paths, labels))
    
    if training:
        dataset = dataset.shuffle(
            buffer_size=SHUFFLE_BUFFER_SIZE,
            seed=RANDOM_SEED,
            reshuffle_each_iteration=True
        )
        
    dataset = dataset.map(parse_and_process_image, num_parallel_calls=tf.data.AUTOTUNE)
    
    if ram_cache:
        dataset = dataset.cache()
        
    dataset = dataset.batch(batch_size, drop_remainder=False)
    dataset = dataset.prefetch(buffer_size=tf.data.AUTOTUNE)
    
    return dataset

def create_all_datasets(batch_size=BATCH_SIZE, ram_cache=RAM_CACHE):
    train_ds = create_dataset("train", training=True, batch_size=batch_size, ram_cache=ram_cache)
    val_ds = create_dataset("validation", training=False, batch_size=batch_size, ram_cache=ram_cache)
    test_ds = create_dataset("test", training=False, batch_size=batch_size, ram_cache=ram_cache)
    return train_ds, val_ds, test_ds
