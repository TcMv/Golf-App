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

## Phase 4 — Completeness, validation, and publication safety 🚧
**Status:** Active on `feature/admin-course-ingestion-phase4` / PR #10. Issue #9.

**Goal:** Know whether a course is actually ready and prevent poor/incomplete data reaching users.

### 4.1 Readiness engine
- [x] Add pure `validateCourseReadiness` engine.
- [x] Separate core/basic completeness from rich-geometry completeness.
- [x] Validate hole-row count, tee sets, par, stroke index, tee distance and duplicate stroke indexes.
- [x] Validate tee GPS and green front/centre/back coverage.
- [x] Add tee-to-green GPS sanity check.
- [x] Validate minimum polygon/centreline point counts.
- [x] Make geometry expectations par-aware: par 3s do not require fairway/centreline.
- [x] Return actionable error/warning codes and per-hole messages.
- [x] Add dedicated unit tests and run them in CI.

### 4.2 Admin readiness UI
- [x] Add Course Readiness screen.
- [x] Add course selector + refresh.
- [x] Show overall/core/geometry completeness.
- [x] Show coverage metrics for holes, tees, GPS, greens, fairways and centrelines.
- [x] Separate must-fix errors from recommended geometry improvements.
- [x] Add Settings/navigation entry point.

### 4.3 Publication safety
- [ ] Decide final `draft` / `review` / `published` workflow.
- [ ] If status is introduced, migrate existing courses safely to `published`.
- [ ] Make newly created courses non-public by default.
- [ ] Filter every player-facing course query by publication state.
- [ ] Gate publish action on readiness rules.

### Phase 4 validation
- [x] `npm ci` passed on the current implementation slice.
- [x] `npm run typecheck` passed.
- [x] Existing tests + new course-readiness tests passed.
- [ ] Manual live-Supabase readiness-screen smoke test remains recommended.

---

## Phase 5 — Standard import format and bulk ingestion
- [ ] Define versioned GolfCaddie course JSON format.
- [ ] JSON import/export.
- [ ] GeoJSON geometry import.
- [ ] CSV/structured scorecard import.
- [ ] Import preview + validation before committing.
- [ ] Provenance fields/metadata where commercially necessary.

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
- Implemented, validated and merged Phases 1–3.
- Phase 4 started with a tested readiness engine and admin Course Readiness dashboard.
- Publication status is intentionally the next decision: it will only be introduced together with player-query filtering so draft courses cannot leak into normal course selection.
