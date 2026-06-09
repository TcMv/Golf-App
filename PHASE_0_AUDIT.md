# Golf Super-App Phase 0 Audit

Audit date: 2026-06-09  
Repository: `/Users/tarancroxton/Golf-App-1`  
Audited revision: `dbf13c1` plus the current uncommitted worktree

## Executive Summary

The repository is a functional React Native and Expo golf scoring prototype with:

- Supabase authentication and user profiles
- A seeded Nambour Golf Club course
- GPS front, middle, and back distances
- Satellite mapping and hazard overlays
- In-round scoring with debounced Supabase persistence
- Round history and scorecard detail
- Deterministic club recommendations using wind, elevation, and hazards
- Initial XP, streak, and badge logic
- Uncommitted Phase 6, Phase 7, and early Phase 8 UI work

It is not yet the end-state super-app described in the master prompt. The most important blockers are:

1. User data ownership is inconsistent. `clubs` and `app_settings` are global, several round queries rely only on RLS instead of explicit user filters, and legacy rows are visible to every authenticated user.
2. The required navigation is absent. The app has `Play`, `Rounds`, `Stats`, and `Settings`, not `Home`, `Round`, `Stats`, `Caddie`, and `Profile`.
3. New-user onboarding is unreachable because every authenticated session is treated as onboarding-complete.
4. Offline score persistence and retry queues are missing.
5. Handicap history selection is incorrect because differentials are sorted before the latest 20 are selected, and the calculation applies an obsolete `0.96` multiplier.
6. The Phase 5 badge set and persistence model do not match the required definitions.
7. Course selection is hardcoded to one course.
8. The Phase 6-8 worktree is large, uncommitted, and built on unresolved data contracts.

Phase 1 should begin only after the high-risk data and navigation decisions in the prioritized backlog are accepted.

## Repository State

### Git

- Remote branch HEAD: `dbf13c1 Phase 5: Gamification - XP, levels, streaks, 12 badges`
- The full available git history was reviewed.
- TypeScript verification passes with `npx tsc --noEmit`.
- There is no automated test suite or lint script.

### Uncommitted Work

The audit preserves these pre-existing changes:

- `package.json` and `package-lock.json`: adds `expo-haptics`
- `src/screens/play/PlayHomeScreen.tsx`: large Phase 7 dashboard draft
- `src/screens/stats/StatsScreen.tsx`: large Phase 6 analytics draft
- `src/screens/onboarding/MyBagSetupScreen.tsx`: early Phase 8 wizard draft
- `supabase/migrations/010_weekly_challenges.sql`: untracked Phase 7 migration

These changes compile, but they are not considered complete.

## 1. Screen And Navigation Inventory

### Authentication And Onboarding

| Screen | Status | Notes |
|---|---|---|
| Auth | EXISTS | Email/password sign-in and sign-up. |
| Welcome | EXISTS but unreachable | Navigator always bypasses onboarding for authenticated users. |
| My Bag Setup | PARTIAL, uncommitted | Wizard UI exists, but skip behavior saves a complete default bag and completion routes to handicap setup rather than Home. |
| Handicap Setup | EXISTS but unreachable | Stores a global `app_settings` value instead of the authenticated profile. |

### Main Navigation

Current tabs:

1. Play
2. Rounds
3. Stats
4. Settings

Required tabs:

1. Home
2. Round
3. Stats
4. Caddie
5. Profile

The required Caddie and Profile destinations do not exist. Round history is a separate tab rather than part of Stats.

### Round Flow

| Screen | Status | Notes |
|---|---|---|
| Play Home | PARTIAL | Committed version is a launch dashboard. Uncommitted version adds most Phase 7 sections. |
| Start Round | PARTIAL | 9/18 holes, starting hole, tees, handicap exclusion, and AI briefing exist. Course is hardcoded to Nambour. |
| Active Round | PARTIAL | GPS, map, hazards, swipe navigation, caddie, score, and putts exist. Offline queue and render isolation are missing. |
| End Round | PARTIAL | Scorecard, summary, differential, gamification, and debrief exist. No handicap posting action or cached debrief column. |

### History, Stats, And Administration

| Screen | Status | Notes |
|---|---|---|
| Rounds | EXISTS | Completed rounds list with date filters. No `getItemLayout`. |
| Round Detail | EXISTS | Full scorecard and summary. Uses broad selects. |
| Stats | PARTIAL, uncommitted | Dashboard, history, handicap chart, and club tracker draft exist. Needs data correctness and list/performance cleanup. |
| Settings | PARTIAL | Sign-out, global handicap, global bag, course editor, and version. Required preferences/account actions are missing. |
| My Bag | INCORRECT MODEL | Mutates global `clubs`, not authenticated `user_clubs`. |
| Admin Map | EXISTS | Internal course GPS/hazard editor for Nambour. It should not be exposed as ordinary user settings. |

### Components And Utilities

- Design-system components: `PrimaryButton`, `StatCard`, `DarkPill`, `ScoreBadge`
- Scoring: `HoleScoringSheet`
- Caddie: `CaddiePanel`, deterministic recommendation engine, wind/elevation utilities
- Context: authentication and in-memory active round state
- Hooks: continuous GPS and user gamification stats
- Utilities: handicap, distance, hole history, OpenAI prompts, gamification

## 2. Supabase Schema And RLS

The following describes migrations in the repository. The live Supabase project was not introspected, so migration application status remains unverified.

### Existing Tables

| Table | Key Columns | RLS Status | Audit |
|---|---|---|---|
| `courses` | id, name, lat, lng, holes | Disabled/not enabled | Public seed data for one course. |
| `tee_sets` | course_id, rating, slope, metres | Disabled/not enabled | Three Nambour tee sets. |
| `holes` | course_id, par, index, GPS points | Disabled/not enabled | All 18 Nambour holes seeded. |
| `hazards` | course_id, type, coordinates, hole assignment | Explicitly disabled | Public reads are reasonable, but client-side write access exposes course data. |
| `clubs` | name, type, carry | Disabled/not enabled | Global mutable bag; conflicts with `user_clubs`. |
| `rounds` | course, tee, totals, differential, user_id | Enabled | Select/update policies expose legacy `user_id IS NULL` rows to all users. |
| `hole_scores` | round, hole, score, putts, FIR/GIR | Enabled | Parent ownership policy lacks explicit `WITH CHECK` and includes legacy rounds. |
| `shots` | round, coordinates, distance, club | Missing | No RLS despite containing user location history. |
| `handicap_history` | differential, index, round, user_id | Enabled | Legacy rows visible to all users; policy coverage is incomplete. |
| `app_settings` | global key/value | Disabled/not enabled | Incorrect for user preferences. |
| `profiles` | display name, GHIN, home course, units, handicap | Enabled | Own-row policy exists; missing `total_xp`. |
| `user_clubs` | user, club, carry, total distance | Enabled | Own-row policy exists; missing `updated_at` and uniqueness on user/club name. |
| `user_stats` | XP, level, streak, totals | Enabled | Diverges from required `user_streaks` and `profiles.total_xp`. |
| `badges` | key, metadata, reward | Enabled/read-all | Badge definitions differ from the specification. |
| `user_badges` | user, badge, earned_at | Enabled | Equivalent intent to required `user_achievements`, but different contract. |
| `weekly_challenges` | week, title, type, target | Draft migration | Uncommitted and live status unknown. |
| `user_challenge_progress` | user, challenge, progress | Draft migration | Uncommitted and live status unknown. |

### Required Model Gaps

| Required Contract | Status |
|---|---|
| `profiles.total_xp` | MISSING |
| `courses.location`, `latitude`, `longitude`, course-level rating/par, JSON holes | DIFFERENT NORMALIZED MODEL |
| `rounds.played_at`, `score_vs_par`, putts/FIR/GIR totals, posted flag | MISSING OR DIFFERENT |
| `round_holes` | DIFFERENT: implemented as `hole_scores` |
| `user_clubs.updated_at` | MISSING |
| `user_streaks` with longest streak and last activity | MISSING |
| Required `user_achievements` contract | DIFFERENT: `user_badges` |
| Weekly challenges/progress | PARTIAL, uncommitted |
| Cached post-round AI debrief | MISSING |

The normalized course and hole model is reasonable and should be retained. The implementation should adapt the end-state behavior to it rather than replacing it with a JSON column.

### Security Findings

1. `shots` has no RLS and stores precise player coordinates.
2. `clubs`, `app_settings`, `hazards`, and course editing are client-writable global data.
3. Legacy round visibility allows all signed-in users to read rows with `user_id IS NULL`.
4. Several policies use broad all-command forms without explicit insert/update checks.
5. User-facing queries frequently use `select('*')`, contrary to the performance requirement.
6. The OpenAI key is an `EXPO_PUBLIC_` client variable and is therefore extractable from the app bundle. AI calls need a Supabase Edge Function or another server-side proxy.

## 3. What Works

- Dark forest visual tokens and Inter font loading are established.
- Authentication sessions persist through Supabase and AsyncStorage.
- Nambour course, tee, hole GPS, and hazard seed data are present.
- Foreground GPS updates continuously at high accuracy.
- Live front, middle, and back distance calculations are implemented.
- Satellite map, player/tee/green markers, hole orientation, and hazard polygons are implemented.
- Score and putt changes update local round context and auto-save to Supabase.
- Left/right swipe and previous/next hole navigation are implemented.
- Completed round history and a detailed scorecard are implemented.
- Differential calculation itself follows the base WHS formula.
- The in-round caddie is deterministic and combines club carry, wind, elevation, and hazards.
- Open-Meteo wind access is implemented without a paid dependency.
- Post-round AI prompt generation and a three-tip response flow are implemented.
- Phase 5 includes working client-side XP, streak, and badge-award foundations.
- The current worktree compiles.

## 4. Broken Or Incomplete

### Critical

- Onboarding is always bypassed.
- “Do This Later” in the Phase 8 draft saves every default club instead of leaving setup incomplete.
- The app has two conflicting bag systems: global `clubs` and per-user `user_clubs`.
- Handicap index calculation uses the best values globally instead of the latest 20 and applies a `0.96` multiplier.
- An API secret is expected in the public Expo bundle.
- There is no offline scoring queue, reconnect sync, or last-known GPS cache.

### High

- Course search/selection is missing; all round flows use a hardcoded course UUID.
- The required five-tab navigation is missing.
- Caddie and Profile screens are missing.
- The required 12 badge definitions and triggers are not implemented.
- Achievement checks are client-side, not a Supabase Edge Function.
- Streaks track only a single last-round date and do not retain longest streak.
- Earning badges is not a full-screen animated celebration.
- Weekly challenge progress is only advanced by the practice action, not reliably by round completion.
- Post-round debrief is not cached and can be called repeatedly.
- Profile handicap and global `app_settings` handicap can disagree.
- Round state is memory-only; process termination loses the active session context.

### Medium

- Front/middle/back GPS seed points are often identical, so displayed values may not differ.
- No stale GPS indicator exists.
- The active screen is monolithic and not separated with `React.memo`.
- No explicit Golf Australia posting integration or honest manual-posting state exists.
- Stats calculations need validation for 9-hole rounds, partial rounds, course par, and user ownership.
- Several screens use spinners rather than skeleton states.
- Error states frequently lack retry actions.
- Haptics are not consistently applied to score changes, badge earning, and round completion.
- Settings lacks units, notification preferences, delete account, and build number.
- Units are not applied globally.
- No avatar, profile summary, home-course selector, or full locked/earned achievement grid exists.

## 5. Technical Debt

- No tests, lint script, formatter script, or CI quality checks.
- `react-native-chart-kit` is installed despite the prompt prohibiting heavy chart libraries; current custom charts use SVG, so the dependency can likely be removed.
- `src/utils/anthropic.ts` contains OpenAI code and stale Anthropic error text.
- Multiple large screens exceed 500-1,500 lines.
- Navigation route types are duplicated across screens instead of centralized.
- Broad `any` use hides Supabase response-shape problems.
- Many `select('*')` queries remain.
- Course IDs, course labels, coordinates, and tee labels are hardcoded.
- App icon and splash backgrounds use `#0a0a0a`, not the required `#0b1810`.
- Emoji are used as production icons and badge assets, which produces inconsistent platform rendering.
- `console.error` and `console.warn` calls remain in production paths.
- Date/streak logic uses local JavaScript dates rather than an explicit Australia/Brisbane calendar-day helper.
- There is no migration verification or generated Supabase database type file.

## 6. Gap Analysis Against End-State Vision

### Visual Identity

| Requirement | Status |
|---|---|
| Required color tokens | EXISTS |
| Inter typography | EXISTS |
| Strict typography scale | PARTIAL |
| 8-point spacing values only | PARTIAL |
| Standard cards/buttons/pills | PARTIAL |
| Dark-only UI | EXISTS |
| Correct app icon/splash colors | PARTIAL |

### Navigation

| Requirement | Status |
|---|---|
| Home tab | PARTIAL as `Play` |
| Round tab | PARTIAL through modal flow |
| Stats tab | EXISTS/PARTIAL |
| Caddie tab | MISSING |
| Profile tab | MISSING |

### Home

| Requirement | Status |
|---|---|
| Time-aware greeting | EXISTS in uncommitted draft |
| Handicap and monthly delta | EXISTS in uncommitted draft, calculation needs correction |
| Streak and XP | PARTIAL in uncommitted draft |
| Start Round | EXISTS |
| Practice Log | EXISTS in uncommitted draft |
| Weekly challenge | PARTIAL in uncommitted draft |
| Last round | EXISTS in uncommitted draft |
| Monthly stats | EXISTS in uncommitted draft |

### Round Setup And In-Round

| Requirement | Status |
|---|---|
| Course search/select | MISSING |
| 9/18 holes | EXISTS |
| Tee selection | EXISTS |
| Fixed hole/par/index/score top bar | EXISTS |
| GPS distance block | EXISTS |
| AI caddie strip | EXISTS |
| Satellite map and hazards | EXISTS |
| Auto-saving score and putts | EXISTS online |
| Swipe navigation | EXISTS |
| Five-second GPS cadence | EXISTS at three seconds |
| Offline score queue | MISSING |
| Stale GPS state | MISSING |
| Isolated GPS render updates | MISSING |

### Post-Round

| Requirement | Status |
|---|---|
| Full scorecard | EXISTS |
| Score/FIR/GIR/putts summary | EXISTS |
| Handicap differential | EXISTS |
| Post to handicap | MISSING |
| Three-tip AI debrief | EXISTS but uncached and insecure |
| Save and return Home | EXISTS |

### Stats

| Requirement | Status |
|---|---|
| Round history | EXISTS |
| Expandable scorecard | EXISTS in uncommitted Stats draft; separate detail exists committed |
| FIR/GIR/putts cards and sparklines | EXISTS in uncommitted draft |
| Par-type averages | EXISTS in uncommitted draft |
| Best/worst holes | EXISTS in uncommitted draft |
| Handicap chart and markers | EXISTS in uncommitted draft |
| Target handicap projection | PARTIAL heuristic |
| Club distances and GPS averages | PARTIAL in uncommitted draft |

### Caddie

| Requirement | Status |
|---|---|
| In-round deterministic recommendation | EXISTS |
| Pre-round conditions and strategy | PARTIAL in Start Round |
| Dedicated briefing screen/tab | MISSING |
| Club setup destination | PARTIAL |
| Post-round debrief destination/share | MISSING |

### Gamification

| Requirement | Status |
|---|---|
| Round/practice daily streak | PARTIAL |
| Longest streak | MISSING |
| XP display | PARTIAL |
| Required 12 badges | MISSING |
| Server-side achievement check | MISSING |
| Badge celebration animation | MISSING |
| Weekly challenge data | PARTIAL, uncommitted |
| Reliable challenge trigger updates | MISSING |

### Profile And Settings

| Requirement | Status |
|---|---|
| Profile screen | MISSING |
| Avatar/initials | MISSING |
| GHIN and home course | Schema only |
| Profile stats summary | MISSING |
| Full achievement grid | MISSING |
| Units preference and conversion | MISSING |
| Notification preferences | MISSING |
| Club setup shortcut | PARTIAL via global My Bag |
| Sign out | EXISTS |
| Delete account | MISSING |
| App version/build number | PARTIAL |

## 7. Gap Analysis Against 18Birdies

The comparison was checked against current official 18Birdies feature pages on 2026-06-09:

- https://18birdies.com/features/
- https://18birdies.com/
- https://18birdies.com/premium

The master vision covers GPS, scorecards, handicap tracking, club recommendations, stats, and basic improvement advice. It does not cover several broader 18Birdies capabilities:

| Capability | Existing App | Master Vision |
|---|---|---|
| Multi-player live scoring | MISSING | MISSING |
| Friends, social feed, and sharing network | MISSING | Only debrief sharing |
| Group leaderboards | MISSING | MISSING |
| Side games such as skins, match play, Wolf, Nassau | MISSING | MISSING |
| Apple Watch/Wear OS GPS and scoring | MISSING | MISSING |
| AI swing video analysis | MISSING | MISSING |
| Practice video/drill library | MISSING | MISSING |
| Benchmarking against other golfers/course cohorts | MISSING | MISSING |
| Broad global course database | MISSING | Course search required, provider unspecified |
| 3D green maps | MISSING | MISSING |
| Weather beyond wind | MISSING | Wind only |

These should not block the current ten-phase roadmap. The highest-value future parity items are multi-player scoring, side games, sharing, and wearable support. Swing analysis and 3D greens have substantially larger product and data costs.

## Prioritized Build Backlog

### Foundation Before Phase 1 Sign-Off

1. Choose canonical per-user contracts:
   - `profiles` for preferences and handicap
   - `user_clubs` for bag data
   - `user_stats` or `user_streaks`, but not overlapping sources
2. Add corrective migrations for RLS, `shots`, user ownership, debrief caching, streak fields, and required badge definitions.
3. Correct handicap calculation and add unit tests.
4. Centralize navigation types and implement the required five-tab information architecture.
5. Make onboarding state real and query whether the user has entered clubs.
6. Move OpenAI calls behind a Supabase Edge Function.

### Then Complete Phases Sequentially

1. Phase 1: finish token compliance and apply it to every screen.
2. Phase 2: course selection, correct handicap, ownership-safe history, and offline score queue.
3. Phase 3: split the active screen into memoized sections and add stale/offline behavior.
4. Phase 4: create the dedicated Caddie destination and secure/cached AI flows.
5. Phase 5: replace badge/streak contracts with the required definitions and server-side checks.
6. Phase 6: validate and integrate the existing Stats draft.
7. Phase 7: validate and integrate the existing Home draft and challenge triggers.
8. Phase 8: repair and connect the existing club onboarding draft.

## Phase 0 Exit Decision

Phase 0 is complete as a repository audit, with two explicit limitations:

- Live Supabase schema/policy state was not queried, so migration deployment must be verified before data fixes.
- Device-level GPS, map, offline, and performance behavior was not exercised during this static audit.

The repository should proceed to Phase 1 using the prioritized backlog above, while preserving and incrementally integrating the current Phase 6-8 worktree.
