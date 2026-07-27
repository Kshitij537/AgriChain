import os
import csv
from PIL import Image
from .common import log_message, scan_processed_images
from .config import REPORTS_DIR, CLASS_MAPPING, RAW_DIR, SUPPORTED_EXTENSIONS

def generate_manifest():
    log_message("Starting Dataset Manifest Generation...")
    images = scan_processed_images()
    
    # Build raw lookup mapping: (filename, size_bytes) -> original raw dataset folder name
    log_message("Indexing raw dataset folders for original_source tracing...")
    raw_lookup = {}
    if os.path.exists(RAW_DIR):
        for root, _, files in os.walk(RAW_DIR):
            for file in files:
                ext = os.path.splitext(file)[1].lower()
                if ext in SUPPORTED_EXTENSIONS:
                    abs_path = os.path.join(root, file)
                    size = os.path.getsize(abs_path)
                    parts = os.path.relpath(root, RAW_DIR).split(os.sep)
                    if parts and parts[0] != ".":
                        raw_lookup[(file, size)] = parts[0]

    # Load leakage group mappings from LEAKAGE_GROUPS.csv if it exists
    leakage_groups = {}
    leakage_groups_csv = os.path.join(REPORTS_DIR, "LEAKAGE_GROUPS.csv")
    if os.path.exists(leakage_groups_csv):
        try:
            with open(leakage_groups_csv, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    leakage_groups[row["processed_path"]] = row["leakage_group_id"]
        except Exception as e:
            log_message(f"Warning: Failed to load leakage groups: {str(e)}")

    manifest_path = os.path.join(REPORTS_DIR, "DATASET_MANIFEST.csv")
    log_message("Writing DATASET_MANIFEST.csv...")
    
    headers = [
        "image_name", "crop", "disease", "class_id", "class_index",
        "original_source", "processed_path", "extension", "file_size",
        "width", "height", "leakage_group_id"
    ]
    
    written_count = 0
    with open(manifest_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=headers)
        writer.writeheader()
        
        for idx, img_meta in enumerate(images, 1):
            path = img_meta["abs_path"]
            rel_path = img_meta["rel_path"]
            file_size = os.path.getsize(path)
            
            # Retrieve original source folder name using file size
            # Since processed files keep the same content, we can match size + extension or try to find a raw match
            original_source = "unknown"
            # Try to match raw files by walking raw_lookup
            # We can't use original filename since it was renamed, but we can search raw_lookup for matching size
            matches = [v for k, v in raw_lookup.items() if k[1] == file_size]
            if matches:
                original_source = matches[0]
            
            width, height = 0, 0
            try:
                with Image.open(path) as img:
                    width, height = img.size
            except Exception:
                pass
                
            class_info = CLASS_MAPPING.get(img_meta["class_key"], {"index": -1, "code": "unknown"})
            proc_path = os.path.join("processed", rel_path).replace("\\", "/")
            
            writer.writerow({
                "image_name": img_meta["file_name"],
                "crop": img_meta["crop"],
                "disease": img_meta["disease"],
                "class_id": class_info["code"],
                "class_index": class_info["index"],
                "original_source": original_source,
                "processed_path": proc_path,
                "extension": img_meta["extension"],
                "file_size": file_size,
                "width": width,
                "height": height,
                "leakage_group_id": leakage_groups.get(proc_path, "unknown")
            })
            written_count += 1
            
            if idx % 10000 == 0:
                log_message(f"Written {idx}/{len(images)} rows...")
                
    log_message(f"Manifest generation complete. Total records written: {written_count}.")
    return True
