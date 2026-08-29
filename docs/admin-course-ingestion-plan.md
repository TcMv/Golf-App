# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping, operational dataset management, live diagnostics, continuous onboarding, and measured source-coverage decisions.

## Phases 1–10 ✅
- Phase 1 / PR #4 — multi-course admin map.
- Phase 2 / PR #6 — new-course setup and scorecard ingestion.
- Phase 3 / PR #8 — rich fairway/green/centreline geometry.
- Phase 4 / PR #10 — readiness and draft/review/published safety.
- Phase 5 / PR #12 — `golfcaddie.course.v1`, JSON/CSV/GeoJSON import/export and provenance.
- Phase 6 / PR #14 — machine suggestions, satellite human review, batch ingestion and OpenStreetMap generator.
- Phase 7 / PR #16 — operations queue, verification/history/audit, OSM dedup/update detection and needs-verification workflow.
- Phase 8 / PR #18 — in-app Data Health diagnostics and explicit live verification smoke-test tooling.
- Phase 9 / PR #20 — continuous Create → OSM → Review → Readiness onboarding with selected-course handoff from Course Operations.
- Phase 10 / PR #22 — read-only Source Coverage Lab comparing OSM structural coverage with approved geometry, with per-hole gaps and dedicated tests.

Live Nambour/Maroochydore and broader Sunshine Coast scans remain an evidence task rather than being represented as completed without the private build.

## Phase 11 — Coverage benchmark evidence base 🚧
**Status:** Active on `feature/admin-course-ingestion-phase11`. Issue #23.

### 11.1 Persist benchmark results
- [x] Add `course_source_coverage_scans` migration.
- [x] Store source/approved structural scores, assignment counts, gaps and feature counts.
- [x] Store compact hole-level summary without modifying playable geometry.
- [x] Keep scan capture explicit/user-triggered.
- [x] If the migration is missing, still show the completed scan and surface a clear benchmark-save warning.

### 11.2 Multi-course benchmark dashboard
- [x] Add reusable benchmark aggregation utility.
- [x] Keep only the latest scan per course in portfolio averages while retaining total scan history.
- [x] Show average OSM structural coverage, approved coverage and inference rate.
- [x] Order courses weakest-first so likely second-source/manual gaps are obvious.
- [x] Show sample-size guidance; treat 5–10 varied courses as the first useful decision sample rather than over-reading one course.
- [x] Add dashboard navigation directly from Source Coverage Lab.

### 11.3 Automated validation
- [x] Add benchmark aggregation unit test.
- [x] Wire benchmark test into GitHub Actions.
- [ ] Final Phase 11 head must pass dependency install, TypeScript and all automated tests.

### 11.4 Evidence still requiring the private build
- [ ] Apply Phase 11 migration.
- [ ] Scan Nambour and Maroochydore and confirm each result saves.
- [ ] Add at least 3 more varied Sunshine Coast courses.
- [ ] Review portfolio average, inference rate and weakest feature classes.
- [ ] Decide whether measured gaps justify manual completion, a second permitted source, or commercial 40k+ course licensing.

## Metric note
The Source Coverage score is a comparative structural metric, not the Course Readiness/publishing score. Each hole contributes tee, green, fairway and centreline presence; hazard counts remain separate. Phase 11 portfolio averages use the latest scan for each course so repeated scans do not overweight one course.

## Later scale decisions
- confidence calibration against accepted/rejected mapping outcomes;
- second permitted geometry/imagery source if measured OSM coverage is insufficient;
- production source hosting/caching only when usage requires it;
- commercial 40k+ course licence only if product traction or measured coverage gaps justify its annual cost;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phase 10 merged to `main` as PR #22; Source Coverage Lab is now available in the private admin workflow.
- Started Phase 11 / Issue #23.
- Added persistent source-coverage benchmark storage, multi-course aggregation and a benchmark dashboard.
- Coverage scans remain non-destructive to playable course data; Phase 11 stores only measurement summaries.
- Next gate: final CI, then apply the migration and begin collecting real-course evidence.
