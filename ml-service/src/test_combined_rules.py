import os
import csv
import sys
import numpy as np
from collections import defaultdict
import imagehash
from PIL import Image

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PROCESSED_DIR = os.path.join(PROJECT_ROOT, "dataset", "processed")
REPORTS_DIR = os.path.join(PROJECT_ROOT, "dataset", "reports")

sys.path.append(os.path.join(PROJECT_ROOT, "ml-service", "src"))
from validation.config import SUPPORTED_EXTENSIONS

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

def get_stats(components, nodes):
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
    
    cross_class = 0
    for comp in multi_comps:
        node_classes = {p.split("/")[1] + "/" + p.split("/")[2] for p in comp}
        if len(node_classes) > 1:
            cross_class += 1
            
    return total_g, multi_g, largest, median, p95, cross_class

def main():
    images = scan_images()
    nodes = [img["processed_path"] for img in images]
    
    print("Computing hashes...")
    ahashes, phashes = {}, {}
    for img in images:
        p = img["processed_path"]
        ah = compute_ahash(img["abs_path"])
        ph = compute_phash(img["abs_path"])
        if ah is not None: ahashes[p] = ah
        if ph is not None: phashes[p] = ph
        
    print("Finding candidates within crop...")
    crop_groups = defaultdict(list)
    for img in images:
        crop_groups[img["crop"]].append(img)
        
    pairs = []
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
                pairs.append({
                    "p1": p1, "p2": p2,
                    "c1": f"{img1['crop']}/{img1['disease']}",
                    "c2": f"{img2['crop']}/{img2['disease']}",
                    "adist": ham_dist(ah1, ah2),
                    "pdist": ham_dist(ph1, ph2)
                })
                
    rules = [
        ("pHash <= 4", lambda p: p["pdist"] <= 4),
        ("pHash <= 6", lambda p: p["pdist"] <= 6),
        ("aHash <= 1 AND pHash <= 4", lambda p: p["adist"] <= 1 and p["pdist"] <= 4),
        ("aHash <= 2 AND pHash <= 4", lambda p: p["adist"] <= 2 and p["pdist"] <= 4),
        ("aHash <= 2 AND pHash <= 6", lambda p: p["adist"] <= 2 and p["pdist"] <= 6),
    ]
    
    print("\n--- Combined Rules Evaluation ---")
    for name, rule_fn in rules:
        edges = [(p["p1"], p["p2"]) for p in pairs if rule_fn(p)]
        total_g, multi_g, largest, median, p95, cross_class = get_stats(find_connected_components(nodes, edges), nodes)
        print(f"Rule '{name}': pairs={len(edges)}, groups={total_g}, multi={multi_g}, largest={largest}, median={median}, p95={p95:.1f}, cross-class={cross_class}", flush=True)

if __name__ == "__main__":
    main()
