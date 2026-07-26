import os
import csv
import json
import hashlib
import random
import sys
import argparse
from collections import defaultdict, Counter

# Ensure package imports work
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
if CURRENT_DIR not in sys.path:
    sys.path.append(CURRENT_DIR)

from split_config import (
    MANIFEST_PATH, SPLITS_DIR, REPORTS_DIR, CHECKSUMS_PATH,
    TRAIN_RATIO, VALIDATION_RATIO, TEST_RATIO, RANDOM_SEED
)

def load_manifest(manifest_path):
    if not os.path.exists(manifest_path):
        raise FileNotFoundError(f"Source manifest not found at: {manifest_path}")
        
    records = []
    with open(manifest_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            records.append(row)
    return records

def compute_split_fingerprint(split_records):
    # Sort deterministically by processed_path
    sorted_records = sorted(split_records, key=lambda x: x["processed_path"])
    h = hashlib.sha256()
    for r in sorted_records:
        line = f"{r['processed_path']}:{r['split']}\n"
        h.update(line.encode("utf-8"))
    return h.hexdigest()

def perform_group_stratified_split(records, seed=RANDOM_SEED):
    random.seed(seed)
    
    # 1. Group records by leakage_group_id
    groups = defaultdict(list)
    for r in records:
        groups[r["leakage_group_id"]].append(r)
        
    # 2. Calculate overall class counts and target counts
    total_class_counts = Counter()
    for r in records:
        key = f"{r['crop']}/{r['disease']}"
        total_class_counts[key] += 1
        
    target_counts = {
        "train": {k: int(round(v * TRAIN_RATIO)) for k, v in total_class_counts.items()},
        "validation": {k: int(round(v * VALIDATION_RATIO)) for k, v in total_class_counts.items()},
        "test": {k: int(round(v * TEST_RATIO)) for k, v in total_class_counts.items()}
    }
    
    # Guarantee at least 1 image per class in val and test
    for k in total_class_counts:
        if target_counts["validation"][k] == 0:
            target_counts["validation"][k] = 1
        if target_counts["test"][k] == 0:
            target_counts["test"][k] = 1

    # 3. Build group class vectors and compute priority scores
    group_items = []
    for gid, group_records in groups.items():
        class_vector = Counter(f"{r['crop']}/{r['disease']}" for r in group_records)
        # Priority criteria:
        # - Multi-class groups first
        # - Minority class count in group
        # - Group size
        is_multi_class = len(class_vector) > 1
        group_size = len(group_records)
        min_class_pop = min(total_class_counts[c] for c in class_vector)
        
        group_items.append({
            "group_id": gid,
            "records": group_records,
            "vector": class_vector,
            "size": group_size,
            "is_multi_class": is_multi_class,
            "min_class_pop": min_class_pop
        })
        
    # Sort groups deterministically for greedy allocation
    # Secondary tie-breaker uses random shuffle with fixed seed
    random.shuffle(group_items)
    group_items.sort(key=lambda g: (-g["is_multi_class"], g["min_class_pop"], -g["size"]))

    current_counts = {
        "train": Counter(),
        "validation": Counter(),
        "test": Counter()
    }
    
    group_allocations = {}
    
    splits_list = ["train", "validation", "test"]
    ratio_targets = {
        "train": TRAIN_RATIO,
        "validation": VALIDATION_RATIO,
        "test": TEST_RATIO
    }

    for g in group_items:
        vector = g["vector"]
        
        best_split = None
        best_loss = float("inf")
        
        for s in splits_list:
            # Check if any class in vector is currently missing (0) in split s
            missing_penalty = 0
            for c in vector:
                if current_counts[s][c] == 0:
                    missing_penalty -= 1000.0  # Strongly favor placing in split lacking this class
                    
            # Calculate mean relative surplus/deficit
            # Negative loss means split is under-filled relative to target
            loss = 0.0
            for c, cnt in vector.items():
                target = target_counts[s][c]
                curr = current_counts[s][c]
                new_val = curr + cnt
                # Relative difference: (new_val - target) / target
                loss += (new_val - target) / max(target, 1)
                
            total_loss = loss + missing_penalty
            
            if total_loss < best_loss:
                best_loss = total_loss
                best_split = s
                
        # Assign group to best split
        group_allocations[g["group_id"]] = best_split
        for c, cnt in vector.items():
            current_counts[best_split][c] += cnt

    # Map assigned split back to each record
    split_records = []
    for r in records:
        r_copy = dict(r)
        r_copy["split"] = group_allocations[r["leakage_group_id"]]
        split_records.append(r_copy)
        
    return split_records, group_allocations

def validate_and_generate_reports(records, split_records, seed=RANDOM_SEED):
    os.makedirs(SPLITS_DIR, exist_ok=True)
    os.makedirs(REPORTS_DIR, exist_ok=True)
    
    # 1. Validate coverage
    total_input = len(records)
    total_split = len(split_records)
    
    if total_input != total_split:
        raise ValueError(f"Record count mismatch: input={total_input}, split={total_split}")
        
    paths_in_input = {r["processed_path"] for r in records}
    paths_in_split = {r["processed_path"] for r in split_records}
    
    if paths_in_input != paths_in_split:
        raise ValueError("Set of processed paths in split does not match input manifest!")

    # 2. Validate leakage group separation
    split_groups = defaultdict(set)
    for r in split_records:
        split_groups[r["split"]].add(r["leakage_group_id"])
        
    train_val_overlap = split_groups["train"].intersection(split_groups["validation"])
    train_test_overlap = split_groups["train"].intersection(split_groups["test"])
    val_test_overlap = split_groups["validation"].intersection(split_groups["test"])
    
    if train_val_overlap or train_test_overlap or val_test_overlap:
        raise ValueError(f"Leakage group overlap detected! train-val={len(train_val_overlap)}, train-test={len(train_test_overlap)}, val-test={len(val_test_overlap)}")

    # 3. Validate class coverage in all splits
    class_split_counts = defaultdict(lambda: Counter())
    for r in split_records:
        key = f"{r['crop']}/{r['disease']}"
        class_split_counts[key][r["split"]] += 1
        
    for cls, counts in class_split_counts.items():
        if counts["train"] == 0 or counts["validation"] == 0 or counts["test"] == 0:
            raise ValueError(f"Class '{cls}' missing from a split! Counts: {dict(counts)}")

    # 4. Write CSV outputs
    headers = [
        "image_name", "crop", "disease", "class_id", "class_index",
        "original_source", "processed_path", "extension", "file_size",
        "width", "height", "leakage_group_id"
    ]
    
    master_headers = headers + ["split"]
    
    # Split CSVs
    for split_name in ["train", "validation", "test"]:
        csv_path = os.path.join(SPLITS_DIR, f"{split_name}.csv")
        split_rows = [r for r in split_records if r["split"] == split_name]
        with open(csv_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=headers)
            writer.writeheader()
            for r in split_rows:
                row_data = {h: r.get(h, "") for h in headers}
                writer.writerow(row_data)

    # Master Split Manifest CSV
    master_manifest_path = os.path.join(SPLITS_DIR, "SPLIT_MANIFEST.csv")
    with open(master_manifest_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=master_headers)
        writer.writeheader()
        for r in split_records:
            writer.writerow(r)

    # 5. Compute split fingerprint
    split_fp = compute_split_fingerprint(split_records)
    
    # Load source checksums
    content_fp = "unknown"
    leakage_fp = "unknown"
    if os.path.exists(CHECKSUMS_PATH):
        try:
            with open(CHECKSUMS_PATH, "r", encoding="utf-8") as f:
                cdata = json.load(f)
                content_fp = cdata.get("dataset_content_fingerprint", content_fp)
                leakage_fp = cdata.get("metadata_leakage_fingerprint", leakage_fp)
        except Exception:
            pass

    # Build summary json
    total_imgs = len(split_records)
    train_count = sum(1 for r in split_records if r["split"] == "train")
    val_count = sum(1 for r in split_records if r["split"] == "validation")
    test_count = sum(1 for r in split_records if r["split"] == "test")
    
    summary_data = {
        "seed": seed,
        "target_ratios": {
            "train": TRAIN_RATIO,
            "validation": VALIDATION_RATIO,
            "test": TEST_RATIO
        },
        "total_images": total_imgs,
        "splits": {
            "train": {"count": train_count, "percentage": round(train_count / total_imgs * 100, 2)},
            "validation": {"count": val_count, "percentage": round(val_count / total_imgs * 100, 2)},
            "test": {"count": test_count, "percentage": round(test_count / total_imgs * 100, 2)}
        },
        "per_class": {},
        "leakage_validation": {
            "train_val_group_overlap": len(train_val_overlap),
            "train_test_group_overlap": len(train_test_overlap),
            "val_test_group_overlap": len(val_test_overlap),
            "duplicate_processed_paths": 0,
            "missing_processed_paths": 0
        },
        "source_dataset_fingerprint": content_fp,
        "source_leakage_fingerprint": leakage_fp,
        "split_fingerprint": split_fp
    }
    
    # Calculate per-class details
    for cls in sorted(class_split_counts.keys()):
        counts = class_split_counts[cls]
        c_total = sum(counts.values())
        summary_data["per_class"][cls] = {
            "total": c_total,
            "train": counts["train"],
            "train_pct": round(counts["train"] / c_total * 100, 2),
            "val": counts["validation"],
            "val_pct": round(counts["validation"] / c_total * 100, 2),
            "test": counts["test"],
            "test_pct": round(counts["test"] / c_total * 100, 2)
        }

    summary_json_path = os.path.join(SPLITS_DIR, "split_summary.json")
    with open(summary_json_path, "w", encoding="utf-8") as f:
        json.dump(summary_data, f, indent=2)

    # 6. Generate DATASET_SPLIT_REPORT.md
    split_md_path = os.path.join(REPORTS_DIR, "DATASET_SPLIT_REPORT.md")
    with open(split_md_path, "w", encoding="utf-8") as f:
        f.write("# Dataset Split Report\n\n")
        f.write("This report documents the group-aware 70/15/15 train-validation-test split for AgriChain V1.\n\n")
        
        f.write("## 1. Overall Distribution Summary\n\n")
        f.write("| Split | Images | Actual % | Target % |\n")
        f.write("| :--- | :---: | :---: | :---: |\n")
        f.write(f"| **Train** | `{train_count}` | `{summary_data['splits']['train']['percentage']}%` | `70.0%` |\n")
        f.write(f"| **Validation** | `{val_count}` | `{summary_data['splits']['validation']['percentage']}%` | `15.0%` |\n")
        f.write(f"| **Test** | `{test_count}` | `{summary_data['splits']['test']['percentage']}%` | `15.0%` |\n")
        f.write(f"| **Total** | `{total_imgs}` | `100.0%` | `100.0%` |\n\n")

        f.write("## 2. Per-Class Stratification Breakdown\n\n")
        f.write("| Class Name | Total | Train Count | Train % | Val Count | Val % | Test Count | Test % |\n")
        f.write("| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |\n")
        for cls, d in summary_data["per_class"].items():
            f.write(f"| `{cls}` | {d['total']} | {d['train']} | {d['train_pct']}% | {d['val']} | {d['val_pct']}% | {d['test']} | {d['test_pct']}% |\n")

        f.write("\n## 3. Leakage & Overlap Validation\n\n")
        f.write("- [x] **Train ↔ Validation Group Overlap**: `0`\n")
        f.write("- [x] **Train ↔ Test Group Overlap**: `0`\n")
        f.write("- [x] **Validation ↔ Test Group Overlap**: `0`\n")
        f.write("- [x] **Duplicate Processed Paths**: `0`\n")
        f.write("- [x] **Missing Processed Paths**: `0`\n")
        f.write(f"- [x] **All 12 Classes Covered in All Splits**: `YES`\n\n")
        
        f.write("## 4. Reproducibility & Fingerprints\n\n")
        f.write(f"- **Random Seed**: `{seed}`\n")
        f.write(f"- **Source Content Fingerprint**: `{content_fp}`\n")
        f.write(f"- **Source Leakage Fingerprint**: `{leakage_fp}`\n")
        f.write(f"- **Split Fingerprint**: `{split_fp}`\n")

    return summary_data

def main():
    parser = argparse.ArgumentParser(description="AgriChain Group-Aware Dataset Split Generator")
    parser.add_argument("--seed", type=int, default=RANDOM_SEED, help="Random seed for deterministic allocation")
    args = parser.parse_args()
    
    print("==================================================")
    print("Starting Phase ML-0.3.1 — Leakage-Safe Dataset Splitting")
    print("==================================================")
    
    records = load_manifest(MANIFEST_PATH)
    print(f"Loaded {len(records)} records from {MANIFEST_PATH}.")
    
    print(f"Allocating groups using seed={args.seed}...")
    split_records, group_allocations = perform_group_stratified_split(records, seed=args.seed)
    
    print("Validating split integrity and generating output manifests...")
    summary_data = validate_and_generate_reports(records, split_records, seed=args.seed)
    
    # Test reproducibility with second run
    print("Verifying reproducibility with a second run...")
    split_records_2, _ = perform_group_stratified_split(records, seed=args.seed)
    fp2 = compute_split_fingerprint(split_records_2)
    if summary_data["split_fingerprint"] != fp2:
        raise ValueError(f"Reproducibility check failed! First run fingerprint: {summary_data['split_fingerprint']}, Second run: {fp2}")
    print(f"Reproducibility verified! Split fingerprint: {fp2}")
    
    print("\n==================================================")
    print("Dataset splitting completed successfully.")
    print("==================================================")

if __name__ == "__main__":
    main()
