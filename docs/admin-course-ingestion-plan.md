# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping, operational dataset management, live diagnostics, continuous onboarding, and evidence-based source decisions.

## Phases 1–12 ✅
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
- Phase 11 / PR #24 — persistent multi-course coverage benchmarks and dashboard.
- Phase 12 / PR #26 — human-correction signals plus Source Quality acceptance/edit calibration. Final install, TypeScript and full tests passed before merge.

Live evidence remains separate: apply Phase 11/12 migrations, collect varied course coverage scans, and review enough real mapping suggestions to make coverage and quality rates meaningful.

## Phase 13 — Combined source decision evidence 🚧
**Status:** Active on `feature/admin-course-ingestion-phase13`. Issue #27.

### 13.1 Combined evidence model
- [x] Normalize provider identity so `OpenStreetMap` quality rows align with `OpenStreetMap / Overpass` coverage scans.
- [x] Use only the latest coverage scan per course/provider to avoid overweighting repeat scans.
- [x] Combine course count + average structural coverage with reviewed count + acceptance/edit rates.
- [x] Keep providers independent so a future second permitted source can be compared without redesigning the model.

### 13.2 Evidence states
- [x] Flag insufficient evidence when fewer than 5 courses or 20 reviewed suggestions exist.
- [x] Distinguish coverage gaps from quality concerns once the sample is usable.
- [x] Surface promising/mixed evidence without turning the tool into an automatic licence-buying verdict.
- [x] Preserve plain-language notes explaining why each state was assigned.

### 13.3 Admin scorecard
- [x] Add read-only Source Decision screen.
- [x] Show source coverage, acceptance and correction rate together.
- [x] Add Settings/navigation entry point.
- [x] Explain how to interpret high/low coverage against high/low review quality.

### 13.4 Validation
- [x] Add dedicated source-decision evidence unit test.
- [x] Wire it into GitHub Actions.
- [ ] Final Phase 13 head must pass dependency install, TypeScript and all automated tests.
- [ ] Private build: confirm Phase 11/12 data is visible in the combined scorecard.

## Decision framework
Coverage answers **how much useful geometry do we get?** Quality answers **how much of it survives human review without correction?** The combined scorecard should inform whether to keep filling gaps manually, add a second permitted source, or revisit commercial course licensing.

## Later scale decisions
- add a second permitted provider only when the measured evidence points to a real gap;
- production source hosting/caching only when usage requires it;
- commercial 40k+ course licence only if product traction or measured gaps justify its annual cost;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phase 12 merged to `main` as PR #26 after install, TypeScript and full tests passed; Issue #25 closed.
- Started Phase 13 / Issue #27.
- Added a provider-normalized combined coverage + quality evidence model and read-only Source Decision scorecard.
- Next gate: final CI and diff review, then merge if clean. Real-course evidence remains the private-build task.
