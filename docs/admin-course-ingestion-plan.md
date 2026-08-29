# Admin Course Ingestion V2 Plan

## Objective
Build a fast, safe multi-course ingestion system that progresses from manual admin tools to machine-assisted mapping and scalable dataset operations.

## Ground rules
- Preserve the existing consumer multi-course flow (`courses` -> `tee_sets` -> `holes`).
- Reuse existing approved-data models (`holes`, `hole_zones`, `hazards`).
- Keep incomplete data isolated from published/playable courses.
- Keep changes incremental and CI-gated.
- Follow `AGENTS.md` and Expo SDK 56 / React Native 0.85 requirements.

## Phase 1 — Multi-course admin map ✅
Merged: PR #4 / Issue #3.
- Dynamic course selection.
- Hole-focused editing.
- Missing tee/green point placement.
- Safer hazard assignment.
- CI passed.

## Phase 2 — New-course setup and scorecard ingestion ✅
Merged: PR #6 / Issue #5.
- Guided course creation.
- Tee-set setup.
- Editable and bulk-paste scorecards.
- Duplicate/nearby-course warnings.
- Tee-set management.
- CI passed.

## Phase 3 — Rich course geometry ✅
Merged: PR #8 / Issue #7.
- Hole Geometry screen.
- Fairway, green, tee-box and centreline mapping.
- Existing `hole_zones` model reused.
- CI passed.

## Phase 4 — Readiness and publication safety ✅
Merged: PR #10 / Issue #9.
- Completeness/readiness engine.
- Draft / review / published workflow.
- Only published courses exposed to golfers.
- CI passed.

## Phase 5 — Standard import/export ✅
Merged: PR #12 / Issue #11.
- `golfcaddie.course.v1` contract.
- JSON / CSV / GeoJSON import.
- JSON / GeoJSON export.
- Draft-by-default import and provenance retention.
- CI passed.

## Phase 6 — Assisted course mapping ✅
Merged: PR #14 / Issue #13.
- Isolated machine-suggestion store.
- Confidence and source/licence provenance.
- Atomic accept/reject into approved geometry.
- Satellite compare and drag-to-correct review.
- `golfcaddie.mapping-suggestions.v1` batch input.
- First OpenStreetMap/Overpass generator.
- CI passed.

Deferred from Phase 6 to operational hardening: real-course coverage measurement, confidence calibration, and a second permitted source if needed.

## Phase 7 — Scale and dataset operations 🚧
Active: `feature/admin-course-ingestion-phase7`, Issue #15, draft PR #16.

### 7.1 Operations queue
- [x] Searchable/filterable Course Operations screen.
- [x] Draft/review/published and pending-suggestion workload.
- [x] Prioritise courses needing verification.
- [x] `Needs verification` visibility when tracked changes occur after last verification.
- [x] Dedicated `Needs verification` filter.
- [ ] Add richer completeness metrics without N+1 loading.

### 7.2 Verification and audit
- [x] `last_verified_at` and verification notes.
- [x] `course_admin_events` audit table.
- [x] Atomic `mark_course_verified` RPC.
- [x] Publication-status audit events.
- [x] Mapping accept/reject audit events.
- [x] OSM source-change audit events.
- [x] Course History screen.
- [x] Selective audit of existing GPS, hole-zone and hazard edits/deletes without logging bulk-import inserts.

### 7.3 OSM update/remapping operations
- [x] Stable OSM source-feature identity (`osm_type:id:feature`).
- [x] Exact repeat scans are idempotent.
- [x] Changed pending source features refresh in place.
- [x] Changed previously reviewed features create a new pending update candidate while retaining history.
- [x] Backfill OSM identities and collapse duplicate pending rows before uniqueness enforcement.
- [x] Course Operations surfaces changes occurring after verification.
- [ ] Live-repeat-scan smoke test after Phase 7 migrations are applied.

### 7.4 Later scale decisions
- [ ] Production data-source hosting/caching only when usage requires it.
- [ ] Re-evaluate commercial 40k+ course licensing if product traction makes the licence economically sensible.
- [ ] External API/export boundary only if commercial dataset distribution becomes a product goal.

### Phase 7 validation
- [x] Current UI/operations slice passed dependency install, TypeScript and full automated tests.
- [x] Audit/dedup changes passed the same CI gate.
- [ ] Apply Phase 7 migrations and run live Supabase/device smoke tests.

## Progress log
### 2026-08-30
- Phase 7 operational queue, verification, history and audit foundation built.
- Repeated OSM scans now deduplicate at the database boundary and preserve source-change history.
- Courses now become visibly due for re-verification after tracked publication, mapping, source or approved-geometry changes.
- Added a dedicated Needs Verification queue filter and selective approved-geometry edit auditing.
- Latest Phase 7 head passed TypeScript and the full test suite.
- Next: complete static review, merge Phase 7, then use the private build to smoke-test the full ingestion workflow against real course data.
