import numpy as np

# Frozen 12-class production mapping for AgriChain V1
# DO NOT REORDER OR CHANGE THESE CLASS INDICES

CLASS_METADATA = {
    0: {
        "class_index": 0,
        "crop": "Cotton",
        "disease": "Healthy",
        "display_name": "Cotton Healthy",
        "is_healthy": True
    },
    1: {
        "class_index": 1,
        "crop": "Cotton",
        "disease": "Bacterial Blight",
        "display_name": "Cotton Bacterial Blight",
        "is_healthy": False
    },
    2: {
        "class_index": 2,
        "crop": "Cotton",
        "disease": "Alternaria Leaf Spot",
        "display_name": "Cotton Alternaria Leaf Spot",
        "is_healthy": False
    },
    3: {
        "class_index": 3,
        "crop": "Cotton",
        "disease": "Leaf Curl Virus",
        "display_name": "Cotton Leaf Curl Virus",
        "is_healthy": False
    },
    4: {
        "class_index": 4,
        "crop": "Soybean",
        "disease": "Healthy",
        "display_name": "Soybean Healthy",
        "is_healthy": True
    },
    5: {
        "class_index": 5,
        "crop": "Soybean",
        "disease": "Rust",
        "display_name": "Soybean Rust",
        "is_healthy": False
    },
    6: {
        "class_index": 6,
        "crop": "Soybean",
        "disease": "Bacterial Pustule",
        "display_name": "Soybean Bacterial Pustule",
        "is_healthy": False
    },
    7: {
        "class_index": 7,
        "crop": "Soybean",
        "disease": "Brown Spot",
        "display_name": "Soybean Brown Spot",
        "is_healthy": False
    },
    8: {
        "class_index": 8,
        "crop": "Orange",
        "disease": "Healthy",
        "display_name": "Orange Healthy",
        "is_healthy": True
    },
    9: {
        "class_index": 9,
        "crop": "Orange",
        "disease": "Citrus Canker",
        "display_name": "Orange Citrus Canker",
        "is_healthy": False
    },
    10: {
        "class_index": 10,
        "crop": "Orange",
        "disease": "Black Spot",
        "display_name": "Orange Black Spot",
        "is_healthy": False
    },
    11: {
        "class_index": 11,
        "crop": "Orange",
        "disease": "Greening",
        "display_name": "Orange Greening",
        "is_healthy": False
    }
}

CLASS_NAMES = [CLASS_METADATA[i]["display_name"] for i in range(12)]

def get_class_metadata(class_index: int) -> dict:
    """Return frozen metadata dictionary for given class index (0..11)."""
    if not isinstance(class_index, (int, np.integer)) or class_index not in CLASS_METADATA:
        raise ValueError(f"Invalid class_index: {class_index}. Must be an integer between 0 and 11.")
    return dict(CLASS_METADATA[int(class_index)])
