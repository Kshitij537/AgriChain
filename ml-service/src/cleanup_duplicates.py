import os
import csv
import hashlib
import sys
from collections import defaultdict
from PIL import Image

# Path Constants
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")

# Import configuration threshold
sys.path.append(os.path.join(PROJECT_ROOT, "ml-service", "src"))
from validation.config import AHASH_HAMMING_THRESHOLD, SUPPORTED_EXTENSIONS, CLASS_MAPPING

POPCOUNT_TABLE = [bin(i).count("1") for i in range(65536)]

def compute_sha256(file_path):
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()

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
    """
    Finds transitive connected components (leakage groups) in a graph.
    """
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

def main():
    print("==================================================")
    print("Starting Phase ML-0.2.6 — Duplicate Review & Leakage Prevention")
    print("==================================================")

    # 1. Scan initial dataset
    initial_images = scan_images()
    initial_count = len(initial_images)
    print(f"Initial processed image count: {initial_count}")

    # 2. Group by SHA-256 for exact duplicate checking
    print("Computing SHA-256 for all processed files...")
    sha_map = defaultdict(list)
    for img in initial_images:
        sha = compute_sha256(img["abs_path"])
        sha_map[sha].append(img)

    same_class_dups_count = 0
    cross_class_conflicts = []
    removed_paths = []
    retained_canonicals = []
    
    # Process exact duplicates
    files_to_delete = []
    
    for sha, group in sha_map.items():
        if len(group) <= 1:
            continue
            
        # Check if they share the same crop + disease
        classes = {f"{img['crop']}/{img['disease']}" for img in group}
        
        if len(classes) == 1:
            # Same-class duplicates
            # Select canonical deterministically: lexicographically smallest relative path
            group_sorted = sorted(group, key=lambda x: x["processed_path"])
            canonical = group_sorted[0]
            retained_canonicals.append(canonical)
            
            # Deletions
            for duplicate in group_sorted[1:]:
                files_to_delete.append(duplicate["abs_path"])
                removed_paths.append({
                    "sha256": sha,
                    "removed_path": duplicate["processed_path"],
                    "retained_path": canonical["processed_path"],
                    "crop": canonical["crop"],
                    "class": canonical["disease"]
                })
                same_class_dups_count += 1
        else:
            # Cross-class conflicts
            cross_class_conflicts.append({
                "sha256": sha,
                "classes": list(classes),
                "paths": [img["processed_path"] for img in group]
            })

    # Execute actual deletions from dataset/processed/
    print(f"Deleting {len(files_to_delete)} same-class duplicate images from dataset/processed/...")
    for path in files_to_delete:
        if os.path.exists(path):
            os.remove(path)

    # 3. Re-scan remaining images for near-duplicate checks
    remaining_images = scan_images()
    after_exact_count = len(remaining_images)
    print(f"Remaining processed image count after exact duplicate cleanup: {after_exact_count}")

    # 4. Compute aHash for all remaining images
    print("Computing aHash for all remaining files...")
    ahashes = {}
    for img in remaining_images:
        h_val = compute_ahash(img["abs_path"])
        if h_val is not None:
            ahashes[img["processed_path"]] = h_val

    # 5. Fast pairwise similarity search within same crop using multi-index hashing
    print("Running multi-index search to evaluate thresholds (0 to 5)...")
    crop_groups = defaultdict(list)
    for img in remaining_images:
        crop_groups[img["crop"]].append(img)

    all_pairs_distances = []

    for crop, crop_imgs in crop_groups.items():
        n_crop = len(crop_imgs)
        if n_crop <= 1:
            continue
            
        # Build 8-block table
        tables = [defaultdict(list) for _ in range(8)]
        for idx, img in enumerate(crop_imgs):
            h_val = ahashes.get(img["processed_path"])
            if h_val is not None:
                for block_idx in range(8):
                    block_val = (h_val >> (block_idx * 8)) & 0xFF
                    tables[block_idx][block_val].append(idx)
                    
        # Find candidate matches
        compared_pairs = set()
        for idx, img in enumerate(crop_imgs):
            h_val = ahashes.get(img["processed_path"])
            if h_val is None:
                continue
                
            candidates = set()
            for block_idx in range(8):
                block_val = (h_val >> (block_idx * 8)) & 0xFF
                for cand_idx in tables[block_idx][block_val]:
                    if cand_idx > idx:
                        candidates.add(cand_idx)
                        
            for cand_idx in candidates:
                img2 = crop_imgs[cand_idx]
                h_val2 = ahashes.get(img2["processed_path"])
                if h_val2 is not None:
                    d = ham_dist(h_val, h_val2)
                    if d <= 5:
                        all_pairs_distances.append({
                            "img1": img,
                            "img2": img2,
                            "distance": d,
                            "h1": hex(h_val)[2:].zfill(16),
                            "h2": hex(h_val2)[2:].zfill(16)
                        })

    # Evaluate counts by threshold
    threshold_counts = {t: 0 for t in range(6)}
    for pair in all_pairs_distances:
        for t in range(pair["distance"], 6):
            threshold_counts[t] += 1

    print("\nCandidate counts by threshold:")
    for t in range(6):
        print(f"  Hamming distance <= {t}: {threshold_counts[t]} pairs")

    print(f"\nSelected Hamming threshold configuration: AHASH_HAMMING_THRESHOLD = {AHASH_HAMMING_THRESHOLD}")
    print(f"Reason: Setting threshold={AHASH_HAMMING_THRESHOLD} avoids transitive merging of distinct images while capturing near-duplicates.")

    # 6. Group near-duplicates at selected threshold
    near_dup_pairs = [p for p in all_pairs_distances if p["distance"] <= AHASH_HAMMING_THRESHOLD]
    
    # Classify near-duplicates (SAME_CLASS vs CROSS_CLASS)
    same_class_near_count = 0
    cross_class_near_count = 0
    
    os.makedirs(REPORTS_DIR, exist_ok=True)
    near_dup_csv_path = os.path.join(REPORTS_DIR, "NEAR_DUPLICATE_REVIEW.csv")
    
    print("Writing NEAR_DUPLICATE_REVIEW.csv...")
    with open(near_dup_csv_path, "w", newline="", encoding="utf-8") as csvfile:
        writer = csv.writer(csvfile)
        writer.writerow([
            "group_id", "image_1", "image_2", "crop_1", "class_1", "crop_2", "class_2",
            "hash_1", "hash_2", "hash_distance", "relationship_type", "review_status"
        ])
        
        for idx, p in enumerate(near_dup_pairs, 1):
            c1 = f"{p['img1']['crop']}/{p['img1']['disease']}"
            c2 = f"{p['img2']['crop']}/{p['img2']['disease']}"
            rel_type = "SAME_CLASS" if c1 == c2 else "CROSS_CLASS"
            
            if rel_type == "SAME_CLASS":
                same_class_near_count += 1
            else:
                cross_class_near_count += 1
                
            writer.writerow([
                f"ND_PAIR_{idx:05d}",
                p["img1"]["file_name"],
                p["img2"]["file_name"],
                p["img1"]["crop"],
                p["img1"]["disease"],
                p["img2"]["crop"],
                p["img2"]["disease"],
                p["h1"],
                p["h2"],
                p["distance"],
                rel_type,
                "PENDING"
            ])

    # 7. Connected components for transitive leakage groups
    print("Generating transitive leakage groups using connected components (DFS)...")
    nodes = [img["processed_path"] for img in remaining_images]
    edges = [(p["img1"]["processed_path"], p["img2"]["processed_path"]) for p in near_dup_pairs]
    
    components = find_connected_components(nodes, edges)
    
    # Map each path to its component ID
    leakage_groups = {}
    group_sizes = {}
    
    lg_counter = 1
    single_counter = 1
    
    for comp in components:
        size = len(comp)
        if size > 1:
            # Multi-image near-duplicate leakage group
            lg_id = f"LG_SHARED_{lg_counter:06d}"
            lg_counter += 1
            for path in comp:
                leakage_groups[path] = lg_id
                group_sizes[path] = size
        else:
            # Single image unique group
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
        
        for img in remaining_images:
            path = img["processed_path"]
            class_key = f"{img['crop']}/{img['disease']}"
            class_info = CLASS_MAPPING.get(class_key, {"code": "unknown"})
            writer.writerow([
                path,
                img["crop"],
                img["disease"],
                class_info["code"],
                leakage_groups[path],
                group_sizes[path]
            ])

    # 8. Generate EXACT_DUPLICATE_CLEANUP.md report
    exact_report_path = os.path.join(REPORTS_DIR, "EXACT_DUPLICATE_CLEANUP.md")
    print("Writing EXACT_DUPLICATE_CLEANUP.md...")
    with open(exact_report_path, "w", encoding="utf-8") as f:
        f.write("# Exact Duplicate Cleanup & Label Conflict Report\n\n")
        f.write(f"Scanned initial dataset consisting of `{initial_count}` processed images.\n\n")
        
        f.write("## 1. Exact Duplicate Cleanup Statistics\n\n")
        f.write(f"- **Initial Image Count**: `{initial_count}`\n")
        f.write(f"- **Total Exact Duplicate Groups (SHA-256)**: `{len([k for k,v in sha_map.items() if len(v)>1])}`\n")
        f.write(f"- **Same-class Duplicate Groups**: `{len(retained_canonicals)}`\n")
        f.write(f"- **Same-class Redundant Duplicates Removed**: `{same_class_dups_count}`\n")
        f.write(f"- **Remaining Same-class Duplicates in processed**: `0`\n")
        f.write(f"- **Cross-class Exact Conflicts Flagged**: `{len(cross_class_conflicts)}`\n")
        f.write(f"- **Final Image Count after Exact Cleanup**: `{after_exact_count}`\n\n")
        
        f.write("## 2. Flagged Cross-Class Exact Conflicts (RETAINED, NOT DELETED)\n\n")
        if cross_class_conflicts:
            f.write("The following identical images appear under different disease classes and require manual review:\n\n")
            for idx, conflict in enumerate(cross_class_conflicts, 1):
                f.write(f"### Conflict #{idx} (SHA-256: `{conflict['sha256']}`)\n")
                f.write("Classes present:\n")
                for cls in conflict["classes"]:
                    f.write(f"- `{cls}`\n")
                f.write("File paths:\n")
                for p in conflict["paths"]:
                    f.write(f"- `{p}`\n")
                f.write("\n")
        else:
            f.write("✅ No cross-class exact duplicate conflicts detected.\n")

    print("\n==================================================")
    print("Duplicate Cleanup & Leakage Group generation complete.")
    print("==================================================")

if __name__ == "__main__":
    main()
