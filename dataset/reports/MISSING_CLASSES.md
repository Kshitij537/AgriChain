# Dataset Gap Analysis & Missing Class Verification Report

This report provides a read-only audit of `dataset/raw/` to verify missing disease classes and evaluate class balance status.

## 1. Class Image Count & Balance Summary

| Crop | Disease Class | Class ID | Current Count | Target | Status |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Cotton** | Healthy | `C01` | 2385 | 500 | **OK (≥500)** |
| **Cotton** | Bacterial Blight | `C02` | 2408 | 500 | **OK (≥500)** |
| **Cotton** | Alternaria Leaf Spot | `C03` | 0 | 500 | **Missing (0)** |
| **Cotton** | Leaf Curl Virus | `C04` | 417 | 500 | **Needs More (1–499)** |
| **Soybean** | Healthy | `S01` | 110 | 500 | **Needs More (1–499)** |
| **Soybean** | Rust | `S02` | 175 | 500 | **Needs More (1–499)** |
| **Soybean** | Downy Mildew | `S03` | 0 | 500 | **Missing (0)** |
| **Soybean** | Bacterial Pustule | `S04` | 110 | 500 | **Needs More (1–499)** |
| **Orange** | Healthy | `O01` | 9898 | 500 | **OK (≥500)** |
| **Orange** | Citrus Canker | `O02` | 11449 | 500 | **OK (≥500)** |
| **Orange** | Black Spot | `O03` | 206 | 500 | **Needs More (1–499)** |
| **Orange** | Greening | `O04` | 369 | 500 | **Needs More (1–499)** |

## 2. Deep Search Results for Missing Classes

### A. Cotton — Alternaria Leaf Spot (`alternaria`, `macrospora`)

- **Found**: NO
- **Raw Audit Status**: Checked all raw folders; no folder names contain `alternaria` or `macrospora`.
- **Recommendation**: Download an external dataset containing Cotton Alternaria Leaf Spot.

### B. Soybean — Downy Mildew (`downy`, `mildew`, `peronospora`)

**Found**: YES

| Raw Relative Location | Matching Keyword | Image Count | Mapped Status |
| :--- | :--- | :---: | :--- |
| `cotton disease dataset\5 Black and white\5 Black and white\Powdery mildew` | `mildew` | 800 | Unmapped |
| `cotton disease dataset\Cotton leaves\40 Images\Powdery mildew` | `mildew` | 800 | Unmapped |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Powdery Mildew Edited` | `mildew` | 38 | Unmapped |
| `cotton disease dataset\HOG brighter\4 HOG brighter\Powdery mildew` | `mildew` | 800 | Unmapped |
| `cotton disease dataset\HOG_data\3 HOG\Powdery mildew` | `mildew` | 800 | Unmapped |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Powdery Mildew` | `mildew` | 520 | Unmapped |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Powdery Mildew` | `mildew` | 600 | Unmapped |
| `soybean disease dataset\powdery_mildew` | `mildew` | 137 | Unmapped |
## 3. Full Raw Leaf Folder Discovery Audit

Total raw leaf folders containing images: `75`

| Relative Raw Folder Path | Image Count |
| :--- | :---: |
| `cotton disease dataset\5 Black and white\5 Black and white\Aphids` | 800 |
| `cotton disease dataset\5 Black and white\5 Black and white\Army worm` | 800 |
| `cotton disease dataset\5 Black and white\5 Black and white\Bacterial blight` | 800 |
| `cotton disease dataset\5 Black and white\5 Black and white\Healthy` | 800 |
| `cotton disease dataset\5 Black and white\5 Black and white\Powdery mildew` | 800 |
| `cotton disease dataset\5 Black and white\5 Black and white\Target spot` | 788 |
| `cotton disease dataset\Cotton leaves\40 Images\Aphids` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Army worm` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Bacterial blight` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Healthy` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Powdery mildew` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Target spot` | 788 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Aphids edited` | 39 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Army worm edited` | 40 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Bacterial Blight edited` | 40 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Healthy leaf edited` | 39 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Powdery Mildew Edited` | 38 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Target spot edited` | 41 |
| `cotton disease dataset\HOG brighter\4 HOG brighter\Aphids` | 800 |
| `cotton disease dataset\HOG brighter\4 HOG brighter\Army worm` | 800 |
| `cotton disease dataset\HOG brighter\4 HOG brighter\Bacterial blight` | 800 |
| `cotton disease dataset\HOG brighter\4 HOG brighter\Healthy` | 800 |
| `cotton disease dataset\HOG brighter\4 HOG brighter\Powdery mildew` | 800 |
| `cotton disease dataset\HOG brighter\4 HOG brighter\Target spot` | 788 |
| `cotton disease dataset\HOG_data\3 HOG\Aphids` | 800 |
| `cotton disease dataset\HOG_data\3 HOG\Army worm` | 800 |
| `cotton disease dataset\HOG_data\3 HOG\Bacterial blight` | 800 |
| `cotton disease dataset\HOG_data\3 HOG\Healthy` | 800 |
| `cotton disease dataset\HOG_data\3 HOG\Powdery mildew` | 800 |
| `cotton disease dataset\HOG_data\3 HOG\Target spot` | 788 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Aphids` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Army worm` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Bacterial Blight` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Healthy` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Powdery Mildew` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Target spot` | 518 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Aphids` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Army worm` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Bacterial Blight` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Healthy` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Powdery Mildew` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Target spot` | 601 |
| `cotton disease dataset\cotton\bacterial_blight` | 448 |
| `cotton disease dataset\cotton\curl_virus` | 417 |
| `cotton disease dataset\cotton\fussarium_wilt` | 419 |
| `cotton disease dataset\cotton\healthy` | 426 |
| `orange disease dataset\test\blackspot` | 22 |
| `orange disease dataset\test\canker` | 22 |
| `orange disease dataset\test\fresh` | 33 |
| `orange disease dataset\test\grenning` | 22 |
| `orange disease dataset\train\Citrus_Canker_Diseases_Leaf_Orange` | 11248 |
| `orange disease dataset\train\Citrus_Nutrient_Deficiency_Yellow_Leaf_Orange` | 12800 |
| `orange disease dataset\train\Healthy_Leaf_Orange` | 6384 |
| `orange disease dataset\train\Multiple_Diseases_Leaf_Orange` | 4800 |
| `orange disease dataset\train\Young_Healthy_Leaf_Orange` | 3200 |
| `orange disease dataset\train\blackspot` | 184 |
| `orange disease dataset\train\canker` | 179 |
| `orange disease dataset\train\fresh` | 281 |
| `orange disease dataset\train\grenning` | 347 |
| `soybean disease dataset\Bacterial Pustule` | 110 |
| `soybean disease dataset\Frogeye Leaf Spot` | 110 |
| `soybean disease dataset\Healty` | 110 |
| `soybean disease dataset\Mossaic Virus` | 22 |
| `soybean disease dataset\Rust` | 110 |
| `soybean disease dataset\Southern blight` | 62 |
| `soybean disease dataset\Sudden Death Syndrome` | 110 |
| `soybean disease dataset\Sudden Death Syndrone` | 110 |
| `soybean disease dataset\Target Leaf Spot` | 110 |
| `soybean disease dataset\Yellow Mosaic` | 110 |
| `soybean disease dataset\bacterial_blight` | 88 |
| `soybean disease dataset\brown_spot` | 81 |
| `soybean disease dataset\crestamento` | 5 |
| `soybean disease dataset\ferrugen` | 65 |
| `soybean disease dataset\powdery_mildew` | 137 |
| `soybean disease dataset\septoria` | 21 |
