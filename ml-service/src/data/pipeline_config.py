import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
SPLITS_DIR = os.path.join(PROJECT_ROOT, "dataset", "splits")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")
CHECKSUMS_PATH = os.path.join(REPORTS_DIR, "DATASET_CHECKSUMS.json")

IMAGE_HEIGHT = 224
IMAGE_WIDTH = 224
IMAGE_SIZE = (224, 224)
CHANNELS = 3

BATCH_SIZE = 32
NUM_CLASSES = 12

SHUFFLE_BUFFER_SIZE = 10000
RANDOM_SEED = 42

RAM_CACHE = False

# Frozen class mapping reference
CLASS_INDEX_TO_NAME = {
    0: "Cotton Healthy",
    1: "Cotton Bacterial Blight",
    2: "Cotton Alternaria Leaf Spot",
    3: "Cotton Leaf Curl Virus",
    4: "Soybean Healthy",
    5: "Soybean Rust",
    6: "Soybean Bacterial Pustule",
    7: "Soybean Brown Spot",
    8: "Orange Healthy",
    9: "Orange Citrus Canker",
    10: "Orange Black Spot",
    11: "Orange Greening"
}
