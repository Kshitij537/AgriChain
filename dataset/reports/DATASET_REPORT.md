# Dataset Standardization & Consolidation Report

This report documents the consolidation of raw downloaded datasets into the standardized AgriChain Version 1 format.

## 1. Final Image Count Per Class

| Crop | Disease Class | Class ID | Consolidated Count | Target | Status |
| :--- | :--- | :---: | :---: | :---: | :--- |
| **Cotton** | Healthy | `C01` | 2718 | 500 | **OK** |
| **Cotton** | Bacterial Blight | `C02` | 2626 | 500 | **OK** |
| **Cotton** | Alternaria Leaf Spot | `C03` | 173 | 500 | **Needs More** |
| **Cotton** | Leaf Curl Virus | `C04` | 417 | 500 | **Needs More** |
| **Soybean** | Healthy | `S01` | 6108 | 500 | **OK** |
| **Soybean** | Rust | `S02` | 175 | 500 | **Needs More** |
| **Soybean** | Bacterial Pustule | `S03` | 110 | 500 | **Needs More** |
| **Soybean** | Brown Spot | `S04` | 81 | 500 | **Needs More** |
| **Orange** | Healthy | `O01` | 9898 | 500 | **OK** |
| **Orange** | Citrus Canker | `O02` | 11449 | 500 | **OK** |
| **Orange** | Black Spot | `O03` | 206 | 500 | **Needs More** |
| **Orange** | Greening | `O04` | 5876 | 500 | **OK** |

**Total Consolidated Images**: `39837`

## 2. Imported Images

Total newly imported images from external datasets: `12229`

| Source Raw Dataset | Count of Imported Images |
| :--- | :---: |
| `Cotton Leaf Image Dataset for Disease Classificati` | 724 |
| `newDS` | 11505 |

## 3. Ignored & Excluded Classes (Outside V1 Scope)

| Disease/Pest Name | Ignored File Count |
| :--- | :---: |
| `Caterpillar` | 3309 |
| `Diabrotica speciosa` | 2205 |
| `Frogeye leaf spot` | 110 |
| `Fusarium/Verticillium Wilt` | 649 |
| `Mosaic virus` | 22 |
| `Multiple diseases` | 4800 |
| `Nutrient deficiency` | 12800 |
| `Powdery mildew` | 137 |
| `Preprocessed Feature HOG/BW Data` | 14364 |
| `Septoria` | 21 |
| `Southern blight` | 150 |
| `Sudden death syndrome` | 220 |
| `Target leaf spot` | 110 |
| `Yellow mosaic` | 110 |

## 4. Skipped Augmented Dataset

| Dataset Folder | Status | Reason |
| :--- | :---: | :--- |
| `Cotton_Augmented_Dataset` | **Skipped** | Synthetic augmentations will be generated during ML training. |

## 5. Unknown / Unmapped Folders

| Relative Folder Path | File Count |
| :--- | :---: |
| `cotton disease dataset\Cotton leaves\40 Images\Aphids` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Army worm` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Powdery mildew` | 800 |
| `cotton disease dataset\Cotton leaves\40 Images\Target spot` | 788 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Aphids edited` | 39 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Army worm edited` | 40 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Powdery Mildew Edited` | 38 |
| `cotton disease dataset\Cotton plant disease\Cotton plant disease\Target spot edited` | 41 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Aphids` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Army worm` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Powdery Mildew` | 520 |
| `cotton disease dataset\Main dataset-20230209T170929Z-001\Main dataset\Target spot` | 518 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Aphids` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Army worm` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Powdery Mildew` | 600 |
| `cotton disease dataset\Main dataset-20230209T191052Z-001\Main dataset\Target spot` | 601 |
| `cotton disease dataset\cotton\fussarium_wilt` | 419 |
| `soybean disease dataset\crestamento` | 5 |
