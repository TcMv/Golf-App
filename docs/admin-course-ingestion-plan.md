# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping, operational dataset management, live diagnostics, continuous onboarding, and evidence-based source decisions.

## Phases 1–11 ✅
- Phase 1 / PR #4 — multi-course admin map.
- Phase 2 / PR #6 — new-course setup and scorecard ingestion.
- Phase 3 / PR #8 — rich fairway/green/centreline geometry.
- Phase 4 / PR #10 — readiness and draft/review/published safety.
- Phase 5 / PR #12 — `golfcaddie.course.v1`, JSON/CSV/GeoJSON import/export and provenance.
- Phase 6 / PR #14 — machine suggestions, satellite human review, batch ingestion and OpenStreetMap generator.
- Phase 7 / PR #16 — operations queue, verification/history/audit and OSM update detection.
- Phase 8 / PR #18 — in-app Data Health diagnostics and live smoke-test tooling.
- Phase 9 / PR #20 — continuous Create → OSM → Review → Readiness onboarding.
- Phase 10 / PR #22 — read-only Source Coverage Lab.
- Phase 11 / PR #24 — persistent multi-course coverage benchmarks and dashboard. Final CI passed before merge.

Live benchmark evidence remains separate: apply Phase 11 migration and collect Nambour, Maroochydore and at least three additional varied course scans before making a source/licensing decision.

## Phase 12 — Source quality calibration 🚧
**Status:** Active on `feature/admin-course-ingestion-phase12`. Issue #25.

### 12.1 Review-quality signals
- [x] Add `manually_edited`, `edit_count` and `last_edited_at` quality fields to mapping suggestions.
- [x] Make correction counting database-owned so automated OSM refreshes are not mistaken for human edits.
- [x] Mark corrections when a reviewer saves edited geometry before approval.
- [x] Preserve the existing pending → explicit accept/reject human boundary.

### 12.2 Quality analytics
- [x] Add reusable source-quality aggregation utility.
- [x] Measure reviewed, accepted, rejected and pending counts.
- [x] Calculate acceptance and manual-edit rates.
- [x] Break quality down by provider, feature type and confidence band.
- [x] Separate OSM direct-hole refs from nearest-hole inferred assignments using existing metadata.
- [x] Add sample-size guidance so early percentages are not over-read.

### 12.3 Admin dashboard
- [x] Add Source Quality screen.
- [x] Expose it from Settings.
- [x] Explain coverage vs quality: plentiful data can still be expensive to review, while accurate data can still have poor coverage.

### 12.4 Validation
- [x] Add dedicated source-quality unit test.
- [x] Wire source-quality test into GitHub Actions.
- [ ] Final Phase 12 head must pass dependency install, TypeScript and all automated tests.
- [ ] Private build: apply migration, manually correct one pending suggestion, accept it and verify edited/accepted metrics update.
- [ ] Review enough real suggestions to compare direct OSM vs inferred acceptance/edit rates.

## Decision framework
Use **coverage + quality together** before buying another source or commercial course licence:
- high coverage + high acceptance/low edits → current source is strong;
- high coverage + poor acceptance/high edits → source is plentiful but review-expensive;
- low coverage + high acceptance → reliable where present, but requires gap filling;
- low coverage + poor quality → prioritize another source/licensing path.

## Later scale decisions
- second permitted geometry/imagery source if measured coverage/quality warrants it;
- production source hosting/caching only when usage requires it;
- commercial 40k+ course licence only if product traction or measured gaps justify its annual cost;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phase 11 merged to `main` as PR #24 after install, TypeScript and full tests passed; Issue #23 closed.
- Started Phase 12 / Issue #25.
- Added human-correction quality signals, source-quality aggregation and Source Quality dashboard.
- Next gate: final CI and diff review, then merge if clean. Live evidence remains a separate private-build step.
