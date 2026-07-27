# Disease Detection Development Checklist

## Phase 1.1 — Scaffolding & Setup
- [x] Create complete folder structures across services
- [x] Set up empty file scaffolding for controllers, routes, middleware, and ML utilities
- [x] Configure `.gitignore` rules for cache and model exclusions

## Phase 1.2 — Architecture & Design Freeze
- [x] **Milestone 1.2.1**: Functional Requirements Freeze (JWT Authentication, Selected Farm Context, Allowed MIME types, etc.)
- [x] **Milestone 1.2.2**: End-to-End Data Flow (Defined component data flows)
- [x] **Milestone 1.2.3**: API Contract Freeze (Defined Express routing endpoints, request/response models)
- [x] **Milestone 1.2.4**: Database Integration Design (Persisting predictions inside `diseases` schema)
- [x] **Milestone 1.2.5**: Image Upload Strategy (Buffered stream forwarding with Multer file constraints)
- [x] **Milestone 1.2.6**: ML Service Contract (Established internal FastAPI `/predict` payload parameters)
- [x] **Milestone 1.2.7**: Frontend State Architecture (Organized react custom hook properties)
- [x] **Milestone 1.2.8**: Validation Rules (MIME check, size verification, farm ownership confirmation)
- [x] **Milestone 1.2.9**: Error Handling Matrix (Documented HTTP response mapping)
- [x] **Milestone 1.2.10**: Architecture Freeze Review

---

## Phase 2 — Backend Foundation
- [x] **Milestone 2.1**: Upload Infrastructure (Multer memory storage, format limiters, and error handling)
- [x] **Milestone 2.2**: Validation Layer (Positive integer verification, parameter, body validations)
- [x] **Milestone 2.3**: ML Service Communication (Axios client, environment configurations, and error mappings)
- [x] **Milestone 2.4**: Disease Controller (Orchestrator logic, model/query isolations, and error status mappings)
- [x] **Milestone 2.5**: Disease Routes (Verify endpoints, middleware order, and finalize API contract)
- [x] **Milestone 2.6**: Database Persistence (PostgreSQL parameterized queries, mapping, and error translation)
- [ ] **Milestone 2.7**: API Testing
- [ ] **Milestone 2.8**: Backend Review & Freeze

---

## Phase ML-0.1 — Dataset Collection & Setup
- [x] **Milestone ML-0.1.1**: Finalize 12 disease classes (Cotton, Soybean, Orange)
- [x] **Milestone ML-0.1.2**: Create directory folder structure (`dataset/`)
- [x] **Milestone ML-0.1.3**: Document quality and rejection criteria
- [x] **Milestone ML-0.1.4**: Define dataset search keywords and preferred open repositories
- [x] **Milestone ML-0.1.5**: Download, consolidate, and standardize raw images to `dataset/processed/`

### Dataset Search Keywords
| Crop | Disease | Search Keywords |
| :--- | :--- | :--- |
| **Cotton** | Healthy | `cotton healthy leaf` |
| | Bacterial Blight | `cotton bacterial blight`, `angular leaf spot` |
| | Alternaria Leaf Spot | `cotton alternaria leaf spot` |
| | Leaf Curl Virus | `cotton leaf curl disease`, `CLCuD` |
| **Soybean** | Healthy | `soybean healthy leaf` |
| | Rust | `soybean rust`, `phakopsora pachyrhizi` |
| | Downy Mildew | `soybean downy mildew` |
| | Bacterial Pustule | `soybean bacterial pustule` |
| **Orange** | Healthy | `orange healthy leaf`, `citrus healthy leaf` |
| | Citrus Canker | `citrus canker`, `orange citrus canker` |
| | Black Spot | `citrus black spot`, `orange black spot` |
| | Greening | `citrus greening`, `huanglongbing`, `HLB citrus` |

### Dataset Collection Tracking Sheet
| Crop | Disease | Class ID | Target | Collected | Status |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **Cotton** | Healthy | C01 | 500 | 2,718 | ✅ Ready |
| | Bacterial Blight | C02 | 500 | 2,626 | ✅ Ready |
| | Alternaria Leaf Spot | C03 | 500 | 173 | ⏳ Pending (Augment) |
| | Leaf Curl Virus | C04 | 500 | 417 | ✅ Ready |
| **Soybean** | Healthy | S01 | 500 | 6,108 | ✅ Ready |
| | Rust | S02 | 500 | 175 | ⏳ Pending (Augment) |
| | Bacterial Pustule | S03 | 500 | 110 | ⏳ Pending (Augment) |
| | Brown Spot | S04 | 500 | 81 | ⏳ Pending (Augment) |
| **Orange** | Healthy | O01 | 500 | 9,898 | ✅ Ready |
| | Citrus Canker | O02 | 500 | 11,449 | ✅ Ready |
| | Black Spot | O03 | 500 | 206 | ⏳ Pending (Augment) |
| | Greening (HLB) | O04 | 500 | 5,876 | ✅ Ready |

---

## Phase ML-0.2 — Dataset Cleaning & Validation
- [x] **Milestone ML-0.2.1**: Image Integrity Validation (Zero corrupted or truncated files, zero-byte checks)
- [x] **Milestone ML-0.2.2**: Exact and Near-Duplicate Detection (SHA-256 and custom aHash perceptual hashing)
- [x] **Milestone ML-0.2.3**: Dataset Metadata Generation (`DATASET_MANIFEST.csv` completed with indices and source mappings)
- [x] **Milestone ML-0.2.4**: Dataset Statistics Profiling (`DATASET_STATS.json` generated)
- [x] **Milestone ML-0.2.5**: Dataset Freeze (`DATASET_FREEZE.md` locked)





