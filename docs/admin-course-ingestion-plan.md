# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping, operational dataset management, live diagnostics, continuous onboarding, and measured source-coverage decisions.

## Phases 1–9 ✅
- Phase 1 / PR #4 — multi-course admin map.
- Phase 2 / PR #6 — new-course setup and scorecard ingestion.
- Phase 3 / PR #8 — rich fairway/green/centreline geometry.
- Phase 4 / PR #10 — readiness and draft/review/published safety.
- Phase 5 / PR #12 — `golfcaddie.course.v1`, JSON/CSV/GeoJSON import/export and provenance.
- Phase 6 / PR #14 — machine suggestions, satellite human review, batch ingestion and OpenStreetMap generator.
- Phase 7 / PR #16 — operations queue, verification/history/audit, OSM dedup/update detection and needs-verification workflow.
- Phase 8 / PR #18 — in-app Data Health diagnostics and explicit live verification smoke-test tooling.
- Phase 9 / PR #20 — continuous Create → OSM → Review → Readiness onboarding with selected-course handoff from Course Operations.

## Phase 10 — Source coverage lab 🚧
**Status:** Active on `feature/admin-course-ingestion-phase10`. Issue #21.

### 10.1 Read-only coverage engine
- [x] Add reusable `analyzeSourceCoverage` utility.
- [x] Measure per-hole source presence for tee, green, fairway and centreline.
- [x] Measure equivalent already-approved geometry coverage.
- [x] Count source features, direct/high-confidence assignments, inferred assignments and hazards.
- [x] Produce per-hole missing-source feature list.
- [x] Add dedicated unit test and CI test script.

### 10.2 Source Coverage Lab UI
- [x] Add course selector and explicit user-triggered OSM scan.
- [x] Fetch approved holes, hole zones and hazards in parallel with the source scan.
- [x] Reuse the existing OSM converter without inserting mapping suggestions.
- [x] Show source structural coverage vs approved structural coverage.
- [x] Show direct/inferred/skipped counts and source feature counts.
- [x] Show per-hole source/approved scores, hazard counts and OSM gap list.
- [x] Clearly state that coverage scans are read-only and do not queue or change playable geometry.
- [x] Register Source Coverage Lab in navigation and Settings.

### 10.3 Validation and evidence
- [ ] Phase 10 branch must pass dependency install, TypeScript and full automated tests including `test:source-coverage`.
- [ ] Run live source scans for Nambour and Maroochydore in the private build.
- [ ] Record actual course-level and hole-level OSM coverage observations.
- [ ] Use measured gaps to decide whether the next investment is manual completion, another permitted source, or commercial course licensing.

### Metric note
The Source Coverage score is deliberately a **comparative structural coverage metric**, not the Course Readiness/publishing score. It checks whether each hole has source/approved tee, green, fairway and centreline classes. Hazard counts are shown separately.

## Later scale decisions
- persist scan summaries if repeated coverage benchmarking becomes useful;
- richer course-operations aggregate metrics without N+1 queries;
- confidence calibration against review outcomes;
- second permitted geometry/imagery source if OSM coverage proves insufficient;
- production data-source hosting/caching when usage requires it;
- reconsider a commercial 40k+ course licence if product traction or measured data gaps make its cost worthwhile;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phase 9 merged to `main` as PR #20 and Issue #19 was closed.
- Started Phase 10 / Issue #21.
- Built a read-only Source Coverage Lab that compares OSM-derived structural coverage with approved geometry without queueing suggestions or changing playable course data.
- Added a reusable coverage engine, unit test and CI gate.
- Next: validate the complete Phase 10 slice, then run real-course coverage scans in the private build.
