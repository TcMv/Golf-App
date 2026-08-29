# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping, operational dataset management, and reliable private-build validation.

## Ground rules
- Preserve the existing consumer multi-course flow (`courses` -> `tee_sets` -> `holes`).
- Reuse existing approved-data models (`holes`, `hole_zones`, `hazards`).
- Keep incomplete data isolated from published/playable courses.
- Keep changes incremental and CI-gated.
- Follow `AGENTS.md` and Expo SDK 56 / React Native 0.85 requirements.

## Phases 1–7 ✅
Phases 1–7 are implemented, automated-validation clean, and merged to `main`.

- Phase 1 / PR #4 — multi-course admin map.
- Phase 2 / PR #6 — new-course setup and scorecard ingestion.
- Phase 3 / PR #8 — rich fairway/green/centreline geometry.
- Phase 4 / PR #10 — readiness and draft/review/published safety.
- Phase 5 / PR #12 — `golfcaddie.course.v1`, JSON/CSV/GeoJSON import/export and provenance.
- Phase 6 / PR #14 — machine suggestions, satellite human review, batch ingestion and OpenStreetMap generator.
- Phase 7 / PR #16 — operations queue, verification/history/audit, OSM deduplication/update detection and needs-verification workflow.

Outstanding live validation from these phases is intentionally carried into Phase 8 rather than being represented as completed without a connected private build.

## Phase 8 — Live validation and admin data health 🚧
**Status:** Active on `feature/admin-course-ingestion-phase8`. Issue #17.

### 8.1 In-app diagnostics
- [x] Add Admin Data Health screen.
- [x] Read-only check for `courses` publication + Phase 7 verification columns.
- [x] Read-only check for `course_admin_events`.
- [x] Read-only check for OSM source identity/fingerprint columns on mapping suggestions.
- [x] Read-only check for approved `hole_zones` access.
- [x] Show live course counts by publication state, pending suggestions and audit-event count.
- [x] Expose Data Health from Settings and navigation.

### 8.2 Explicit live smoke test
- [x] Add a separately confirmed, user-triggered verification RPC smoke test.
- [x] Clearly state that the test changes only the selected course verification timestamp/notes, not scorecard or playable geometry.
- [x] Confirm a new `course_verified` audit event exists after the RPC.
- [x] Re-run read-only health checks after the smoke test.
- [ ] Run the verification smoke test in the connected private build after migrations are applied.

### 8.3 Remaining private-build checks
- [ ] Run repeated OSM scan against a real course and confirm unchanged suggestions do not duplicate.
- [ ] Change/review one generated source feature and confirm Course Operations flags the course for verification.
- [ ] Open Course History and confirm verification, mapping/source and publication events are visible.
- [ ] Run a real round/course-selection regression check to ensure admin migrations do not affect normal published-course flow.

### Phase 8 validation
- [ ] Current Phase 8 branch must pass dependency install, TypeScript and the complete automated test suite.
- [ ] Complete the explicit private-build/Supabase checks above before calling Phase 8 fully complete.

## Later scale decisions
These remain deliberately demand-driven rather than blockers for the private product:
- richer course-operations aggregate metrics without N+1 queries;
- confidence calibration against review outcomes;
- second permitted geometry/imagery source if OSM coverage proves insufficient;
- production data-source hosting/caching when usage requires it;
- reconsider a commercial 40k+ course licence if product traction makes its cost worthwhile;
- external course-data API only if dataset distribution becomes a product goal.

## Progress log
### 2026-08-30
- Phase 7 merged to `main` as PR #16 and Issue #15 was closed.
- Started Phase 8 / Issue #17 from the merged Phase 7 main head.
- Added a Data Health screen so missing migrations/schema problems can be diagnosed directly from the private app rather than inferred from runtime failures.
- Added a separately confirmed verification RPC + audit-event smoke test that does not change playable geometry.
- Next: pass CI, then use the private build to run the live checks and capture any migration/runtime defects before adding more ingestion features.
