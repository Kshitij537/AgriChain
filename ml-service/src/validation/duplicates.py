import os
import hashlib
from collections import defaultdict
from PIL import Image
from .common import log_message, scan_processed_images
from .config import REPORTS_DIR, PROCESSED_DIR

def compute_sha256(file_path):
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

def compute_ahash(file_path):
    try:
        with Image.open(file_path) as img:
            # Resize to 8x8 and convert to grayscale
            img_gray = img.convert("L").resize((8, 8), Image.Resampling.BILINEAR)
            pixels = list(img_gray.getdata())
            avg = sum(pixels) / 64.0
            bits = "".join(["1" if p >= avg else "0" for p in pixels])
            return hex(int(bits, 2))[2:].zfill(16)
    except Exception:
        return None

def run_duplicate_check():
    log_message("Starting Duplicate Detection (SHA-256 & Perceptual Hashing)...")
    images = scan_processed_images()
    
    sha_map = defaultdict(list)
    ahash_map = defaultdict(list)
    
    total_images = len(images)
    log_message(f"Computing hashes for {total_images} files...")
    
    for idx, img_meta in enumerate(images, 1):
        path = img_meta["abs_path"]
        rel_path = img_meta["rel_path"]
        
        # Exact hash
        sha = compute_sha256(path)
        sha_map[sha].append(rel_path)
        
        # Perceptual hash
        ahash = compute_ahash(path)
        if ahash:
            ahash_map[ahash].append(rel_path)
            
        if idx % 10000 == 0:
            log_message(f"Processed {idx}/{total_images} files...")

    # Filter out actual duplicates
    exact_duplicates = {k: v for k, v in sha_map.items() if len(v) > 1}
    
    # Near duplicates: groups of matching aHash, excluding those that are already exact duplicates
    near_duplicates = {}
    for ahash, paths in ahash_map.items():
        if len(paths) > 1:
            # If all files in this group share the same exact SHA-256, it's already an exact duplicate
            shas = {compute_sha256(os.path.join(PROCESSED_DIR, p)) for p in paths}
            if len(shas) > 1:
                near_duplicates[ahash] = paths

    # Generate report
    report_path = os.path.join(REPORTS_DIR, "DUPLICATE_REPORT.md")
    log_message("Generating DUPLICATE_REPORT.md...")
    
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("# Duplicate Detection Audit Report\n\n")
        f.write(f"Scanned a total of `{total_images}` processed files.\n\n")
        
        f.write("## 1. Exact Duplicates (SHA-256 Matches)\n\n")
        if exact_duplicates:
            f.write(f"Found **{len(exact_duplicates)}** groups of exact duplicate files:\n\n")
            for sha, paths in sorted(exact_duplicates.items()):
                f.write(f"### Group SHA-256: `{sha}`\n")
                for path in paths:
                    f.write(f"- `{path}`\n")
                f.write("\n")
        else:
            f.write("✅ No exact duplicates found.\n\n")
            
        f.write("## 2. Near Duplicates (Perceptual aHash Matches)\n\n")
        if near_duplicates:
            f.write(f"Found **{len(near_duplicates)}** groups of near-duplicate files (highly similar content, differing headers/metadata):\n\n")
            for ahash, paths in sorted(near_duplicates.items()):
                f.write(f"### Group aHash: `{ahash}`\n")
                for path in paths:
                    f.write(f"- `{path}`\n")
                f.write("\n")
        else:
            f.write("✅ No near-duplicates found.\n")
            
    total_exact_duplicates_count = sum(len(p) - 1 for p in exact_duplicates.values())
    log_message(f"Duplicate checking complete. Exact duplicate files: {total_exact_duplicates_count}. Near duplicate groups: {len(near_duplicates)}.")
    return True
