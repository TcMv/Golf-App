# Admin Course Ingestion V2 Plan

## Objective
Turn the existing multi-course GolfCaddie data model and map editor into a fast, safe course-ingestion workflow that can scale from manual mapping to assisted imports and, later, AI-generated course geometry.

## Ground rules
- Preserve the existing consumer multi-course flow (`courses` -> `tee_sets` -> `holes`).
- Reuse the existing map editor, polygon drawing, hazard tagging, and vertex editing rather than rewriting them.
- Keep changes incremental and testable.
- Do not change the tee/hole schema merely for theoretical cleanliness; only migrate it when a real product requirement needs per-tee GPS positions/distances.
- New/incomplete course data must not accidentally affect existing playable courses.
- Follow Expo SDK 56 / React Native 0.85 constraints in `AGENTS.md`.

## Current state confirmed
- [x] Consumer app already supports multiple courses.
- [x] Start Round dynamically loads all courses, the selected course's tee sets, and the selected course's holes.
- [x] Course database is normalized around `courses`, `tee_sets`, `holes`, and `hazards`.
- [x] Existing admin map editor can edit tee/green points and draw/edit hazard polygons.
- [x] Admin map editor no longer relies on a hard-coded course UUID on the Phase 1 branch.
- [ ] New-course creation is not yet an efficient guided workflow.
- [x] Phase 1 branch adds map-tap placement for missing GPS markers.
- [ ] No completeness/validation workflow exists before considering a course ready.

---

## Phase 1 — Make the existing admin editor efficient for multiple courses
**Status:** Implementation complete on `feature/admin-course-ingestion-v2`; runtime/device validation pending before merge.

**Tracking:** GitHub issue #3 — Admin Course Ingestion V2 — Phase 1.

**Goal:** Use the current editor safely for any course already in Supabase and make basic mapping much faster.

### 1.1 Dynamic course selection
- [x] Remove hard-coded `COURSE_ID` from `AdminMapScreen`.
- [x] Load available courses from Supabase.
- [x] Add a course selector to the admin editor.
- [x] Reload holes/hazards when the selected course changes.
- [x] Re-centre the map on the selected course.
- [x] Reset active drawing/edit state when changing courses.

### 1.2 Hole-focused workflow
- [x] Add a horizontal Hole 1..N selector.
- [x] Allow `All` view for whole-course inspection.
- [x] Filter/highlight hazards and markers to the active hole.
- [x] Auto-fit the map to the active hole when tee/green coordinates exist.

### 1.3 Place missing GPS points
- [x] Add placement mode for Tee / Green Front / Green Centre / Green Back.
- [x] Allow map-tap placement when a coordinate is currently null.
- [x] Preserve drag-to-adjust behaviour for existing points.
- [x] Make the active placement mode visually obvious and cancellable.

### 1.4 Safer hazard assignment
- [x] Default a new polygon to the currently selected hole.
- [x] Make course-wide assignment explicit rather than treating no selection as course-wide.
- [x] Keep multi-hole assignment for shared hazards.

### Phase 1 validation checklist
- [ ] Run project TypeScript/typecheck against the Phase 1 branch.
- [ ] Open Course Editor on Android and confirm the course chips load from live Supabase.
- [ ] Confirm Nambour loads its own holes/hazards.
- [ ] Confirm Maroochydore loads its own holes/hazards.
- [ ] Switch courses with a polygon partly drawn and confirm the drawing is cleared.
- [ ] Select a hole and confirm map auto-fit works with tee/green data.
- [ ] Place a missing Tee / Front / Centre / Back point and confirm Supabase persistence.
- [ ] Drag an existing point and confirm persistence still works.
- [ ] Create a hazard for the active hole and confirm it is not treated as course-wide.
- [ ] Create an explicitly course-wide polygon and confirm it remains visible hole-by-hole.
- [ ] Confirm existing polygon vertex edit/delete flows still work.

**Phase 1 exit criteria**
- Admin can select Nambour, Maroochydore, or any other existing course and edit the correct records.
- Admin can map an unmapped hole without manually editing database coordinates.
- Switching courses cannot leave a drawing/edit operation attached to the previous course.

---

## Phase 2 — New-course setup and scorecard ingestion
**Goal:** Create the basic data structure for a new course quickly.

### 2.1 Create course
- [ ] Add `Create Course` workflow.
- [ ] Capture name, centre latitude/longitude, and hole count.
- [ ] Create empty hole rows automatically (9/18 initially; support other counts if useful).
- [ ] Validate duplicate course names/nearby coordinates before creation.

### 2.2 Tee set setup
- [ ] Add/edit/delete tee sets.
- [ ] Capture name, colour, total distance, course rating, and slope.

### 2.3 Scorecard editor
- [ ] Editable hole grid for par, stroke index, and current supported distance fields.
- [ ] Bulk paste/import path for structured scorecard data.
- [ ] Validate par/SI completeness and duplicate stroke indexes.

**Phase 2 exit criteria**
- A new course can be created in-app and have a complete basic scorecard without SQL/manual Supabase work.

---

## Phase 3 — Rich course geometry for the caddie
**Goal:** Give the caddie better spatial understanding while keeping the data model maintainable.

- [ ] Add fairway geometry.
- [ ] Add green polygon geometry.
- [ ] Add fairway/hole centreline editor.
- [ ] Decide whether tee-box polygons are useful enough to store.
- [ ] Separate generic course geometry from hazard semantics where appropriate.
- [ ] Ensure caddie queries can consume the richer geometry without breaking existing courses.

**Decision checkpoint:** Reassess whether per-tee GPS coordinates/distances require a `hole_tees`/equivalent table. Do not migrate earlier unless needed.

---

## Phase 4 — Completeness, validation, and publication safety
**Goal:** Know whether a course is actually ready and prevent poor/incomplete data reaching users.

- [ ] Course completeness calculation.
- [ ] Missing tee/green/hole data checks.
- [ ] Geometry sanity checks (distance, remote polygons, invalid vertices, etc.).
- [ ] Scorecard sanity checks.
- [ ] Add draft/review/published status if required for production workflow.
- [ ] Show actionable validation results to the admin.

---

## Phase 5 — Standard import format and bulk ingestion
**Goal:** Make all external data sources feed the same internal pipeline.

- [ ] Define versioned GolfCaddie course JSON format.
- [ ] JSON import/export.
- [ ] GeoJSON geometry import.
- [ ] CSV/structured scorecard import.
- [ ] Import preview + validation before committing.
- [ ] Provenance fields/metadata where commercially necessary.

---

## Phase 6 — Assisted / AI course mapping
**Goal:** Shift humans from drawing everything to reviewing proposed geometry.

- [ ] Identify imagery/data sources that permit automated commercial extraction.
- [ ] Generate proposed tees/greens/fairways/hazards/centrelines.
- [ ] Store suggestions separately from approved geometry.
- [ ] Confidence scoring.
- [ ] Accept/reject/edit workflow per feature and per hole.
- [ ] Batch course review workflow.

---

## Phase 7 — Scale and commercial dataset operations
**Goal:** Support hundreds/thousands of maintained courses and potential data licensing.

- [ ] Admin work queue and search/filtering.
- [ ] Verification timestamps and source provenance.
- [ ] Change history/audit trail.
- [ ] Course-owner correction workflow.
- [ ] Update detection / remapping workflow.
- [ ] API/export boundary suitable for external commercial customers if pursued.

---

## Progress log
### 2026-08-29
- Reconfirmed the consumer app is already multi-course.
- Reframed work around the admin ingestion layer rather than redesigning the underlying course architecture.
- Created branch `feature/admin-course-ingestion-v2`.
- Created this maintained implementation plan.
- Opened GitHub issue #3 to track Phase 1.
- Implemented Phase 1 admin changes on the feature branch: dynamic course selection, hole focus, point placement, and explicit hazard scope.
- No GitHub Actions workflow is configured/running for the implementation commit, so runtime/typecheck validation remains outstanding before merge.
