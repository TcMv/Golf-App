# Admin Course Ingestion V2 Plan

## Objective
Turn the existing multi-course GolfCaddie data model and map editor into a fast, safe course-ingestion workflow that can scale from manual mapping to assisted imports and AI-generated course geometry.

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

- [x] Versioned `golfcaddie.course.v1` contract.
- [x] JSON, CSV and GeoJSON import normalization.
- [x] JSON and GeoJSON export.
- [x] Draft-by-default import with duplicate/nearby checks and rollback cleanup.
- [x] Persistent source/licensing provenance.
- [x] CI install/typecheck/import/converter tests passed.
- [ ] Manual live-Supabase import/export smoke test remains recommended after migrations are applied.

---

## Phase 6 — Assisted / AI course mapping 🚧
**Status:** Active on `feature/admin-course-ingestion-phase6` / PR #14. Issue #13.

**Goal:** Move humans from drawing every feature to reviewing machine-generated suggestions, while keeping machine data isolated from approved/playable course geometry until explicitly accepted.

### 6.1 Suggestion boundary ✅
- [x] Separate `course_mapping_suggestions` persistence model.
- [x] Tee/green points, surface polygons, centrelines and hazard polygons.
- [x] Confidence, source reference and source license per suggestion.
- [x] Pending / accepted / rejected status.
- [x] Shared validation rules.
- [x] Atomic accept/reject database RPC so approved writes and review status cannot diverge.

### 6.2 Human review workflow ✅
- [x] Mapping Review queue with course selector.
- [x] License-gated approval.
- [x] Suggested-vs-approved satellite comparison.
- [x] Drag-to-correct point/line/polygon geometry before acceptance.
- [x] Accepted data writes into existing `holes`, `hole_zones` and `hazards` only.

### 6.3 Batch machine-ingestion boundary ✅
- [x] Versioned `golfcaddie.mapping-suggestions.v1` contract.
- [x] Batch parser/validator and source/license propagation.
- [x] Admin batch import that queues pending suggestions only.
- [x] Dedicated batch tests in CI.

### 6.4 First real generator — OpenStreetMap 🚧
**Source decision:** OpenStreetMap is the first bootstrap source. OSM data is distributed under ODbL and supports commercial reuse with attribution/share-alike obligations. Google satellite imagery is not used for machine extraction.

- [x] Add OSM/Overpass golf-data adapter.
- [x] Query `golf=*` features around the selected course centre.
- [x] Convert numbered `golf=hole` ways to fairway-centreline suggestions.
- [x] Convert OSM fairway/green/tee/bunker/water/lateral-water/out-of-bounds features into GolfCaddie suggestions.
- [x] Convert `golf=pin` to green-centre suggestions.
- [x] Generate tee/green-centre point suggestions from tee/green polygons when explicit points are absent.
- [x] Use explicit hole refs at high confidence; associate unnumbered features to the nearest numbered hole path at lower confidence.
- [x] Preserve OSM element IDs/tags and ODbL attribution in suggestion metadata/provenance.
- [x] Add an admin **Generate from OpenStreetMap** screen: select course → fetch → preview counts/issues → queue for human review.
- [x] Add OSM adapter tests to CI.
- [ ] Run live OSM generation against Nambour and Maroochydore and measure actual feature coverage/assignment quality.
- [ ] Add deduplication/update detection using OSM type/id before repeated scans.
- [ ] Move production-scale OSM fetching away from the free public Overpass endpoint to paid/self-hosted infrastructure; public Overpass remains prototype/small-use only.

### 6.5 Next generator work
- [ ] Calibrate OSM confidence/nearest-hole thresholds using review outcomes.
- [ ] Investigate aerial imagery sources with explicit commercial machine-extraction rights for features absent from OSM.
- [ ] Add imagery/vector fusion rather than trusting a single source.
- [ ] Add batch-course work queue after single-course live validation.

### Phase 6 validation
- [x] Existing suggestion/review/batch slices passed npm ci, TypeScript and full tests.
- [ ] Current OSM generator slice must pass the same CI gate before merge.
- [ ] Manual live-Supabase + live-OSM suggestion generation/review smoke test remains required before calling Phase 6 complete.

---

## Phase 7 — Scale and commercial dataset operations
- [ ] Admin work queue and search/filtering.
- [ ] Verification timestamps and source provenance.
- [ ] Change history/audit trail.
- [ ] Course-owner correction workflow.
- [ ] Update detection / remapping workflow.
- [ ] Production data-source infrastructure and caching/rate limiting.
- [ ] API/export boundary suitable for external commercial customers if pursued.

---

## Progress log
### 2026-08-29
- Implemented, validated and merged Phases 1–5.
- Phase 6 now has isolated machine suggestions, atomic human approval, satellite compare/edit, and a batch ingestion contract.
- Selected OpenStreetMap as the first real machine-readable bootstrap source because golf features are explicitly tagged and the dataset is commercially reusable under ODbL obligations.
- Built the OSM/Overpass adapter and direct admin generator. It converts OSM golf geometry into pending GolfCaddie suggestions with provenance and confidence rather than modifying playable data directly.
- Public Overpass is deliberately treated as prototype/small-use infrastructure; commercial scale will use paid/self-hosted data access.
- Next proof point: run the generator against real courses, quantify coverage and corrections, then add OSM deduplication and a second licensed source for missing geometry.
