import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")
SPLITS_DIR = os.path.join(PROJECT_ROOT, "dataset", "splits")

MANIFEST_PATH = os.path.join(REPORTS_DIR, "DATASET_MANIFEST.csv")
LEAKAGE_GROUPS_PATH = os.path.join(REPORTS_DIR, "LEAKAGE_GROUPS.csv")
CHECKSUMS_PATH = os.path.join(REPORTS_DIR, "DATASET_CHECKSUMS.json")

TRAIN_RATIO = 0.70
VALIDATION_RATIO = 0.15
TEST_RATIO = 0.15

RANDOM_SEED = 42
