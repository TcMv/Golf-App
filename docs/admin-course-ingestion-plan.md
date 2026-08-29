# Admin Course Ingestion V2 Plan

## Objective
Turn the existing multi-course GolfCaddie data model and map editor into a fast, safe course-ingestion workflow that can scale from manual mapping to assisted imports and, later, AI-generated course geometry.

## Ground rules
- Preserve the existing consumer multi-course flow (`courses` -> `tee_sets` -> `holes`).
- Reuse existing course, hazard, and hole-zone models instead of creating parallel data structures.
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
- [x] Existing tee-set add/edit/delete management.
- [x] Validation and cleanup on partial creation failure.
- [x] CI install/typecheck/tests passed.
- [ ] Manual Android/live-Supabase creation/edit smoke test remains recommended.

---

## Phase 3 — Rich course geometry for the caddie ✅
**Status:** Complete, validated and merged to `main`. Issue #7 closed. PR #8 merged.

**Key architecture discovery:** existing `hole_zones` already supports `green`, `fairway`, `tee_box`, and `fairway_centreline`; ActiveRound already loads the data and the caddie already consumes it.

- [x] Dedicated Hole Geometry screen.
- [x] Course + hole selection and satellite-map auto-fit.
- [x] Display existing fairway, green, tee-box and centreline geometry.
- [x] Draw/replace/delete fairway, green and centreline geometry.
- [x] Optional tee-box support.
- [x] Existing schema reused; no duplicate geometry model.
- [x] CI install/typecheck/tests passed.
- [ ] Manual live-Supabase geometry smoke test remains recommended.

**Deferred:** direct vertex editing and per-tee GPS schema remain demand-driven enhancements rather than Phase 3 blockers.

---

## Phase 4 — Completeness, validation, and publication safety ✅
**Status:** Complete, validated and merged to `main`. Issue #9 closed. PR #10 merged.

- [x] Pure course-readiness/completeness engine.
- [x] Core vs geometry completeness scoring.
- [x] Scorecard, GPS and geometry sanity checks.
- [x] Course Readiness admin dashboard.
- [x] `draft` / `review` / `published` workflow.
- [x] Existing courses preserved as published; new courses default to draft.
- [x] Player course and home-course selection expose published courses only.
- [x] Readiness-gated review/publish transitions.
- [x] CI install/typecheck/all tests passed.
- [ ] Manual live-Supabase readiness/status smoke test remains recommended.

---

## Phase 5 — Standard import format and bulk ingestion 🚧
**Status:** Active on `feature/admin-course-ingestion-phase5` / PR #12. Issue #11.

### 5.1 Canonical interchange contract
- [x] Define `golfcaddie.course.v1` JSON schema contract.
- [x] Include source/provenance metadata in the interchange format.
- [x] Keep v1 aligned with the current data model rather than silently discarding unsupported per-hole/per-tee distances.
- [x] Document mapping from the contract into `courses`, `holes`, `tee_sets`, `hole_zones` and `hazards`.
- [x] Document draft-by-default import safety model and versioning policy.

### 5.2 Parser and validation
- [x] Add pure JSON parser/validator.
- [x] Validate schema version, course centre, 9/18-hole count, complete scorecard, par, SI, distances and tee sets.
- [x] Validate optional hole GPS, zone types/geometry and hazard types/geometry.
- [x] Return structured errors and warnings with field paths.
- [x] Add dedicated import tests and wire them into CI.

### 5.3 JSON import workflow
- [x] Add Import Course JSON admin screen.
- [x] Paste JSON and validate before any database writes.
- [x] Show course summary, errors, warnings and import preview.
- [x] Block duplicate names.
- [x] Warn for nearby course centres within 250m and require explicit second action.
- [x] Import course, tee sets, holes/GPS, zones and hazards into the existing schema.
- [x] Imported courses are explicitly created as draft.
- [x] Cleanup the course record if a downstream insert fails so cascades remove the partial import.
- [x] Register the import screen in navigation and Settings.
- [x] Current Phase 5 slice passes install, typecheck and all tests including import tests.

### 5.4 Remaining Phase 5 work
- [ ] JSON export for an existing course.
- [ ] CSV/structured scorecard converter into v1.
- [ ] GeoJSON geometry converter into v1.
- [ ] Persist source/provenance metadata alongside imported courses.
- [ ] Manual live-Supabase import smoke test.

---

## Phase 6 — Assisted / AI course mapping
- [ ] Identify imagery/data sources that permit automated commercial extraction.
- [ ] Generate proposed tees/greens/fairways/hazards/centrelines.
- [ ] Store suggestions separately from approved geometry.
- [ ] Confidence scoring.
- [ ] Accept/reject/edit workflow per feature and per hole.
- [ ] Batch course review workflow.

---

## Phase 7 — Scale and commercial dataset operations
- [ ] Admin work queue and search/filtering.
- [ ] Verification timestamps and source provenance.
- [ ] Change history/audit trail.
- [ ] Course-owner correction workflow.
- [ ] Update detection / remapping workflow.
- [ ] API/export boundary suitable for external commercial customers if pursued.

---

## Progress log
### 2026-08-29
- Implemented, validated and merged Phases 1–4.
- Started Phase 5 with a canonical versioned import contract rather than adding another provider-specific ingestion path.
- Added a tested parser/validator for the contract.
- Added an admin JSON import preview and safe draft import path that writes course, scorecard/GPS, tee sets, zones and hazards with duplicate checks and rollback cleanup.
- Remaining Phase 5 work is export plus CSV/GeoJSON normalization and source-provenance persistence.
