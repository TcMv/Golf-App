# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping, operational dataset management, live diagnostics, and a continuous course-onboarding workflow.

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

Phase 9 code passed dependency install, TypeScript and the full automated test suite. Live device/Supabase smoke testing remains separate and can be run through the private build.

## Phase 10 — Source coverage lab
Measure how much useful course geometry the private/testing OSM path actually provides before spending money on a commercial 40k+ course licence.

Planned:
- per-course source coverage report;
- count numbered hole paths, greens, tees, fairways, bunkers, water and inferred assignments before queueing;
- compare OSM coverage with already approved geometry;
- save scan timestamp/source summary without modifying playable geometry;
- rank courses by mapping gaps so manual/second-source work is targeted;
- use measured coverage to inform whether commercial course licensing is worth its annual cost.

## Later scale decisions
- richer course-operations aggregate metrics without N+1 queries;
- confidence calibration against review outcomes;
- second permitted geometry/imagery source if OSM coverage proves insufficient;
- production data-source hosting/caching when usage requires it;
- reconsider a commercial 40k+ course licence if product traction makes its cost worthwhile;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phase 9 continuous onboarding is implemented and automated-validation clean.
- Next: Source Coverage Lab.
