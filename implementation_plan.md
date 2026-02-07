# Implementation Plan

## Goal
Make Maputnik previews effortless by:
- publishing a working style URL with sprites, and
- showing demo POIs for **all** icon types immediately after import,
- plus a modal with one‑click “Open in Maputnik”.

## User Review Required
- Confirm default repo/branch/path values used in the prompts.
- Confirm token usage: **store token in localStorage** for one-click exports.
- Confirm Maputnik modal UX: show URLs + instructions + “Open in Maputnik” button.
- Confirm Maputnik demo data: inject demo POIs for **all** icon keys so everything is visible at once.
- Confirm demo POI toggle: add a UI toggle to disable demo POIs for production exports.

## Proposed Changes
1. **Maputnik export demo data** (`src/features/styles/services/MaputnikExportService.ts`):
   - Inject demo POI features into the `places` GeoJSON source when it is empty.
   - Use **all** generated icon keys (one POI per icon).
   - Lay them out in a grid around a safe center so all are visible together.
   - If style has no `center`/`zoom`, set a reasonable center and a zoom derived from grid size.
   - Add an option to disable demo POI injection (default ON for previews).
2. **Maputnik publish modal** (`src/shared/components/MaputnikPublishModal.tsx`):
   - Add an “Open in Maputnik” button that opens a new tab with the style URL prefilled.
   - Keep copy-to-clipboard for the style URL as a fallback.
3. **Demo POI toggle UI**:
   - Add a checkbox/toggle in the Theme Library section for Maputnik exports.
   - Persist preference in `localStorage` so the choice sticks.
   - Pass the setting into `MaputnikExportService.buildExport`.
4. **Tests**
   - Extend `test/features/styles/services/MaputnikExportService.test.ts` to assert all demo features are injected.
   - Add a test to ensure demo injection is skipped when disabled.

## Verification Plan
- Run `npm test test/features/styles/services/MaputnikExportService.test.ts`.
- Manual smoke: publish → import via modal URL → confirm icons visible without editing sources.
