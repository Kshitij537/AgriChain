import os

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")
RAW_DIR = os.path.join(PROJECT_ROOT, "dataset", "raw")

# Near-Duplicate Calibration Configurations (Phase ML-0.2.6A)
HASH_METHOD = "phash_ahash_combined"
AHASH_CANDIDATE_THRESHOLD = 2
PHASH_THRESHOLD = 4
NEAR_DUPLICATE_RULE_VERSION = "v2_phash_calibrated"

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Class Map listing index, crop, disease class name, and class code
CLASS_MAPPING = {
    # Cotton
    "cotton/Healthy": {"index": 0, "crop": "cotton", "disease": "Healthy", "code": "C01"},
    "cotton/Bacterial_Blight": {"index": 1, "crop": "cotton", "disease": "Bacterial_Blight", "code": "C02"},
    "cotton/Alternaria_Leaf_Spot": {"index": 2, "crop": "cotton", "disease": "Alternaria_Leaf_Spot", "code": "C03"},
    "cotton/Leaf_Curl_Virus": {"index": 3, "crop": "cotton", "disease": "Leaf_Curl_Virus", "code": "C04"},

    # Soybean
    "soybean/Healthy": {"index": 4, "crop": "soybean", "disease": "Healthy", "code": "S01"},
    "soybean/Rust": {"index": 5, "crop": "soybean", "disease": "Rust", "code": "S02"},
    "soybean/Bacterial_Pustule": {"index": 6, "crop": "soybean", "disease": "Bacterial_Pustule", "code": "S03"},
    "soybean/Brown_Spot": {"index": 7, "crop": "soybean", "disease": "Brown_Spot", "code": "S04"},

    # Orange
    "orange/Healthy": {"index": 8, "crop": "orange", "disease": "Healthy", "code": "O01"},
    "orange/Citrus_Canker": {"index": 9, "crop": "orange", "disease": "Citrus_Canker", "code": "O02"},
    "orange/Black_Spot": {"index": 10, "crop": "orange", "disease": "Black_Spot", "code": "O03"},
    "orange/Greening": {"index": 11, "crop": "orange", "disease": "Greening", "code": "O04"},
}
