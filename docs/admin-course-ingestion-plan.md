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

## Phase 9 — Continuous course onboarding 🚧
**Status:** Active on `feature/admin-course-ingestion-phase9`. Issue #19.

### 9.1 Carry course identity through the workflow
- [x] Make new-course persistence return the created `courseId`.
- [x] After course creation, offer **Generate Mapping** without backing out to Settings.
- [x] Pass the new `courseId` into OpenStreetMap generation.
- [x] OSM generation preselects a supplied course while preserving normal manual course switching.
- [x] Queueing OSM suggestions can continue directly into Mapping Review with the same course selected.
- [x] Mapping Review preselects the supplied course.
- [x] Mapping Review can continue directly into Course Readiness with the same course selected.
- [x] Course Readiness preselects the supplied course and preserves the onboarding context through publication.

### 9.2 Onboarding safety and UX
- [x] Newly created courses remain draft throughout mapping/review.
- [x] Machine geometry remains pending until explicit human accept/reject.
- [x] Course Readiness remains the publication gate.
- [x] Publishing from an onboarding flow offers a direct return to Course Operations.
- [ ] Add a compact onboarding progress indicator (Created → Mapping → Review → Readiness → Published).
- [ ] Add direct selected-course handoff from Course Operations into readiness/review/generator where useful.

### 9.3 Validation
- [ ] Phase 9 branch must pass dependency install, TypeScript and the complete automated test suite.
- [ ] Private-build smoke test: create a disposable draft course and confirm course selection persists through Create → OSM → Review → Readiness.
- [ ] Confirm cancelling/choosing “Later” at each stage still leaves a valid draft and does not alter published course flow.

## Later scale decisions
These remain demand-driven rather than blockers for the private product:
- richer course-operations aggregate metrics without N+1 queries;
- confidence calibration against review outcomes;
- second permitted geometry/imagery source if OSM coverage proves insufficient;
- production data-source hosting/caching when usage requires it;
- reconsider a commercial 40k+ course licence if product traction makes its cost worthwhile;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phases 7 and 8 are merged to `main`.
- Started Phase 9 / Issue #19 from the Phase 8 main head.
- New-course creation now returns the actual created course ID and can continue directly into OSM generation.
- OSM generation, Mapping Review and Course Readiness now accept and preserve the selected course through the onboarding chain.
- Draft/publication safety boundaries remain unchanged: generated geometry is pending until human review and Course Readiness remains the publish gate.
- Next gate: CI/typecheck/tests, then add the progress indicator and selected-course shortcuts from Course Operations if the slice is clean.
