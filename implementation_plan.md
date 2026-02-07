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
- Confirm demo POI toggle: selection must happen **before** publishing starts.

## Proposed Changes
1. **Maputnik export demo data** (`src/features/styles/services/MaputnikExportService.ts`):
   - Inject demo POI features into the `places` GeoJSON source when it is empty.
   - Use **all** generated icon keys (one POI per icon).
   - Lay them out in a grid around a safe center so all are visible together.
   - If style has no `center`/`zoom`, set a reasonable center and a zoom derived from grid size.
   - Add an option to disable demo POI injection (default ON for previews).
2. **Maputnik publish modal** (`src/shared/components/MaputnikPublishModal.tsx`):
   - Convert to a two-stage flow:
     - **Pre-publish**: show the Demo POIs toggle and a “Publish now” button.
     - **Post-publish**: show URLs + instructions + “Open in Maputnik”.
   - Keep copy-to-clipboard for the style URL as a fallback.
3. **Demo POI toggle UI**:
   - Keep the toggle state in `localStorage`.
   - Ensure the toggle value is applied **before** publishing starts.
4. **Tests**
   - Extend `test/features/styles/services/MaputnikExportService.test.ts` to assert all demo features are injected.
   - Add a test to ensure demo injection is skipped when disabled.

## Verification Plan
- Run `npm test test/features/styles/services/MaputnikExportService.test.ts`.
- Manual smoke: publish → import via modal URL → confirm icons visible without editing sources.
