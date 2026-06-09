# Phase 2 - Core Feature Completion

Implementation date: 2026-06-09

## What Changed

### GPS Distances

- GPS now updates on the required five-second cadence.
- The last known coordinate and timestamp are cached in AsyncStorage.
- Cached coordinates load immediately when a live fix is unavailable.
- The in-round screen displays a stale/unavailable GPS warning.
- Hazards now load from the active round's selected course.

### Score Persistence

- Score and putt changes update local round state immediately.
- Every scored hole is written to a persistent AsyncStorage queue before the network request.
- Supabase writes use idempotent upserts on `round_id,hole_number`.
- Failed writes remain queued and retry every 15 seconds.
- Queue storage mutations are serialized to prevent a background sync from overwriting newer edits.
- The in-round UI displays `SAVED OFFLINE` while a score is pending.

### Round History And Ownership

- Home, Stats, Rounds, Round Detail, round completion, and round deletion explicitly scope round operations to the authenticated user.
- Round and score queries in the Phase 2 paths use explicit column lists.
- Nine-hole history and detail totals include only the holes played.
- A corrective migration adds strict ownership policies for rounds, hole scores, handicap history, and GPS shot history.

### Course Database

- Round setup now queries the course table instead of using a hardcoded UUID.
- Golfers can search and select available courses.
- Tee sets, holes, weather coordinates, hazards, and new rounds all use the selected course.
- The profile home course is selected by default when available.
- The remaining hardcoded course references were removed from user round and Stats flows.

### Handicap

- The latest 20 differentials are selected before ranking the best scores.
- The obsolete `0.96` multiplier was removed.
- Existing reduced-round-count WHS selection rules remain supported.
- Nine-hole rounds no longer produce an invalid 18-hole differential.
- Deterministic tests cover differential calculation, latest-20 windowing, truncation, and insufficient history.

## Decisions

1. Offline support uses the already-installed AsyncStorage package rather than adding a connectivity dependency.
2. The normalized `courses`, `tee_sets`, and `holes` model is retained.
3. Eighteen-hole rounds can start on any hole and wrap correctly through all 18 holes.
4. Nine-hole rounds are saved and displayed, but are not assigned an 18-hole handicap differential.
5. Legacy unowned rounds are preserved in the database but are no longer exposed to every authenticated user.

## Verification

- [x] `npm run typecheck`
- [x] `npm run test:handicap`
- [x] No hardcoded course remains in user round flows
- [x] No `select('*')` remains in Phase 2 paths
- [x] Phase 2 files pass `git diff --check`
- [x] Score queue is persistent and idempotent
- [x] GPS cache and stale state are implemented

## Deployment And Device Gate

Phase 2 code is complete, but full end-to-end confirmation still requires:

1. Apply `supabase/migrations/011_phase2_data_integrity.sql` to the live Supabase project.
2. Verify an authenticated score insert/update against the live RLS policies.
3. Test live GPS and stale-cache behavior on an Android device.
4. Disable connectivity during a round, enter scores, reconnect, and confirm queued rows sync.
5. Validate true front/middle/back green coordinates. The seeded Nambour data currently uses the same coordinate for many green points, so the app cannot manufacture precise green-depth distances from that source data.

No local Supabase CLI/project link or database credential is available in this repository, so the migration could not be deployed from this workspace.
