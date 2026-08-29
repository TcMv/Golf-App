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
- [x] `hole_zones` already stores green, fairway, tee-box and fairway-centreline geometry.
- [x] ActiveRound already fetches hole-zone geometry and the caddie already consumes fairway-centreline data.
- [ ] No completeness/publication workflow exists before considering a mapped course ready.

---

## Phase 1 — Make the existing admin editor efficient for multiple courses ✅
**Status:** Complete, validated and merged to `main`.

**Tracking:** GitHub issue #3 — closed. PR #4 — merged.

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

### Phase 1 validation
- [x] GitHub Actions validation workflow added.
- [x] `npm ci` passed.
- [x] `npm run typecheck` passed.
- [x] Existing unit-test suite passed.
- [x] Static review confirms selected-course IDs are used for reads/writes and course switching resets in-progress editor state.
- [ ] Manual Android/live-Supabase smoke testing remains recommended when convenient, especially Nambour/Maroochydore switching and persistence.

---

## Phase 2 — New-course setup and scorecard ingestion ✅
**Status:** Complete, validated and merged to `main`.

**Tracking:** GitHub issue #5 — closed. PR #6 — merged.

**Goal:** Create the basic data structure for a new course quickly.

### 2.1 Create course
- [x] Add guided `Create Course` workflow.
- [x] Capture name, centre latitude/longitude, and 9/18-hole count.
- [x] Generate the full hole-entry draft automatically in the UI.
- [x] Prevent persistence until the full scorecard validates, so incomplete placeholder courses are not exposed to golfers.
- [x] Validate duplicate course names.
- [x] Warn when another course centre is within 250 m and require explicit override.

### 2.2 Tee set setup
- [x] Add/edit/delete tee sets for existing courses.
- [x] Capture initial tee name, colour, calculated total distance, course rating, and slope during course creation.
- [x] Protect deletion through existing database relationships: referenced tee sets surface the Supabase FK error instead of silently deleting round history.

### 2.3 Scorecard editor
- [x] Editable hole grid for par, stroke index, and current supported distance field.
- [x] Bulk paste path for structured scorecard data (tab/comma/semicolon/pipe separated; optional header).
- [x] Validate par/SI completeness and duplicate stroke indexes.
- [x] Validate plausible hole lengths and slope/rating inputs.
- [x] Bulk paste is loaded into the editable scorecard for human review before persistence.

### Phase 2 validation
- [x] New-course screen registered in navigation and Settings.
- [x] Tee-set management screen registered in navigation and Settings.
- [x] `npm ci` passed on completed Phase 2 branch.
- [x] `npm run typecheck` passed on completed Phase 2 branch.
- [x] Full existing unit-test suite passed on completed Phase 2 branch.
- [x] Static review confirms course creation cleans up the course record if downstream tee/hole insertion fails.
- [ ] Manual Android/live-Supabase creation/edit smoke test remains recommended before relying on the workflow for production data entry.

---

## Phase 3 — Rich course geometry for the caddie 🚧
**Status:** Active on `feature/admin-course-ingestion-phase3` / PR #8.

**Tracking:** GitHub issue #7.

**Goal:** Make the already-supported rich geometry practical to create and maintain from the admin layer.

### 3.0 Existing foundation discovered
- [x] Confirm `hole_zones` already supports `green`, `fairway`, `tee_box`, and `fairway_centreline`.
- [x] Confirm one zone per course/hole/type is enforced by the existing unique constraint.
- [x] Confirm ActiveRound already loads zones for the active hole.
- [x] Confirm caddie routing already consumes `fairway_centreline`.
- [x] Confirm zone data already participates in lie detection.
- [x] Avoid adding a duplicate geometry schema.

### 3.1 Hole geometry editor
- [x] Add dedicated course/hole geometry admin screen.
- [x] Add course selector and Hole 1..N selector.
- [x] Auto-fit the satellite map to tee/green context for the selected hole.
- [x] Display existing fairway, green, tee-box and centreline geometry.
- [x] Show which zone types are already mapped.

### 3.2 Geometry creation and maintenance
- [x] Draw/replace fairway polygons.
- [x] Draw/replace green polygons.
- [x] Draw/replace fairway-centreline routes.
- [x] Allow tee-box polygons without making them mandatory.
- [x] Upsert to the existing one-zone-per-hole/type record.
- [x] Delete existing geometry.
- [x] Support undo/cancel while drawing.
- [ ] Decide whether direct vertex editing of an existing zone adds enough speed over redraw to include before Phase 3 closes.

### 3.3 Integration
- [x] Register Hole Geometry in navigation.
- [x] Add Settings entry point: `Hole geometry — Fairway, green & centreline`.
- [x] Keep hazard semantics in `hazards` and ordinary playable-surface geometry in `hole_zones`.
- [x] Existing caddie queries continue to consume `hole_zones`; no consumer-path rewrite is required.

### Phase 3 validation
- [ ] `npm ci` on current Phase 3 head.
- [ ] `npm run typecheck` on current Phase 3 head.
- [ ] Existing unit-test suite on current Phase 3 head.
- [ ] Manual live-Supabase draw/upsert/delete smoke test remains recommended.

**Decision checkpoint — per-tee GPS:** Still deferred. The current product does not yet demonstrate enough pain to justify a `hole_tees` migration. Reassess when tee-specific GPS positions become necessary.

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
- Implemented and merged Phase 1.
- Added GitHub Actions CI covering install, TypeScript typecheck, and all existing unit tests.
- Implemented, validated and merged Phase 2.
- Started Phase 3 on a fresh branch.
- Discovered the repo already has `hole_zones` with green/fairway/tee-box/centreline support and that ActiveRound/caddie already consume this data.
- Built a dedicated Hole Geometry admin screen against the existing model instead of creating a new schema.
- Added drawing/replacement/deletion for fairway, green, centreline and optional tee-box geometry.
- Added the Phase 3 navigation and Settings entry point.
