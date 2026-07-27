import os
import shutil
import re
from collections import defaultdict

# Path Constants
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW_DIR = os.path.join(PROJECT_ROOT, "dataset", "raw")
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")
REPORT_FILE = os.path.join(REPORTS_DIR, "DATASET_REPORT.md")

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

# Target 12 Frozen V1 Classes
TARGET_CLASSES = {
    "cotton": ["Healthy", "Bacterial_Blight", "Alternaria_Leaf_Spot", "Leaf_Curl_Virus"],
    "soybean": ["Healthy", "Rust", "Bacterial_Pustule", "Brown_Spot"],
    "orange": ["Healthy", "Citrus_Canker", "Black_Spot", "Greening"]
}

# Source Dataset Tracking
new_images_count = 0
source_dataset_imports = defaultdict(int)

def normalize_string(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def classify_folder(crop, relative_dir_parts):
    """
    Classifies a folder path based on crop and directory names.
    Returns (target_class, is_ignored, ignore_reason)
    """
    path_normalized = [normalize_string(p) for p in relative_dir_parts]
    path_text = "_".join(path_normalized)

    # Skip Cotton_Augmented_Dataset
    if "cottonaugmenteddataset" in path_text:
        return None, True, "Cotton_Augmented_Dataset"

    # Preprocessed HOG etc should be ignored
    if "hog" in path_text or "blackandwhite" in path_text or "bw" in path_text:
        return None, True, "Preprocessed Feature HOG/BW Data"

    if crop == "cotton":
        # Ignored classes
        if any(k in path_text for k in ["fusarium", "verticillium"]):
            return None, True, "Fusarium/Verticillium Wilt"

        if any(k in path_text for k in ["cottonleafcurldisease", "leafcurlvirus", "clcud", "curl"]):
            return "Leaf_Curl_Virus", False, None
        if any(k in path_text for k in ["alternarialeafspot", "alternaria"]):
            return "Alternaria_Leaf_Spot", False, None
        if any(k in path_text for k in ["bacterialblight", "angularleafspot", "angular"]):
            return "Bacterial_Blight", False, None
        if any(k in path_text for k in ["healthyleaf", "healthy", "fresh", "normal"]) and "unhealthy" not in path_text:
            return "Healthy", False, None
        if "blight" in path_text and "alternaria" not in path_text:
            return "Bacterial_Blight", False, None

    elif crop == "soybean":
        # Ignored classes
        ignored_keywords = {
            "powdery_mildew": ["powdery", "mildew"],
            "frogeye_leaf_spot": ["frogeye"],
            "septoria": ["septoria"],
            "southern_blight": ["southern", "blight"],
            "target_leaf_spot": ["target"],
            "sudden_death_syndrome": ["suddendeath"],
            "yellow_mosaic": ["yellowmosaic"],
            "mosaic_virus": ["mossaic", "mosaic"],
            "caterpillar": ["caterpillar"],
            "diabrotica_speciosa": ["diabrotica"]
        }
        for name, kws in ignored_keywords.items():
            if any(k in path_text for k in kws):
                return None, True, name.replace("_", " ").capitalize()

        if "rust" in path_text or "ferrugem" in path_text or "ferrugen" in path_text:
            return "Rust", False, None
        if "pustule" in path_text or "pustula" in path_text:
            return "Bacterial_Pustule", False, None
        if "brownspot" in path_text or "brown" in path_text:
            return "Brown_Spot", False, None
        if any(k in path_text for k in ["healthy", "healty", "saudavel", "normal"]) and "unhealthy" not in path_text:
            return "Healthy", False, None

    elif crop == "orange":
        # Ignored classes
        ignored_keywords = {
            "nutrient_deficiency": ["nutrient", "deficiency"],
            "multiple_diseases": ["multiple", "multiplediseases"]
        }
        for name, kws in ignored_keywords.items():
            if any(k in path_text for k in kws):
                return None, True, name.replace("_", " ").capitalize()

        if any(k in path_text for k in ["citruscanker", "orangecanker", "canker"]):
            return "Citrus_Canker", False, None
        if any(k in path_text for k in ["citrusblackspot", "blackspot"]):
            return "Black_Spot", False, None
        if any(k in path_text for k in ["greening", "grenning", "hlb", "huanglongbing"]):
            return "Greening", False, None
        if any(k in path_text for k in ["healthy", "citrushealthy", "fresh", "normal"]) and "unhealthy" not in path_text:
            return "Healthy", False, None

    return None, False, "Unmapped Folder"

def run_consolidation():
    global new_images_count
    print("Starting Dataset Consolidation & Standardization...")

    # Wipe existing processed folder to avoid leftovers
    if os.path.exists(PROCESSED_DIR):
        print(f"Cleaning existing processed directory: {PROCESSED_DIR}")
        shutil.rmtree(PROCESSED_DIR)

    # Re-create processed directory structure
    for crop, classes in TARGET_CLASSES.items():
        for cls in classes:
            os.makedirs(os.path.join(PROCESSED_DIR, crop, cls), exist_ok=True)

    os.makedirs(REPORTS_DIR, exist_ok=True)

    # Counts & Trackers
    processed_counts = {crop: {cls: 0 for cls in classes} for crop, classes in TARGET_CLASSES.items()}
    file_counters = {crop: {cls: 1 for cls in classes} for crop, classes in TARGET_CLASSES.items()}
    ignored_class_counts = defaultdict(int)
    unknown_folders = defaultdict(int)
    unsupported_files = defaultdict(int)

    # Walk raw directory
    for root, dirs, files in os.walk(RAW_DIR):
        if not files:
            continue

        rel_path = os.path.relpath(root, RAW_DIR)
        parts = rel_path.split(os.sep)

        if not parts or parts[0] == ".":
            continue

        top_folder = parts[0]
        top_folder_lower = top_folder.lower()

        # Identify crop
        if "cotton" in top_folder_lower:
            crop = "cotton"
        elif "soybean" in top_folder_lower:
            crop = "soybean"
        elif "orange" in top_folder_lower or "citrus" in top_folder_lower:
            crop = "orange"
        elif "newds" in top_folder_lower:
            # newDS contains mixed crop subfolders, check subpath parts
            subpath = "_".join([p.lower() for p in parts])
            if "cotton" in subpath:
                crop = "cotton"
            elif "soybean" in subpath:
                crop = "soybean"
            elif "orange" in subpath or "citrus" in subpath:
                crop = "orange"
            else:
                crop = "unknown"
        else:
            crop = "unknown"

        if crop == "unknown":
            continue

        # Classify the folder
        folder_class, is_ignored, reason = classify_folder(crop, parts)

        # Track dataset sources for new imports (newDS and Cotton Leaf Image Dataset)
        is_new_dataset = ("newds" in top_folder_lower) or ("cotton leaf image dataset" in top_folder_lower)

        for file_name in files:
            file_ext = os.path.splitext(file_name)[1].lower()
            file_path = os.path.join(root, file_name)

            if file_ext not in SUPPORTED_EXTENSIONS:
                unsupported_files[file_ext] += 1
                continue

            if is_ignored:
                ignored_class_counts[reason] += 1
                continue

            if folder_class is None:
                unknown_folders[os.path.join(*parts)] += 1
                continue

            # Generate target file name
            counter = file_counters[crop][folder_class]
            new_file_name = f"{crop}_{folder_class.lower()}_{counter:06d}{file_ext}"
            file_counters[crop][folder_class] += 1

            dest_dir = os.path.join(PROCESSED_DIR, crop, folder_class)
            dest_file_path = os.path.join(dest_dir, new_file_name)

            shutil.copy2(file_path, dest_file_path)
            processed_counts[crop][folder_class] += 1

            # Count new dataset imports
            if is_new_dataset:
                new_images_count += 1
                source_dataset_imports[top_folder] += 1

    # Write report
    print("Generating DATASET_REPORT.md...")
    with open(REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("# Dataset Standardization & Consolidation Report\n\n")
        f.write("This report documents the consolidation of raw downloaded datasets into the standardized AgriChain Version 1 format.\n\n")

        # Section 1: Final count table
        f.write("## 1. Final Image Count Per Class\n\n")
        f.write("| Crop | Disease Class | Class ID | Consolidated Count | Target | Status |\n")
        f.write("| :--- | :--- | :---: | :---: | :---: | :--- |\n")

        total_all_images = 0
        for crop, classes in TARGET_CLASSES.items():
            for idx, cls in enumerate(classes, 1):
                count = processed_counts[crop][cls]
                total_all_images += count
                crop_code = crop[0].upper()
                class_id = f"{crop_code}{idx:02d}"

                if count >= 500:
                    status = "OK"
                elif count > 0:
                    status = "Needs More"
                else:
                    status = "Missing"

                f.write(f"| **{crop.capitalize()}** | {cls.replace('_', ' ')} | `{class_id}` | {count} | 500 | **{status}** |\n")

        f.write(f"\n**Total Consolidated Images**: `{total_all_images}`\n\n")

        # Section 2: Imported Images
        f.write("## 2. Imported Images\n\n")
        f.write(f"Total newly imported images from external datasets: `{new_images_count}`\n\n")
        f.write("| Source Raw Dataset | Count of Imported Images |\n")
        f.write("| :--- | :---: |\n")
        for src, count in sorted(source_dataset_imports.items()):
            f.write(f"| `{src}` | {count} |\n")

        # Section 3: Ignored Classes
        f.write("\n## 3. Ignored & Excluded Classes (Outside V1 Scope)\n\n")
        if ignored_class_counts:
            f.write("| Disease/Pest Name | Ignored File Count |\n")
            f.write("| :--- | :---: |\n")
            for reason, count in sorted(ignored_class_counts.items()):
                if reason != "Cotton_Augmented_Dataset":
                    f.write(f"| `{reason}` | {count} |\n")
        else:
            f.write("No explicit ignored folders found.\n")

        # Section 4: Skipped Augmented Dataset
        f.write("\n## 4. Skipped Augmented Dataset\n\n")
        f.write("| Dataset Folder | Status | Reason |\n")
        f.write("| :--- | :---: | :--- |\n")
        f.write("| `Cotton_Augmented_Dataset` | **Skipped** | Synthetic augmentations will be generated during ML training. |\n")

        # Section 5: Unknown Folders
        f.write("\n## 5. Unknown / Unmapped Folders\n\n")
        if unknown_folders:
            f.write("| Relative Folder Path | File Count |\n")
            f.write("| :--- | :---: |\n")
            for folder, count in sorted(unknown_folders.items()):
                f.write(f"| `{folder}` | {count} |\n")
        else:
            f.write("None! All folders successfully mapped.\n")

    print("Consolidation Complete! Report written to:", REPORT_FILE)
    print(f"Total Consolidated Images: {total_all_images}")
    print(f"Total Newly Imported Images: {new_images_count}")

if __name__ == "__main__":
    run_consolidation()
