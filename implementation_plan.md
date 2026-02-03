# Implementation Plan

## Goal
Ensure the selected icon card is fully visible (including prompt + Regenerate button) and fix the half-gray map by resizing the map on layout changes.

## User Review Required
Yes. Selected icon card layout and map resize behavior will change.

## Proposed Changes
1. **Clamp selected card height** in `src/shared/components/sidebar/right/IconItem.tsx` with a max height and internal scroll for the prompt so the full card stays visible.
2. **Ensure scroll reveals the full selected card** in `src/shared/components/sidebar/RightSidebar.tsx`, aligning under the sticky header and ensuring the bottom fits.
3. **Resize MapLibre on layout changes** in `src/features/map/hooks/useMapLogic.ts` via a `ResizeObserver` on the map container.

## Verification Plan
- Run `npm test` (required pre-flight).
- Run `npm run test:e2e:bdd` to cover remix focus and scroll scenarios on mobile and desktop.
