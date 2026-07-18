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
- [ ] **Milestone 2.5**: Disease Routes
- [ ] **Milestone 2.6**: Database Persistence
- [ ] **Milestone 2.7**: API Testing
- [ ] **Milestone 2.8**: Backend Review & Freeze

