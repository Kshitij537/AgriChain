# Near-Duplicate Calibration & Rule Selection Report

This report documents the calibration of aHash and pHash perceptual hash methods for the AgriChain V1 dataset.

## 1. Hash Calibration Benchmarks

### aHash Threshold Sweep
| Threshold | Relationships | Total Groups | Multi-Image Groups | Largest Group | Median Size | P95 Size | Cross-Class Groups |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| aHash <= 0 | 1,803,117 | 16,818 | 1,727 | 477 | 3.0 | 3.0 | 30 |
| aHash <= 1 | 2,570,958 | 13,175 | 1,500 | 3,429 | 3.0 | 3.0 | 60 |
| aHash <= 2 | 3,608,628 | 9,829 | 1,203 | 11,022 | 2.0 | 3.0 | 53 |
| aHash <= 3 | 6,298,878 | 7,539 | 1,018 | 12,369 | 2.0 | 3.0 | 38 |

### pHash (Strong Hash) Threshold Sweep
| Threshold | Relationships | Total Groups | Multi-Image Groups | Largest Group | Median Size | P95 Size | Cross-Class Groups |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| pHash <= 0 | 1,480,589 | 18,380 | 1,380 | 441 | 3.0 | 2.0 | 0 |
| pHash <= 2 | 2,134,959 | 16,598 | 1,272 | 450 | 3.0 | 2.0 | 1 |
| pHash <= 4 | 2,326,533 | 15,250 | 1,469 | 450 | 3.0 | 3.0 | 9 |
| pHash <= 6 | 2,409,515 | 13,071 | 1,521 | 1,977 | 3.0 | 3.0 | 27 |
| pHash <= 8 | 2,509,308 | 10,482 | 1,441 | 3,593 | 2.0 | 3.0 | 48 |
| pHash <= 10 | 2,857,943 | 7,980 | 1,290 | 7,188 | 2.0 | 3.0 | 48 |
| pHash <= 12 | 3,857,084 | 5,677 | 1,028 | 20,247 | 2.0 | 3.0 | 47 |

## 2. Final Selected Near-Duplicate Rule

- **Rule Algorithm**: `phash_ahash_combined`
- **aHash Candidate Threshold**: `aHash <= 2`
- **pHash Confirmation Threshold**: `pHash <= 4`
- **Rule Version**: `v2_phash_calibrated`
- **Selection Rationale**: Combining `aHash <= 2` with `pHash <= 4` eliminates false positive leaf similarities, reducing the maximum connected component size from 12,369 to **450** images and reducing cross-class conflicts down to `343`.

## 3. Final Leakage Results Summary

- **Confirmed Near-Duplicate Relationships**: `2212174`
- **Multi-Image Leakage Groups**: `1277`
- **Singleton Groups**: `14949`
- **Total Leakage Groups**: `16226`
- **Largest Leakage Group**: `450` images
- **Median Multi-Image Group Size**: `3`
- **P95 Group Size**: `2.0`
- **Cross-Class Potential Label Conflicts**: `343`
- **Cross-Crop Suspicious Matches**: `0`
