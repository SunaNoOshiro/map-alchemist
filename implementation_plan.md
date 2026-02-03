# Implementation Plan

## Goal
Move the open panel buttons into the top header (using the same “Setup” and “Icons” text as mobile), while improving sidebar open/close animations to feel smooth and less laggy.

## User Review Required
Yes. Desktop header controls and animation timing will change. Please confirm the plan before implementation.

## Proposed Changes
1. **Move open buttons to the header** (top toolbar area) and label them “Setup” and “Icons” to match mobile wording.
2. **Show header buttons only when a panel is closed** to avoid clutter while panels are open.
3. **Refine sidebar transitions** in `SidebarContainer` to reduce lag (tune duration/easing and avoid visibility flicker) while keeping smooth map reflow.
4. **Update tests** if toolbar structure or toggle labels change.

## Verification Plan
- Run `npm test` (required pre-flight).
- Manual visual check on desktop open/close animations to confirm smooth transitions and header button placement.
