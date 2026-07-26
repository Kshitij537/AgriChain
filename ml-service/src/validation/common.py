import os
import datetime
from .config import PROCESSED_DIR, REPORTS_DIR, SUPPORTED_EXTENSIONS, CLASS_MAPPING

def get_log_file():
    os.makedirs(REPORTS_DIR, exist_ok=True)
    return os.path.join(REPORTS_DIR, "validation.log")

def log_message(message):
    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    log_line = f"[{timestamp}] {message}"
    print(log_line)
    
    with open(get_log_file(), "a", encoding="utf-8") as f:
        f.write(log_line + "\n")

def scan_processed_images():
    """
    Recursively scans PROCESSED_DIR and maps images to their crop and disease classes.
    """
    images = []
    if not os.path.exists(PROCESSED_DIR):
        log_message(f"Warning: Processed directory {PROCESSED_DIR} does not exist.")
        return images

    for root, _, files in os.walk(PROCESSED_DIR):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, PROCESSED_DIR)
                
                # Deduce crop and class from path parts
                parts = rel_path.split(os.sep)
                if len(parts) >= 2:
                    crop = parts[0]
                    disease = parts[1]
                    class_key = f"{crop}/{disease}"
                    
                    if class_key in CLASS_MAPPING:
                        images.append({
                            "file_name": file,
                            "abs_path": abs_path,
                            "rel_path": rel_path,
                            "crop": crop,
                            "disease": disease,
                            "class_key": class_key,
                            "extension": ext[1:]
                        })
    return images
