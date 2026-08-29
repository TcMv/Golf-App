# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping, operational dataset management, live diagnostics, and a continuous course-onboarding workflow.

## Ground rules
- Preserve the existing consumer multi-course flow (`courses` -> `tee_sets` -> `holes`).
- Reuse existing approved-data models (`holes`, `hole_zones`, `hazards`).
- Keep incomplete data isolated from published/playable courses.
- Keep changes incremental and CI-gated.
- Follow `AGENTS.md` and Expo SDK 56 / React Native 0.85 requirements.

## Phases 1–8 ✅
Phases 1–8 are implemented and merged to `main`.

- Phase 1 / PR #4 — multi-course admin map.
- Phase 2 / PR #6 — new-course setup and scorecard ingestion.
- Phase 3 / PR #8 — rich fairway/green/centreline geometry.
- Phase 4 / PR #10 — readiness and draft/review/published safety.
- Phase 5 / PR #12 — `golfcaddie.course.v1`, JSON/CSV/GeoJSON import/export and provenance.
- Phase 6 / PR #14 — machine suggestions, satellite human review, batch ingestion and OpenStreetMap generator.
- Phase 7 / PR #16 — operations queue, verification/history/audit, OSM deduplication/update detection and needs-verification workflow.
- Phase 8 / PR #18 — in-app Data Health diagnostics and explicit live verification smoke-test tooling.

Live device/Supabase smoke testing remains intentionally separate from automated CI and can be run through Data Health in the private build.

## Phase 9 — Continuous course onboarding ✅
Issue #19 / PR #20.

- New-course persistence returns the created `courseId`.
- Course creation can continue directly into OSM generation.
- OSM generation preselects the supplied course.
- Queueing suggestions can continue directly into Mapping Review with the same course selected.
- Mapping Review can continue directly into Course Readiness with the same course selected.
- Course Readiness preserves the onboarding course through publication.
- Course Operations passes the selected `courseId` directly into Map/Rescan, Review AI and Readiness.
- Course Operations surfaces a simple next-workflow-stage cue.
- Draft, human-review and readiness publication boundaries remain unchanged.
- Dependency install, TypeScript and the full automated test suite passed on the final code head.

Private-build follow-up remains:
- create a disposable draft and confirm Create → OSM → Review → Readiness selection persistence;
- confirm cancelling/choosing Later leaves a valid draft and does not affect normal published-course flow.

## Next — Phase 10: Source coverage lab
Measure how much useful course geometry the free/testing OSM path actually provides before spending money on a commercial 40k+ course licence.

Planned:
- per-course source coverage report;
- count numbered hole paths, greens, tees, fairways, bunkers, water and inferred assignments before queueing;
- compare OSM coverage with already approved geometry;
- save scan timestamp/source summary without modifying playable geometry;
- rank courses by mapping gaps so manual/second-source work is targeted;
- use the results to inform whether commercial course licensing is worth its annual cost.

## Later scale decisions
- richer course-operations aggregate metrics without N+1 queries;
- confidence calibration against review outcomes;
- second permitted geometry/imagery source if OSM coverage proves insufficient;
- production data-source hosting/caching when usage requires it;
- reconsider a commercial 40k+ course licence if product traction makes its cost worthwhile;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phases 7 and 8 are merged to `main`.
- Phase 9 continuous onboarding is implemented and automated-validation clean.
- Next development phase is Source Coverage Lab so course-licensing decisions are driven by measured coverage gaps.
