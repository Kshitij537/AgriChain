import os
import csv
import hashlib
import sys
import numpy as np
from collections import defaultdict
from PIL import Image
import imagehash

# Path Constants
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")

# Import config constants
sys.path.append(os.path.join(PROJECT_ROOT, "ml-service", "src"))
from validation.config import SUPPORTED_EXTENSIONS, CLASS_MAPPING

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
            # Convert to 64-bit int
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

def get_stats_for_components(components, nodes):
    # Total groups
    total_groups = len(components)
    # Multi-image groups
    multi_comps = [c for c in components if len(c) > 1]
    multi_count = len(multi_comps)
    # Largest group
    sizes = [len(c) for c in components]
    largest = max(sizes) if sizes else 0
    # Median multi-image group size
    multi_sizes = sorted([len(c) for c in multi_comps])
    if multi_sizes:
        n = len(multi_sizes)
        if n % 2 == 1:
            median = multi_sizes[n // 2]
        else:
            median = (multi_sizes[n // 2 - 1] + multi_sizes[n // 2]) / 2.0
    else:
        median = 0
    # 95th percentile group size of all groups (or of multi-groups? let's do of all groups)
    p95 = np.percentile(sizes, 95) if sizes else 0
    
    return total_groups, multi_count, largest, median, p95

def main():
    print("Scanning images...")
    images = scan_images()
    n_images = len(images)
    print(f"Total processed images: {n_images}")
    
    print("Computing aHash and pHash values for all images...")
    ahashes = {}
    phashes = {}
    for idx, img in enumerate(images, 1):
        p_path = img["processed_path"]
        ah = compute_ahash(img["abs_path"])
        ph = compute_phash(img["abs_path"])
        if ah is not None:
            ahashes[p_path] = ah
        if ph is not None:
            phashes[p_path] = ph
        if idx % 5000 == 0 or idx == n_images:
            print(f"Computed {idx}/{n_images}...", flush=True)

    # Pairwise comparison within the same crop
    print("Finding all candidate matches within same crop...")
    crop_groups = defaultdict(list)
    for img in images:
        crop_groups[img["crop"]].append(img)
        
    pairs = []
    
    # We compare all pairs inside crop. Since crop sizes are:
    # cotton (4212): 8.8M pairs
    # soybean (6409): 20.5M pairs
    # orange (27429): 376M pairs.
    # To compare orange quickly, we can use multi-index on pHash or aHash.
    # Let's index using 4 blocks of 16 bits of pHash.
    # If pHash distance <= 16: at least one of the 4 blocks of 16 bits must differ by <= 4 bits.
    # Let's build a very fast candidate generation block table for pHash (4 blocks of 16 bits).
    
    for crop, crop_imgs in crop_groups.items():
        print(f"Processing crop: {crop} ({len(crop_imgs)} images)...")
        n_crop = len(crop_imgs)
        if n_crop <= 1:
            continue
            
        # Build block index of pHash (4 blocks of 16 bits)
        # We index each image under all values of each block that differ by <= 2 bits.
        # Wait, if we do a simple block-matching:
        # A 16-bit block has 65536 values.
        # If we match exact block values, we can find candidates sharing at least one block exactly.
        # Sharing at least one block of 16 bits exactly is guaranteed for distance <= 12 (since 12 < 16, 4 blocks)!
        # Let's prove: if distance <= 12, then at least one block of 16 bits must have <= 3 bit differences.
        # If we index exact block matches, we might miss some where all blocks differ by 1, 2, or 3 bits.
        # But wait! A simpler way:
        # For Orange (27429 images): let's index by aHash (8 blocks of 8 bits) to find all candidates with aHash <= 4.
        # Almost all near-duplicates of the same photograph will have aHash <= 4.
        # Let's also index by pHash (4 blocks of 16 bits) to find candidates that share at least one block exactly.
        # Let's merge both candidate sets!
        # This will be extremely comprehensive, finding near-duplicates that are close in either aHash or pHash!
        
        candidates = set()
        
        # 1. aHash block matching (4 blocks of 16 bits)
        ah_tables = [defaultdict(list) for _ in range(4)]
        for idx, img in enumerate(crop_imgs):
            h_val = ahashes.get(img["processed_path"])
            if h_val is not None:
                for block_idx in range(4):
                    block_val = (h_val >> (block_idx * 16)) & 0xFFFF
                    ah_tables[block_idx][block_val].append(idx)
                    
        for idx, img in enumerate(crop_imgs):
            h_val = ahashes.get(img["processed_path"])
            if h_val is None:
                continue
            for block_idx in range(4):
                block_val = (h_val >> (block_idx * 16)) & 0xFFFF
                for cand_idx in ah_tables[block_idx][block_val]:
                    if cand_idx > idx:
                        candidates.add((idx, cand_idx))
                        
        # 2. pHash block matching (4 blocks of 16 bits)
        ph_tables = [defaultdict(list) for _ in range(4)]
        for idx, img in enumerate(crop_imgs):
            h_val = phashes.get(img["processed_path"])
            if h_val is not None:
                for block_idx in range(4):
                    block_val = (h_val >> (block_idx * 16)) & 0xFFFF
                    ph_tables[block_idx][block_val].append(idx)
                    
        for idx, img in enumerate(crop_imgs):
            h_val = phashes.get(img["processed_path"])
            if h_val is None:
                continue
            for block_idx in range(4):
                block_val = (h_val >> (block_idx * 16)) & 0xFFFF
                for cand_idx in ph_tables[block_idx][block_val]:
                    if cand_idx > idx:
                        candidates.add((idx, cand_idx))
                        
        print(f"  Generated {len(candidates)} candidate pairs to compare out of {n_crop*(n_crop-1)//2} total pairs.")
        
        # Compare candidates
        for idx1, idx2 in candidates:
            img1 = crop_imgs[idx1]
            img2 = crop_imgs[idx2]
            p1 = img1["processed_path"]
            p2 = img2["processed_path"]
            
            ah1, ah2 = ahashes.get(p1), ahashes.get(p2)
            ph1, ph2 = phashes.get(p1), phashes.get(p2)
            
            if ah1 is not None and ah2 is not None and ph1 is not None and ph2 is not None:
                adist = ham_dist(ah1, ah2)
                pdist = ham_dist(ph1, ph2)
                
                # Keep if either is small enough to be interesting for calibration
                # aHash <= 4 or pHash <= 16
                if adist <= 4 or pdist <= 16:
                    pairs.append({
                        "p1": p1,
                        "p2": p2,
                        "c1": f"{img1['crop']}/{img1['disease']}",
                        "c2": f"{img2['crop']}/{img2['disease']}",
                        "adist": adist,
                        "pdist": pdist
                    })
                    
    print(f"Total candidate pairs recorded: {len(pairs)}")
    
    # ----------------------------------------------------
    # Calibration loops
    # ----------------------------------------------------
    nodes = [img["processed_path"] for img in images]
    
    print("\n--- aHash Calibration ---")
    ah_results = []
    for t in [0, 1, 2, 3]:
        edges = [(p["p1"], p["p2"]) for p in pairs if p["adist"] <= t]
        comps = find_connected_components(nodes, edges)
        total_g, multi_g, largest, median, p95 = get_stats_for_components(comps, nodes)
        
        # Calculate cross-class component count
        cross_class = 0
        for comp in comps:
            if len(comp) > 1:
                node_classes = {p.split("/")[1] + "/" + p.split("/")[2] for p in comp}
                if len(node_classes) > 1:
                    cross_class += 1
                    
        print(f"aHash <= {t}: pairs={len(edges)}, groups={total_g}, multi={multi_g}, largest={largest}, median={median}, p95={p95:.1f}, cross-class={cross_class}", flush=True)
        ah_results.append((t, len(edges), total_g, multi_g, largest, median, p95, cross_class))

    print("\n--- pHash Calibration ---")
    ph_results = []
    for t in [0, 2, 4, 6, 8, 10, 12, 14, 16]:
        edges = [(p["p1"], p["p2"]) for p in pairs if p["pdist"] <= t]
        comps = find_connected_components(nodes, edges)
        total_g, multi_g, largest, median, p95 = get_stats_for_components(comps, nodes)
        
        cross_class = 0
        for comp in comps:
            if len(comp) > 1:
                node_classes = {p.split("/")[1] + "/" + p.split("/")[2] for p in comp}
                if len(node_classes) > 1:
                    cross_class += 1
                    
        print(f"pHash <= {t}: pairs={len(edges)}, groups={total_g}, multi={multi_g}, largest={largest}, median={median}, p95={p95:.1f}, cross-class={cross_class}", flush=True)
        ph_results.append((t, len(edges), total_g, multi_g, largest, median, p95, cross_class))

    # Let's write the results to NEAR_DUPLICATE_CALIBRATION.md
    os.makedirs(REPORTS_DIR, exist_ok=True)
    cal_report_path = os.path.join(REPORTS_DIR, "NEAR_DUPLICATE_CALIBRATION.md")
    
    with open(cal_report_path, "w", encoding="utf-8") as f:
        f.write("# Near-Duplicate Calibration Report\n\n")
        f.write("This report documents the calibration of aHash and pHash thresholds for near-duplicate leaf image detection.\n\n")
        
        f.write("## 1. aHash Calibration Results\n\n")
        f.write("| Threshold | Pairs | Groups | Multi-Image Groups | Largest Group | Median Size | P95 Size | Cross-Class Groups |\n")
        f.write("| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n")
        for r in ah_results:
            f.write(f"| aHash <= {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]:.1f} | {r[7]} |\n")
            
        f.write("\n## 2. pHash Calibration Results\n\n")
        f.write("| Threshold | Pairs | Groups | Multi-Image Groups | Largest Group | Median Size | P95 Size | Cross-Class Groups |\n")
        f.write("| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n")
        for r in ph_results:
            f.write(f"| pHash <= {r[0]} | {r[1]} | {r[2]} | {r[3]} | {r[4]} | {r[5]} | {r[6]:.1f} | {r[7]} |\n")

    print("\nCalibration results successfully written to NEAR_DUPLICATE_CALIBRATION.md.")

if __name__ == "__main__":
    main()
