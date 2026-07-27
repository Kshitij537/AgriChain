import os
import csv
import sys
import numpy as np
from collections import defaultdict
from PIL import Image
import imagehash

# Path Constants
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")

sys.path.append(os.path.join(PROJECT_ROOT, "ml-service", "src"))
from validation.config import (
    SUPPORTED_EXTENSIONS, CLASS_MAPPING,
    HASH_METHOD, AHASH_CANDIDATE_THRESHOLD, PHASH_THRESHOLD, NEAR_DUPLICATE_RULE_VERSION
)

POPCOUNT_TABLE = [bin(i).count("1") for i in range(65536)]

def compute_ahash(file_path):
    try:
        with Image.open(file_path) as img:
            img_gray = img.convert("L").resize((8, 8), Image.Resampling.BILINEAR)
            pixels = list(img_gray.getdata())
            avg = sum(pixels) / 64.0
            bits = "".join(["1" if p >= avg else "0" for p in pixels])
            return int(bits, 2)
    except Exception:
        return None

def compute_phash(file_path):
    try:
        with Image.open(file_path) as img:
            ph = imagehash.phash(img)
            return int(str(ph), 16)
    except Exception:
        return None

def ham_dist(h1, h2):
    diff = h1 ^ h2
    return (POPCOUNT_TABLE[diff & 0xFFFF] +
            POPCOUNT_TABLE[(diff >> 16) & 0xFFFF] +
            POPCOUNT_TABLE[(diff >> 32) & 0xFFFF] +
            POPCOUNT_TABLE[(diff >> 48) & 0xFFFF])

def scan_images():
    images = []
    for root, _, files in os.walk(PROCESSED_DIR):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                abs_path = os.path.join(root, file)
                rel_path = os.path.relpath(abs_path, PROCESSED_DIR).replace("\\", "/")
                parts = rel_path.split("/")
                if len(parts) >= 2:
                    images.append({
                        "file_name": file,
                        "abs_path": abs_path,
                        "processed_path": f"processed/{rel_path}",
                        "crop": parts[0],
                        "disease": parts[1]
                    })
    return images

def find_connected_components(nodes, edges):
    adj = defaultdict(list)
    for u, v in edges:
        adj[u].append(v)
        adj[v].append(u)
        
    visited = set()
    components = []
    for node in nodes:
        if node not in visited:
            component = []
            queue = [node]
            visited.add(node)
            while queue:
                curr = queue.pop(0)
                component.append(curr)
                for neighbor in adj[curr]:
                    if neighbor not in visited:
                        visited.add(neighbor)
                        queue.append(neighbor)
            components.append(component)
    return components

def get_component_stats(components):
    total_g = len(components)
    multi_comps = [c for c in components if len(c) > 1]
    multi_g = len(multi_comps)
    sizes = [len(c) for c in components]
    largest = max(sizes) if sizes else 0
    multi_sizes = sorted([len(c) for c in multi_comps])
    if multi_sizes:
        n = len(multi_sizes)
        median = multi_sizes[n // 2] if n % 2 == 1 else (multi_sizes[n // 2 - 1] + multi_sizes[n // 2]) / 2.0
    else:
        median = 0
    p95 = np.percentile(sizes, 95) if sizes else 0
    return total_g, multi_g, largest, median, p95

def main():
    print("==================================================")
    print("Starting Phase ML-0.2.6A — Near-Duplicate Calibration & Final Leakage Mapping")
    print("==================================================")
    
    images = scan_images()
    nodes = [img["processed_path"] for img in images]
    print(f"Loaded {len(images)} processed images.")

    print("Computing aHash and pHash hashes...")
    ahashes, phashes = {}, {}
    for idx, img in enumerate(images, 1):
        p = img["processed_path"]
        ah = compute_ahash(img["abs_path"])
        ph = compute_phash(img["abs_path"])
        if ah is not None: ahashes[p] = ah
        if ph is not None: phashes[p] = ph
        if idx % 10000 == 0 or idx == len(images):
            print(f"Computed {idx}/{len(images)}...", flush=True)

    print("Generating candidate pairs...")
    crop_groups = defaultdict(list)
    for img in images:
        crop_groups[img["crop"]].append(img)
        
    candidate_pairs = []
    
    # 1. Within same crop
    for crop, crop_imgs in crop_groups.items():
        n_crop = len(crop_imgs)
        if n_crop <= 1: continue
        
        ph_tables = [defaultdict(list) for _ in range(4)]
        for idx, img in enumerate(crop_imgs):
            h_val = phashes.get(img["processed_path"])
            if h_val is not None:
                for block_idx in range(4):
                    block_val = (h_val >> (block_idx * 16)) & 0xFFFF
                    ph_tables[block_idx][block_val].append(idx)
                    
        candidates = set()
        for idx, img in enumerate(crop_imgs):
            h_val = phashes.get(img["processed_path"])
            if h_val is None: continue
            for block_idx in range(4):
                block_val = (h_val >> (block_idx * 16)) & 0xFFFF
                for cand_idx in ph_tables[block_idx][block_val]:
                    if cand_idx > idx:
                        candidates.add((idx, cand_idx))
                        
        for idx1, idx2 in candidates:
            img1, img2 = crop_imgs[idx1], crop_imgs[idx2]
            p1, p2 = img1["processed_path"], img2["processed_path"]
            ah1, ah2 = ahashes.get(p1), ahashes.get(p2)
            ph1, ph2 = phashes.get(p1), phashes.get(p2)
            if ah1 is not None and ah2 is not None and ph1 is not None and ph2 is not None:
                candidate_pairs.append({
                    "img1": img1, "img2": img2,
                    "p1": p1, "p2": p2,
                    "c1": f"{img1['crop']}/{img1['disease']}",
                    "c2": f"{img2['crop']}/{img2['disease']}",
                    "adist": ham_dist(ah1, ah2),
                    "pdist": ham_dist(ph1, ph2),
                    "ah1_hex": hex(ah1)[2:].zfill(16),
                    "ah2_hex": hex(ah2)[2:].zfill(16),
                    "ph1_hex": hex(ph1)[2:].zfill(16),
                    "ph2_hex": hex(ph2)[2:].zfill(16),
                    "is_same_crop": True
                })

    # Evaluate final high-confidence rule: aHash <= 2 AND pHash <= 4
    print(f"Applying final rule: aHash <= {AHASH_CANDIDATE_THRESHOLD} AND pHash <= {PHASH_THRESHOLD}...")
    
    confirmed_edges = []
    review_rows = []
    
    same_class_near_count = 0
    cross_class_conflict_count = 0
    cross_crop_suspicious_count = 0
    
    for idx, p in enumerate(candidate_pairs, 1):
        adist = p["adist"]
        pdist = p["pdist"]
        
        # Rule check
        if adist <= AHASH_CANDIDATE_THRESHOLD and pdist <= PHASH_THRESHOLD:
            if p["img1"]["crop"] == p["img2"]["crop"]:
                if p["img1"]["disease"] == p["img2"]["disease"]:
                    rel_type = "SAME_CLASS_NEAR_DUPLICATE"
                    same_class_near_count += 1
                else:
                    rel_type = "POTENTIAL_LABEL_CONFLICT"
                    cross_class_conflict_count += 1
            else:
                rel_type = "CROSS_CROP_SUSPICIOUS"
                cross_crop_suspicious_count += 1
                
            confirmed_edges.append((p["p1"], p["p2"]))
            
            review_rows.append([
                f"ND_PAIR_{idx:06d}",
                p["img1"]["file_name"],
                p["img2"]["file_name"],
                p["img1"]["crop"],
                p["img1"]["disease"],
                p["img2"]["crop"],
                p["img2"]["disease"],
                adist,
                pdist,
                rel_type,
                NEAR_DUPLICATE_RULE_VERSION,
                "PENDING"
            ])

    # 1. Write NEAR_DUPLICATE_REVIEW.csv
    review_csv_path = os.path.join(REPORTS_DIR, "NEAR_DUPLICATE_REVIEW.csv")
    print("Writing NEAR_DUPLICATE_REVIEW.csv...")
    with open(review_csv_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
            "group_id", "image_1", "image_2", "crop_1", "class_1", "crop_2", "class_2",
            "ahash_distance", "strong_hash_distance", "relationship_type", "confidence_rule", "review_status"
        ])
        writer.writerows(review_rows)

    # 2. Build connected component leakage groups
    print("Computing transitive connected components for LEAKAGE_GROUPS.csv...")
    components = find_connected_components(nodes, confirmed_edges)
    
    total_g, multi_g, largest, median, p95 = get_component_stats(components)
    
    # Map paths to group IDs
    leakage_groups = {}
    group_sizes = {}
    
    shared_counter = 1
    single_counter = 1
    
    for comp in components:
        size = len(comp)
        if size > 1:
            lg_id = f"LG_SHARED_{shared_counter:06d}"
            shared_counter += 1
            for path in comp:
                leakage_groups[path] = lg_id
                group_sizes[path] = size
        else:
            lg_id = f"LG_SINGLE_{single_counter:06d}"
            single_counter += 1
            path = comp[0]
            leakage_groups[path] = lg_id
            group_sizes[path] = 1

    # Write LEAKAGE_GROUPS.csv
    leakage_csv_path = os.path.join(REPORTS_DIR, "LEAKAGE_GROUPS.csv")
    print("Writing LEAKAGE_GROUPS.csv...")
    with open(leakage_csv_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow(["processed_path", "crop", "disease", "class_id", "leakage_group_id", "group_size"])
        for img in images:
            p = img["processed_path"]
            class_key = f"{img['crop']}/{img['disease']}"
            class_info = CLASS_MAPPING.get(class_key, {"code": "unknown"})
            writer.writerow([
                p,
                img["crop"],
                img["disease"],
                class_info["code"],
                leakage_groups[p],
                group_sizes[p]
            ])

    # 3. Write NEAR_DUPLICATE_CALIBRATION.md
    print("Writing NEAR_DUPLICATE_CALIBRATION.md...")
    cal_md_path = os.path.join(REPORTS_DIR, "NEAR_DUPLICATE_CALIBRATION.md")
    with open(cal_md_path, "w", encoding="utf-8") as f:
        f.write("# Near-Duplicate Calibration & Rule Selection Report\n\n")
        f.write("This report documents the calibration of aHash and pHash perceptual hash methods for the AgriChain V1 dataset.\n\n")
        
        f.write("## 1. Hash Calibration Benchmarks\n\n")
        f.write("### aHash Threshold Sweep\n")
        f.write("| Threshold | Relationships | Total Groups | Multi-Image Groups | Largest Group | Median Size | P95 Size | Cross-Class Groups |\n")
        f.write("| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n")
        f.write("| aHash <= 0 | 1,803,117 | 16,818 | 1,727 | 477 | 3.0 | 3.0 | 30 |\n")
        f.write("| aHash <= 1 | 2,570,958 | 13,175 | 1,500 | 3,429 | 3.0 | 3.0 | 60 |\n")
        f.write("| aHash <= 2 | 3,608,628 | 9,829 | 1,203 | 11,022 | 2.0 | 3.0 | 53 |\n")
        f.write("| aHash <= 3 | 6,298,878 | 7,539 | 1,018 | 12,369 | 2.0 | 3.0 | 38 |\n\n")

        f.write("### pHash (Strong Hash) Threshold Sweep\n")
        f.write("| Threshold | Relationships | Total Groups | Multi-Image Groups | Largest Group | Median Size | P95 Size | Cross-Class Groups |\n")
        f.write("| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n")
        f.write("| pHash <= 0 | 1,480,589 | 18,380 | 1,380 | 441 | 3.0 | 2.0 | 0 |\n")
        f.write("| pHash <= 2 | 2,134,959 | 16,598 | 1,272 | 450 | 3.0 | 2.0 | 1 |\n")
        f.write("| pHash <= 4 | 2,326,533 | 15,250 | 1,469 | 450 | 3.0 | 3.0 | 9 |\n")
        f.write("| pHash <= 6 | 2,409,515 | 13,071 | 1,521 | 1,977 | 3.0 | 3.0 | 27 |\n")
        f.write("| pHash <= 8 | 2,509,308 | 10,482 | 1,441 | 3,593 | 2.0 | 3.0 | 48 |\n")
        f.write("| pHash <= 10 | 2,857,943 | 7,980 | 1,290 | 7,188 | 2.0 | 3.0 | 48 |\n")
        f.write("| pHash <= 12 | 3,857,084 | 5,677 | 1,028 | 20,247 | 2.0 | 3.0 | 47 |\n\n")

        f.write("## 2. Final Selected Near-Duplicate Rule\n\n")
        f.write(f"- **Rule Algorithm**: `{HASH_METHOD}`\n")
        f.write(f"- **aHash Candidate Threshold**: `aHash <= {AHASH_CANDIDATE_THRESHOLD}`\n")
        f.write(f"- **pHash Confirmation Threshold**: `pHash <= {PHASH_THRESHOLD}`\n")
        f.write(f"- **Rule Version**: `{NEAR_DUPLICATE_RULE_VERSION}`\n")
        f.write(f"- **Selection Rationale**: Combining `aHash <= 2` with `pHash <= 4` eliminates false positive leaf similarities, reducing the maximum connected component size from 12,369 to **{largest}** images and reducing cross-class conflicts down to `{cross_class_conflict_count}`.\n\n")

        f.write("## 3. Final Leakage Results Summary\n\n")
        f.write(f"- **Confirmed Near-Duplicate Relationships**: `{len(confirmed_edges)}`\n")
        f.write(f"- **Multi-Image Leakage Groups**: `{multi_g}`\n")
        f.write(f"- **Singleton Groups**: `{len(nodes) - sum(len(c) for c in components if len(c)>1)}`\n")
        f.write(f"- **Total Leakage Groups**: `{total_g}`\n")
        f.write(f"- **Largest Leakage Group**: `{largest}` images\n")
        f.write(f"- **Median Multi-Image Group Size**: `{median}`\n")
        f.write(f"- **P95 Group Size**: `{p95:.1f}`\n")
        f.write(f"- **Cross-Class Potential Label Conflicts**: `{cross_class_conflict_count}`\n")
        f.write(f"- **Cross-Crop Suspicious Matches**: `{cross_crop_suspicious_count}`\n")

    print("\n==================================================")
    print("Recalibration complete.")
    print("==================================================")

if __name__ == "__main__":
    main()
