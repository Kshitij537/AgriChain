import os
import json
import csv
from collections import defaultdict
from .common import log_message
from .config import REPORTS_DIR

def run_statistics():
    log_message("Starting Dataset Statistics Generation...")
    manifest_path = os.path.join(REPORTS_DIR, "DATASET_MANIFEST.csv")
    stats_json_path = os.path.join(REPORTS_DIR, "DATASET_STATS.json")
    
    if not os.path.exists(manifest_path):
        log_message("Error: Manifest file does not exist. Please run metadata module first.")
        return False
        
    total_images = 0
    crop_dist = defaultdict(int)
    class_dist = defaultdict(int)
    formats = defaultdict(int)
    
    widths = []
    heights = []
    
    with open(manifest_path, "r", encoding="utf-8") as csvfile:
        reader = csv.DictReader(csvfile)
        for row in reader:
            total_images += 1
            crop_dist[row["crop"]] += 1
            class_dist[f"{row['crop']}/{row['disease']}"] += 1
            formats[row["extension"].upper()] += 1
            
            try:
                w = int(row["width"])
                h = int(row["height"])
                if w > 0 and h > 0:
                    widths.append(w)
                    heights.append(h)
            except ValueError:
                pass
                
    if total_images == 0:
        log_message("Warning: No records found in manifest.")
        return False

    avg_w = sum(widths) / len(widths) if widths else 0
    avg_h = sum(heights) / len(heights) if heights else 0
    min_w = min(widths) if widths else 0
    min_h = min(heights) if heights else 0
    max_w = max(widths) if widths else 0
    max_h = max(heights) if heights else 0
    
    # Class imbalances
    class_counts = list(class_dist.values())
    largest_class = max(class_dist, key=class_dist.get) if class_dist else "none"
    smallest_class = min(class_dist, key=class_dist.get) if class_dist else "none"
    
    largest_count = class_dist[largest_class] if class_dist else 0
    smallest_count = class_dist[smallest_class] if class_dist else 1
    imbalance_ratio = round(largest_count / smallest_count, 2) if smallest_count > 0 else 0
    
    stats_data = {
        "total_images": total_images,
        "total_classes": len(class_dist),
        "crop_distribution": dict(crop_dist),
        "class_distribution": dict(class_dist),
        "image_formats": dict(formats),
        "average_resolution": {"width": round(avg_w, 2), "height": round(avg_h, 2)},
        "min_resolution": {"width": min_w, "height": min_h},
        "max_resolution": {"width": max_w, "height": max_h},
        "largest_class": largest_class,
        "smallest_class": smallest_class,
        "imbalance_ratio": imbalance_ratio
    }
    
    log_message("Writing DATASET_STATS.json...")
    with open(stats_json_path, "w", encoding="utf-8") as f:
        json.dump(stats_data, f, indent=2)
        
    log_message(f"Statistics generated. Total images: {total_images}. Imbalance Ratio: {imbalance_ratio}.")
    return True
