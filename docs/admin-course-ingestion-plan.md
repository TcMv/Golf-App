# Admin Course Ingestion V2 Plan

## Objective
Turn the existing multi-course GolfCaddie data model and map editor into a fast, safe course-ingestion workflow that can scale from manual mapping to assisted imports, machine-generated geometry, and operational dataset management.

## Ground rules
- Preserve the existing consumer multi-course flow (`courses` -> `tee_sets` -> `holes`).
- Reuse existing course, hazard, and hole-zone models instead of creating parallel approved-data structures.
- Keep changes incremental and testable.
- Do not change the tee/hole schema merely for theoretical cleanliness; only migrate it when a real product requirement needs per-tee GPS positions/distances.
- New/incomplete course data must not accidentally affect existing playable courses.
- Follow Expo SDK 56 / React Native 0.85 constraints in `AGENTS.md`.

## Phase 1 — Multi-course admin map ✅
**Status:** Complete, validated and merged to `main`. Issue #3 closed. PR #4 merged.

- [x] Dynamic course selection and reload.
- [x] Hole-focused editing + All view.
- [x] Map-tap placement for missing Tee / Green Front / Centre / Back.
- [x] Existing markers remain draggable.
- [x] Safer active-hole / multi-hole / explicit course-wide hazard assignment.
- [x] CI install/typecheck/tests passed.
- [ ] Manual Android/live-Supabase smoke testing remains recommended.

---

## Phase 2 — New-course setup and scorecard ingestion ✅
**Status:** Complete, validated and merged to `main`. Issue #5 closed. PR #6 merged.

- [x] Guided course creation with centre coordinates and 9/18-hole selection.
- [x] Initial tee-set setup.
- [x] Full editable scorecard.
- [x] Bulk scorecard paste with human review before save.
- [x] Duplicate-name and nearby-course warning.
- [x] Existing-course tee-set add/edit/delete management.
- [x] Validation and cleanup on partial creation failure.
- [x] CI install/typecheck/tests passed.
- [ ] Manual Android/live-Supabase creation/edit smoke test remains recommended.

---

## Phase 3 — Rich course geometry for the caddie ✅
**Status:** Complete, validated and merged to `main`. Issue #7 closed. PR #8 merged.

- [x] Dedicated Hole Geometry screen.
- [x] Course + hole selection and satellite-map auto-fit.
- [x] Fairway, green, tee-box and fairway-centreline geometry.
- [x] Draw/replace/delete workflow using existing `hole_zones`.
- [x] CI install/typecheck/tests passed.
- [ ] Manual live-Supabase geometry smoke test remains recommended.

---

## Phase 4 — Completeness, validation, and publication safety ✅
**Status:** Complete, validated and merged to `main`. Issue #9 closed. PR #10 merged.

- [x] Course-readiness/completeness engine.
- [x] Core vs geometry completeness scoring.
- [x] `draft` / `review` / `published` workflow.
- [x] Player-facing course selection exposes published courses only.
- [x] Readiness-gated review/publish transitions.
- [x] CI passed.
- [ ] Manual live-Supabase status smoke test remains recommended.

---

## Phase 5 — Standard import format and bulk ingestion ✅
**Status:** Complete, validated and merged to `main`. Issue #11 closed. PR #12 merged.

- [x] Versioned `golfcaddie.course.v1` contract.
- [x] JSON, CSV and GeoJSON import normalization.
- [x] JSON and GeoJSON export.
- [x] Draft-by-default import with duplicate/nearby checks and rollback cleanup.
- [x] Persistent source/licensing provenance.
- [x] CI passed.
- [ ] Manual live-Supabase import/export smoke test remains recommended.

---

## Phase 6 — Assisted / AI course mapping ✅
**Status:** Complete for the current private/testing stage, validated and merged to `main`. Issue #13 closed. PR #14 merged.

- [x] Separate machine-suggestion persistence boundary.
- [x] Confidence, source reference and source licence per suggestion.
- [x] Atomic accept/reject into existing approved `holes`, `hole_zones` and `hazards`.
- [x] Satellite suggested-vs-approved comparison.
- [x] Drag-to-correct before approval.
- [x] Versioned `golfcaddie.mapping-suggestions.v1` batch contract.
- [x] Admin batch queue.
- [x] First real generator using OpenStreetMap/Overpass golf features.
- [x] OSM provenance and confidence handling.
- [x] CI passed on the final Phase 6 head.

**Deferred operational hardening, not Phase 6 blockers:** live Nambour/Maroochydore smoke testing, OSM duplicate/update handling, confidence calibration from review outcomes, and a second licensed source / imagery-fusion path.

---

## Phase 7 — Scale and dataset operations 🚧
**Status:** Active on `feature/admin-course-ingestion-phase7`. Issue #15.

### 7.1 Operations queue
- [x] Add searchable/filterable Course Operations screen.
- [x] Surface draft/review/published counts and pending machine-suggestion workload.
- [x] Sort courses with pending review work to the top.
- [x] Link directly to readiness and mapping-review tools.
- [ ] Add richer per-course completeness/geometry metrics into the queue without expensive N+1 loading.

### 7.2 Verification and audit foundation
- [x] Add `last_verified_at` and verification notes to courses.
- [x] Add `course_admin_events` audit table.
- [x] Add atomic `mark_course_verified` RPC that also records an audit event.
- [ ] Record publication-status transitions in the audit log.
- [ ] Record accepted/rejected mapping suggestions and manual geometry changes in the audit log.
- [ ] Add per-course history view.

### 7.3 Update/remapping operations
- [ ] Add OSM element-id deduplication and rescan/update detection.
- [ ] Flag source data that has changed since last verification.
- [ ] Add review queue filters for stale/unverified/changed courses.
- [ ] Add course-owner correction intake workflow.

### 7.4 Scale/commercial readiness
- [ ] Production data-source infrastructure and caching/rate limiting if usage justifies it.
- [ ] Evaluate commercial 40k+ course licensing against internal coverage/cost at product traction point.
- [ ] API/export boundary suitable for external commercial customers if pursued.

### Phase 7 validation
- [ ] Current operations/audit slice must pass npm ci, TypeScript and the full test suite.
- [ ] Apply Phase 7 migration and smoke-test verification/event creation against live Supabase.

---

## Progress log
### 2026-08-29
- Implemented, validated and merged Phases 1–6.
- Phase 6 established the full machine-suggestion → human correction → approval path and first OSM generator.
- Started Phase 7 with Issue #15 and a fresh branch.
- Added the first operational work queue plus course verification timestamps and audit-event foundation.
- Next focus: validate this slice, then expand audit coverage and add source-update/deduplication operations.
