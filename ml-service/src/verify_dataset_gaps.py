import os
import re
from collections import defaultdict

# Path Constants
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RAW_DIR = os.path.join(PROJECT_ROOT, "dataset", "raw")
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")
MISSING_REPORT_FILE = os.path.join(REPORTS_DIR, "MISSING_CLASSES.md")

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}

TARGET_CLASSES = {
    "cotton": ["Healthy", "Bacterial_Blight", "Alternaria_Leaf_Spot", "Leaf_Curl_Virus"],
    "soybean": ["Healthy", "Rust", "Downy_Mildew", "Bacterial_Pustule"],
    "orange": ["Healthy", "Citrus_Canker", "Black_Spot", "Greening"]
}

def normalize_string(s):
    return re.sub(r'[^a-z0-9]', '', s.lower())

def run_gap_analysis():
    print("Starting Dataset Gap Analysis & Raw Inspection (READ-ONLY)...")

    leaf_folders = []
    target_keyword_matches = []
    
    # Target keywords to specifically search for
    search_keywords = {
        "cotton_alternaria": ["alternaria", "macrospora"],
        "soybean_downy": ["downy", "mildew", "peronospora"]
    }

    # Track processed image counts from current dataset/processed
    processed_counts = {crop: {cls: 0 for cls in classes} for crop, classes in TARGET_CLASSES.items()}
    
    for crop, classes in TARGET_CLASSES.items():
        for cls in classes:
            class_path = os.path.join(PROCESSED_DIR, crop, cls)
            if os.path.exists(class_path):
                img_count = sum(1 for f in os.listdir(class_path) if os.path.splitext(f)[1].lower() in SUPPORTED_EXTENSIONS)
                processed_counts[crop][cls] = img_count

    # Recursively inspect dataset/raw
    for root, dirs, files in os.walk(RAW_DIR):
        img_files = [f for f in files if os.path.splitext(f)[1].lower() in SUPPORTED_EXTENSIONS]
        if not img_files:
            continue

        rel_path = os.path.relpath(root, RAW_DIR)
        path_lower = rel_path.lower()

        leaf_folders.append({
            "rel_path": rel_path,
            "img_count": len(img_files)
        })

        # Check for specific target keywords
        for key, kws in search_keywords.items():
            for kw in kws:
                if kw in path_lower:
                    target_keyword_matches.append({
                        "key": key,
                        "keyword": kw,
                        "rel_path": rel_path,
                        "img_count": len(img_files)
                    })

    # Prepare MISSING_CLASSES.md report
    print("Generating dataset/reports/MISSING_CLASSES.md...")
    os.makedirs(REPORTS_DIR, exist_ok=True)

    with open(MISSING_REPORT_FILE, "w", encoding="utf-8") as f:
        f.write("# Dataset Gap Analysis & Missing Class Verification Report\n\n")
        f.write("This report provides a read-only audit of `dataset/raw/` to verify missing disease classes and evaluate class balance status.\n\n")

        # Section 1: Image Count & Balance Table
        f.write("## 1. Class Image Count & Balance Summary\n\n")
        f.write("| Crop | Disease Class | Class ID | Current Count | Target | Status |\n")
        f.write("| :--- | :--- | :---: | :---: | :---: | :--- |\n")

        for crop, classes in TARGET_CLASSES.items():
            for idx, cls in enumerate(classes, 1):
                count = processed_counts[crop][cls]
                crop_code = crop[0].upper()
                class_id = f"{crop_code}{idx:02d}"

                if count >= 500:
                    status = "OK (≥500)"
                elif count > 0:
                    status = "Needs More (1–499)"
                else:
                    status = "Missing (0)"

                f.write(f"| **{crop.capitalize()}** | {cls.replace('_', ' ')} | `{class_id}` | {count} | 500 | **{status}** |\n")

        # Section 2: Targeted Search for Missing Classes
        f.write("\n## 2. Deep Search Results for Missing Classes\n\n")
        
        # Cotton Alternaria
        f.write("### A. Cotton — Alternaria Leaf Spot (`alternaria`, `macrospora`)\n\n")
        cotton_matches = [m for m in target_keyword_matches if m["key"] == "cotton_alternaria"]
        if cotton_matches:
            f.write("**Found**: YES\n\n")
            f.write("| Raw Relative Location | Matching Keyword | Image Count | Mapped Status |\n")
            f.write("| :--- | :--- | :---: | :--- |\n")
            for m in cotton_matches:
                f.write(f"| `{m['rel_path']}` | `{m['keyword']}` | {m['img_count']} | Unmapped |\n")
        else:
            f.write("- **Found**: NO\n")
            f.write("- **Raw Audit Status**: Checked all raw folders; no folder names contain `alternaria` or `macrospora`.\n")
            f.write("- **Recommendation**: Download an external dataset containing Cotton Alternaria Leaf Spot.\n\n")

        # Soybean Downy Mildew
        f.write("### B. Soybean — Downy Mildew (`downy`, `mildew`, `peronospora`)\n\n")
        soybean_matches = [m for m in target_keyword_matches if m["key"] == "soybean_downy"]
        if soybean_matches:
            f.write("**Found**: YES\n\n")
            f.write("| Raw Relative Location | Matching Keyword | Image Count | Mapped Status |\n")
            f.write("| :--- | :--- | :---: | :--- |\n")
            for m in soybean_matches:
                f.write(f"| `{m['rel_path']}` | `{m['keyword']}` | {m['img_count']} | Unmapped |\n")
        else:
            f.write("- **Found**: NO\n")
            f.write("- **Raw Audit Status**: Checked all raw folders; no folder names contain `downy`, `mildew`, or `peronospora`.\n")
            f.write("- **Recommendation**: Download an external dataset containing Soybean Downy Mildew.\n\n")

        # Section 3: Full Raw Leaf Folder Discovery Audit
        f.write("## 3. Full Raw Leaf Folder Discovery Audit\n\n")
        f.write("Total raw leaf folders containing images: `{}`\n\n".format(len(leaf_folders)))
        f.write("| Relative Raw Folder Path | Image Count |\n")
        f.write("| :--- | :---: |\n")
        for lf in sorted(leaf_folders, key=lambda x: x["rel_path"]):
            f.write(f"| `{lf['rel_path']}` | {lf['img_count']} |\n")

    print("Gap Analysis Complete! Report written to:", MISSING_REPORT_FILE)

if __name__ == "__main__":
    run_gap_analysis()
