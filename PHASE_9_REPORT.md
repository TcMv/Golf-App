# Phase 9 Report - Profile and Settings

## Status

Phase 9 is complete. The Phase 9 Supabase migration must be deployed before using the new
preferences or account deletion.

## Profile

- Added a dedicated Profile tab.
- Avatar supports an image URL with initials fallback.
- Display name and optional Golf Australia number are editable.
- Home course can be selected from the Supabase course list.
- Added a stats summary for rounds, birdies, best streak, and level.
- Displays all 12 achievements, with unearned achievements shown as locked.
- Added a direct link to Settings.

## Settings

- Added metres/yards preference stored in `profiles`.
- Applied the preference to:
  - live in-round front/middle/back distances
  - in-round caddie distances and hazard details
  - pre-round tee lengths
  - GPS and manual club analytics
- Added notification preferences for:
  - round reminders
  - streak alerts
  - achievement unlocks
- Added a link to the guided club-distance setup flow.
- Added sign out and permanent account deletion.
- Added app version and build number.
- Added native iOS and Android build numbers to Expo configuration.

## Data and Security

- Added profile columns for avatar and notification preferences.
- Added a security-definer `delete_own_account()` RPC.
- Account deletion removes owned application data in dependency order before deleting the auth
  identity.
- Profile fetching now selects explicit columns rather than `select('*')`.

## Verification

- `npm run typecheck` - passed
- `npm run test:profile` - passed
- `npm run test:units` - passed
- All existing Phase 1-8 test suites - passed

## Deployment Gate

Apply `supabase/migrations/013_phase9_profile_settings.sql`, then verify:

1. Edit display name, GA number, avatar URL, and home course.
2. Change units and confirm distance displays switch between metres and yards.
3. Toggle each notification preference and relaunch the app.
4. Confirm locked and unlocked achievements render correctly.
5. Run account deletion with a disposable account containing rounds and club data.
