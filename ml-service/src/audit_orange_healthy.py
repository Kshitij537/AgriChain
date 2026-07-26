import os
import csv
import json
from collections import defaultdict, Counter

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")
SPLITS_DIR = os.path.join(PROJECT_ROOT, "dataset", "splits")

MANIFEST_PATH = os.path.join(REPORTS_DIR, "DATASET_MANIFEST.csv")
LEAKAGE_GROUPS_PATH = os.path.join(REPORTS_DIR, "LEAKAGE_GROUPS.csv")
SPLIT_MANIFEST_PATH = os.path.join(SPLITS_DIR, "SPLIT_MANIFEST.csv")

def audit():
    print("==================================================")
    print("ML-0.3.1A — SPLIT ALLOCATION AUDIT FOR ORANGE HEALTHY")
    print("==================================================\n")

    # 1. Load records
    records = []
    with open(SPLIT_MANIFEST_PATH, "r", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            records.append(r)

    # Filter to groups containing orange/Healthy
    groups = defaultdict(list)
    for r in records:
        groups[r["leakage_group_id"]].append(r)

    orange_healthy_groups = {}
    for gid, rows in groups.items():
        oh_count = sum(1 for r in rows if r["crop"] == "orange" and r["disease"] == "Healthy")
        if oh_count > 0:
            orange_healthy_groups[gid] = {
                "rows": rows,
                "oh_count": oh_count,
                "total_size": len(rows),
                "classes": Counter(f"{r['crop']}/{r['disease']}" for r in rows),
                "split": rows[0]["split"]
            }

    total_oh_images = sum(g["oh_count"] for g in orange_healthy_groups.values())
    print(f"Total Orange Healthy images in dataset: {total_oh_images}")
    print(f"Total leakage groups containing Orange Healthy: {len(orange_healthy_groups)}\n")

    # Categorize groups
    singletons = [g for g in orange_healthy_groups.values() if g["total_size"] == 1]
    multi_image = [g for g in orange_healthy_groups.values() if g["total_size"] > 1 and len(g["classes"]) == 1]
    multi_class = [g for g in orange_healthy_groups.values() if len(g["classes"]) > 1]

    print("--- 1. Orange Healthy Group Breakdown ---")
    print(f"Singleton Groups (size 1): {len(singletons)} groups, {sum(g['oh_count'] for g in singletons)} images")
    print(f"Multi-Image Same-Class Groups: {len(multi_image)} groups, {sum(g['oh_count'] for g in multi_image)} images")
    print(f"Multi-Class Groups: {len(multi_class)} groups, {sum(g['oh_count'] for g in multi_class)} images\n")

    print("Largest 20 Orange Healthy Groups:")
    sorted_groups = sorted(orange_healthy_groups.items(), key=lambda x: -x[1]["oh_count"])
    for gid, info in sorted_groups[:20]:
        print(f"  - Group {gid}: Total Size={info['total_size']}, OH Count={info['oh_count']}, Split={info['split']}, Classes={dict(info['classes'])}")

    print("\n--- 2. Inspection of LG_SHARED_000687 ---")
    if "LG_SHARED_000687" in orange_healthy_groups:
        lg687 = orange_healthy_groups["LG_SHARED_000687"]
        print(f"Exact total group size: {lg687['total_size']}")
        print(f"Counts per class: {dict(lg687['classes'])}")
        print(f"Assigned split: {lg687['split']}")
        splits_for_lg687 = set(r["split"] for r in lg687["rows"])
        print(f"Splits containing LG_SHARED_000687 images: {splits_for_lg687} (Proof of single split: {len(splits_for_lg687) == 1})")
    else:
        print("LG_SHARED_000687 not found in Orange Healthy groups!")

    print("\n--- 3. Split Distribution of Orange Healthy Images ---")
    split_oh_counts = Counter()
    split_oh_group_counts = Counter()
    for info in orange_healthy_groups.values():
        split_oh_counts[info["split"]] += info["oh_count"]
        split_oh_group_counts[info["split"]] += 1

    for s in ["train", "validation", "test"]:
        cnt = split_oh_counts[s]
        gcnt = split_oh_group_counts[s]
        pct = (cnt / total_oh_images) * 100
        print(f"  - {s.upper()}: {cnt} images ({pct:.2f}%) across {gcnt} groups")

if __name__ == "__main__":
    audit()
