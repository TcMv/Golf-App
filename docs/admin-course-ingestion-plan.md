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
- [x] Existing-course tee-set add/edit/delete management.
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

## Phase 5 — Standard import format and bulk ingestion ✅
**Status:** Complete, validated and merged to `main`. Issue #11 closed. PR #12 merged.

### 5.1 Canonical interchange contract
- [x] Define `golfcaddie.course.v1` JSON schema contract.
- [x] Include source/provenance metadata in the interchange format.
- [x] Keep v1 aligned with the current data model rather than silently discarding unsupported per-hole/per-tee distances.
- [x] Document mapping from the contract into `courses`, `holes`, `tee_sets`, `hole_zones` and `hazards`.
- [x] Document draft-by-default import safety model and versioning policy.

### 5.2 Parser, converters and validation
- [x] Add pure JSON parser/validator.
- [x] Add self-contained CSV scorecard converter into v1.
- [x] Add GolfCaddie GeoJSON FeatureCollection converter into v1.
- [x] Add v1 -> JSON and v1 -> GeoJSON export converters.
- [x] Validate schema version, course centre, scorecard, tee sets, GPS, zones and hazards.
- [x] Return structured errors/warnings with field paths.
- [x] Add dedicated import and converter tests and wire them into CI.

### 5.3 Import workflow
- [x] Import screen supports JSON, CSV and GeoJSON.
- [x] Normalize all formats to `golfcaddie.course.v1` before database writes.
- [x] Show course summary, errors, warnings and import preview.
- [x] Block duplicate names and warn for nearby centres within 250m.
- [x] Import course, tee sets, holes/GPS, zones and hazards into the existing schema.
- [x] Imported courses are explicitly created as draft.
- [x] Cleanup the course record if a downstream insert fails.

### 5.4 Export and provenance
- [x] Add existing-course export screen.
- [x] Export full GolfCaddie v1 JSON.
- [x] Export GeoJSON for GIS/mapping workflows.
- [x] Add persistent source provider/id/url/retrieved/license/notes fields on courses.
- [x] Imported source/licensing metadata is persisted and included in later exports.

### Phase 5 validation
- [x] `npm ci` passed.
- [x] `npm run typecheck` passed.
- [x] Existing tests + course import + converter tests passed.
- [ ] Manual live-Supabase JSON/CSV/GeoJSON import/export smoke test remains recommended after applying the provenance migration.

---

## Phase 6 — Assisted / AI course mapping 🚧
**Status:** Active on `feature/admin-course-ingestion-phase6` / PR #14. Issue #13.

**Goal:** Move humans from drawing every feature to reviewing machine-generated suggestions, while keeping machine data isolated from approved/playable course geometry until explicitly accepted.

### 6.1 Suggestion boundary
- [x] Add separate `course_mapping_suggestions` persistence model.
- [x] Support tee/green points, surface polygons, fairway centrelines and hazard polygons.
- [x] Keep pending machine data separate from `holes`, `hole_zones` and `hazards`.
- [x] Store confidence, source provider/reference and source license per suggestion.
- [x] Add explicit `pending` / `accepted` / `rejected` review status.
- [x] Add pure suggestion validator for geometry type, point count, coordinate ranges, confidence and source/licensing warnings.
- [x] Add approval-action mapping into the existing approved-data model.
- [x] Add dedicated suggestion tests and wire them into CI.

### 6.2 Human review workflow
- [x] Add Mapping Review admin screen.
- [x] Add course selector and pending suggestion queue.
- [x] Show feature type, geometry type, point count, confidence and source/licensing data.
- [x] Block approval when source licensing is missing.
- [x] Accept tee/green point suggestions into `holes`.
- [x] Accept fairway/green/tee-box/centreline suggestions into `hole_zones`.
- [x] Accept hazard suggestions into `hazards`.
- [x] Reject suggestions without touching approved geometry.
- [x] Make accept/reject atomic with a database RPC so approved-data writes and review status cannot diverge; repeated review is rejected and hazard duplication from partial approval is prevented.
- [x] Add satellite-map overlay comparing the suggestion with current approved geometry and tee/green context.
- [x] Add edit-before-accept with draggable suggested point/line/polygon vertices and persisted corrections.

### 6.3 Suggestion generation and batch ingestion
- [x] Define `golfcaddie.mapping-suggestions.v1` batch contract.
- [x] Add pure batch parser/validator using the same single-suggestion validation rules.
- [x] Carry provider/reference/license metadata from the batch into every queued suggestion.
- [x] Add admin batch-import screen that verifies the target course and queues suggestions as pending only.
- [x] Add dedicated batch tests and wire them into CI.
- [ ] Identify imagery/data sources that explicitly permit automated commercial extraction.
- [ ] Build the first permitted-source adapter/generator for tees/greens/fairways/hazards/centrelines.
- [ ] Calibrate confidence thresholds against human review outcomes.
- [ ] Normalize accepted/generated course packages through `golfcaddie.course.v1` where appropriate.
- [ ] Add batch course review workflow once single-course review is proven with live data.

### Phase 6 validation
- [x] `npm ci` passed on the current Phase 6 slice.
- [x] `npm run typecheck` passed.
- [x] Existing tests + import/converter + mapping-suggestion + batch tests passed.
- [x] Atomic-review client changes passed the same CI gate.
- [x] Satellite comparison/edit and batch-ingestion UI passed the same CI gate.
- [ ] Manual live-Supabase suggestion create/import/review/edit/accept/reject smoke test remains recommended after applying Phase 6 migrations.

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
- Implemented, validated and merged Phases 1–5.
- Started Phase 6 on a fresh branch with Issue #13 and draft PR #14.
- Added a separate machine-suggestion table so AI/generated geometry cannot directly change playable course data.
- Added feature/geometry validation, confidence and source-license checks, and atomic human approval into existing course structures.
- Added satellite comparison against approved geometry plus drag-to-correct editing before acceptance.
- Added the `golfcaddie.mapping-suggestions.v1` batch contract and admin batch queue so an external mapping engine can now feed the review workflow without direct writes to playable geometry.
- Latest Phase 6 CI passed install, TypeScript and the complete test suite after adding map review/edit and batch ingestion.
- Next focus: choose a legally usable mapping source and build the first real suggestion generator, then measure its accuracy through the review queue.
