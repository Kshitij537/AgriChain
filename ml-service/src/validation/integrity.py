import os
from PIL import Image
from .common import log_message, scan_processed_images
from .config import REPORTS_DIR

def run_integrity_check():
    log_message("Starting Image Integrity Validation...")
    images = scan_processed_images()
    
    corrupt_files = []
    zero_byte_files = []
    small_files = []
    total_scanned = 0
    
    for img_meta in images:
        total_scanned += 1
        path = img_meta["abs_path"]
        rel_path = img_meta["rel_path"]
        
        # Check 1: Zero-byte files
        file_size = os.path.getsize(path)
        if file_size == 0:
            zero_byte_files.append((rel_path, "Zero-byte file size"))
            continue
            
        # Check 2: Try to open and verify the image
        try:
            with Image.open(path) as img:
                img.verify()
                
            # Reopen to check dimensions (verify() invalidates image object)
            with Image.open(path) as img:
                width, height = img.size
                if width < 64 or height < 64:
                    small_files.append((rel_path, f"Dimensions too small: {width}x{height}"))
        except Exception as e:
            corrupt_files.append((rel_path, f"Pillow loading/verification failure: {str(e)}"))
            
    # Generate report: IMAGE_VALIDATION_REPORT.md
    os.makedirs(REPORTS_DIR, exist_ok=True)
    report_path = os.path.join(REPORTS_DIR, "IMAGE_VALIDATION_REPORT.md")
    
    log_message("Generating IMAGE_VALIDATION_REPORT.md...")
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Image Integrity Validation Report\n\n")
        f.write(f"Scanned a total of `{total_scanned}` processed images.\n\n")
        
        f.write("## 1. Zero-byte Files\n\n")
        if zero_byte_files:
            f.write(f"Found **{len(zero_byte_files)}** zero-byte files:\n\n")
            f.write("| Relative File Path | Detail |\n")
            f.write("| :--- | :--- |\n")
            for file, detail in zero_byte_files:
                f.write(f"| `{file}` | {detail} |\n")
        else:
            f.write("✅ No zero-byte files found.\n")
            
        f.write("\n## 2. Corrupt / Unreadable Images\n\n")
        if corrupt_files:
            f.write(f"Found **{len(corrupt_files)}** corrupted/unreadable images:\n\n")
            f.write("| Relative File Path | Error Detail |\n")
            f.write("| :--- | :--- |\n")
            for file, error in corrupt_files:
                f.write(f"| `{file}` | {error} |\n")
        else:
            f.write("✅ All scanned images decoded and verified successfully.\n")
            
        f.write("\n## 3. Dimension Warnings (Resolution < 64x64)\n\n")
        if small_files:
            f.write(f"Found **{len(small_files)}** files with small dimensions (warning only):\n\n")
            f.write("| Relative File Path | Warning Detail |\n")
            f.write("| :--- | :--- |\n")
            for file, warning in small_files:
                f.write(f"| `{file}` | {warning} |\n")
        else:
            f.write("✅ No files below the 64x64 minimum resolution limit.\n")
            
    log_message(f"Integrity check complete. Scanned: {total_scanned}. Corrupt: {len(corrupt_files)}. Small: {len(small_files)}.")
    return len(corrupt_files) == 0 and len(zero_byte_files) == 0
