# Phase 1 - Design System Overhaul

Completed: 2026-06-09

## What Changed

- Centralized the approved forest palette in `src/constants/theme.ts`.
- Removed screen-level hex and RGB color declarations.
- Normalized legacy color aliases so they resolve to the approved palette.
- Added reusable display, heading, body, caption, and label typography contracts.
- Enforced Inter as the default font for all `Text` and `TextInput` components.
- Standardized primary buttons to:
  - accent background
  - deep forest text
  - 12px radius
  - bold Inter label
  - accent-dark pressed state
- Standardized cards to 16px radius, approved surfaces, and border tokens.
- Standardized modal backdrops, map overlays, score tints, and shadows.
- Updated navigation chrome to the approved surface, accent, and muted colors.
- Updated the app icon and splash backgrounds to `#0b1810`.
- Brought the internal course editor into the same visual system.
- Mapped literal text sizes in the current Phase 6-8 drafts onto the approved typography scale.

## Decisions

1. Existing names such as `green`, `surface1`, and `surface3` remain temporarily to avoid a high-risk repository-wide rename. Their values now resolve to the approved design tokens.
2. The normalized course map retains semantic hazard distinctions, but those colors now use the approved accent, muted text, and score palette.
3. Circular icon controls and true progress pills remain fully rounded. Action buttons use the required 12px radius.
4. The explicitly specified 72px in-round distance remains an exception to the general 48px display scale.
5. The existing uncommitted Phase 6-8 screens were restyled in place and not discarded.

## Verification

- [x] App background is `#0b1810`.
- [x] Cards and sheets use approved surface colors.
- [x] Primary accent is `#00e062`; pressed accent is `#00a847`.
- [x] Primary and muted text use the approved colors.
- [x] Score colors match the specification.
- [x] No white screen backgrounds exist.
- [x] No raw screen/component colors remain outside the theme module.
- [x] Inter is the only application font family.
- [x] Primary buttons use 12px radius.
- [x] Cards use 16px radius.
- [x] Tab bar uses the approved active/inactive treatment.
- [x] TypeScript compilation passes.

## Blockers

None for Phase 1.

Navigation destinations and feature completeness remain Phase 2-9 work and are tracked in `PHASE_0_AUDIT.md`.
