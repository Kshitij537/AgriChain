import os
import csv
import sys
from collections import Counter

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from training_config import TRAIN_MANIFEST_PATH, CLASS_WEIGHT_CLIP_MAX

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

def compute_class_weights(train_csv_path=TRAIN_MANIFEST_PATH, clip_max=CLASS_WEIGHT_CLIP_MAX):
    if not os.path.exists(train_csv_path):
        raise FileNotFoundError(f"Training manifest not found: {train_csv_path}")
        
    counts = Counter()
    with open(train_csv_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            counts[int(row["class_index"])] += 1
            
    total_samples = sum(counts.values())
    num_classes = 12
    
    if total_samples != 26640:
        raise ValueError(f"Training sample count mismatch! Expected 26,640, got {total_samples}")
        
    raw_weights = {}
    effective_weights = {}
    detailed_table = []
    
    for idx in range(num_classes):
        n_c = counts[idx]
        if n_c == 0:
            raise ValueError(f"Class index {idx} has zero training samples!")
            
        # Balanced formula: N / (K * n_c)
        raw_w = total_samples / (num_classes * n_c)
        eff_w = min(raw_w, clip_max) if clip_max > 0 else raw_w
        
        raw_weights[idx] = round(raw_w, 4)
        effective_weights[idx] = round(eff_w, 4)
        
        pct = (n_c / total_samples) * 100.0
        clipped = raw_w > clip_max
        
        detailed_table.append({
            "index": idx,
            "name": CLASS_INDEX_TO_NAME[idx],
            "count": n_c,
            "pct": round(pct, 2),
            "raw_weight": round(raw_w, 4),
            "effective_weight": round(eff_w, 4),
            "clipped": "YES" if clipped else "NO"
        })
        
    return effective_weights, raw_weights, detailed_table

if __name__ == "__main__":
    eff_w, raw_w, table = compute_class_weights()
    print("Class Weights Calculated Successfully:")
    for row in table:
        print(f"Class {row['index']:2d} ({row['name']}): count={row['count']:5d} ({row['pct']:5.2f}%), raw_w={row['raw_weight']:7.4f}, eff_w={row['effective_weight']:5.4f}, clipped={row['clipped']}")
