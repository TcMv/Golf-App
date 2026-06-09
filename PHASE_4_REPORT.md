# Phase 4 Report - AI Caddie Layer

## Status

Core Phase 4 implementation is complete. Live weather, GPS, and course-history behavior still
requires physical-device validation.

## Completed

- Kept all in-round recommendations deterministic and client-side.
- Removed the in-round LLM chat and API-key dependency.
- Recommendations now use:
  - the player's `user_clubs` carry distances
  - current GPS position and distance to the green
  - Open-Meteo wind speed and direction
  - elevation difference
  - mapped hazards and their position relative to the target line
  - hole par and stroke index
  - the player's previous results on the same hole
- Added playing distance, recommended club, expected carry, hazard-safe miss, alternatives, and
  historical performance to the detailed caddie panel.
- Added deterministic pre-round briefings using:
  - course rating and slope
  - current wind
  - player handicap
  - the five most recent completed scores at the selected course
- Correctly excludes putters from recommendations when loading personal clubs.
- Existing `user_clubs` migration provides ownership RLS and carry/total distance storage.
- Added isolated rule-engine tests.

## Verification

- `npm run typecheck` - passed
- `npm run test:caddie` - passed
- `npm run test:handicap` - passed
- Confirmed the in-round caddie component contains no network requests or public API-key usage.

## Optional LLM

The optional pre-round/post-round hosted LLM enhancement was not added. It should only be
implemented through a server-side Supabase Edge Function with a secret, never with a provider key
embedded in the Expo client.

## Device Gate

1. Open a round outdoors and confirm the recommended club changes as distance changes.
2. Confirm current Open-Meteo wind appears and affects playing distance.
3. Confirm mapped hazards produce a safe-side recommendation.
4. Open a hole previously played and confirm the history section appears.
5. Select a course with prior rounds and confirm its recent scoring average appears in the
   pre-round briefing.
6. Test with no personal club distances and confirm the app remains stable.
