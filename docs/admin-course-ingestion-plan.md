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

## Current state confirmed
- [x] Consumer app already supports multiple courses.
- [x] Start Round dynamically loads all courses, the selected course's tee sets, and the selected course's holes.
- [x] Course database is normalized around `courses`, `tee_sets`, `holes`, `hazards`, and `hole_zones`.
- [x] Existing admin map editor can edit tee/green points and draw/edit hazard polygons.
- [x] Admin map editor supports dynamic course selection and missing-point placement.
- [x] Guided new-course, scorecard, bulk-paste and tee-set admin workflows exist.
- [x] `hole_zones` stores green, fairway, tee-box and fairway-centreline geometry.
- [x] ActiveRound already fetches hole-zone geometry and the caddie already consumes fairway-centreline data.
- [ ] No completeness/publication workflow exists before considering a mapped course ready.

---

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
**Status:** Feature-complete and automated validation passed on `feature/admin-course-ingestion-phase3` / PR #8. Issue #7.

**Key architecture discovery:** no new geometry schema was needed. Existing `hole_zones` already supports `green`, `fairway`, `tee_box`, and `fairway_centreline`; ActiveRound already loads the data and the caddie already uses fairway centrelines.

### Geometry admin
- [x] Dedicated Hole Geometry screen.
- [x] Course + hole selection and satellite-map auto-fit.
- [x] Existing fairway, green, tee-box and centreline display.
- [x] Draw/replace fairway polygons.
- [x] Draw/replace green polygons.
- [x] Draw/replace fairway centreline routes.
- [x] Optional tee-box polygon support.
- [x] Upsert to existing one-zone-per-hole/type records.
- [x] Delete existing geometry.
- [x] Undo/cancel while drawing.
- [x] Navigation + Settings entry point.

### Phase 3 decisions
- Direct vertex editing of existing hole zones is deferred. Redraw is sufficient for the current ingestion workflow and avoids expanding this phase merely for convenience; add later if real mapping use shows it saves meaningful time.
- Per-tee GPS schema remains deferred until tee-specific coordinate requirements become a demonstrated limitation.

### Phase 3 validation
- [x] `npm ci` passed.
- [x] `npm run typecheck` passed.
- [x] Existing unit-test suite passed.
- [ ] Manual live-Supabase draw/upsert/delete smoke test remains recommended.

---

## Phase 4 — Completeness, validation, and publication safety 🚧
**Status:** Next active phase after Phase 3 merge.

**Goal:** Know whether a course is actually ready and prevent poor/incomplete data reaching users.

- [ ] Course completeness calculation.
- [ ] Missing tee/green/hole data checks.
- [ ] Geometry sanity checks (distance, remote polygons, invalid vertices, etc.).
- [ ] Scorecard sanity checks.
- [ ] Decide and implement draft/review/published status.
- [ ] Show actionable validation results to the admin.
- [ ] Ensure player course lists only expose appropriate publication states once status is introduced.

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
- Reconfirmed the consumer app was already multi-course.
- Implemented, validated and merged Phase 1.
- Added GitHub Actions CI covering install, TypeScript typecheck and existing unit tests.
- Implemented, validated and merged Phase 2.
- Discovered the existing `hole_zones` + caddie geometry foundation.
- Built and validated the Phase 3 Hole Geometry admin workflow without duplicating the existing schema.
- Phase 4 is next: completeness, validation and publication safety.
