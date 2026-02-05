# Implementation Plan

## Goal
Update POI label color assignment so `textColor` prefers category group colors from `getCategoryColor`, with palette fallback only when no group color exists, while preserving contrasting `haloColor` for legibility.

## User Review Required
No breaking changes expected. Quick confirmation requested before execution because this touches map label rendering behavior.

## Proposed Changes
1. **Adjust POI color selection logic** in `src/features/map/services/PoiService.ts`:
   - Import `getCategoryColor` from `src/constants.ts`.
   - Compute a preferred group color using `getCategoryColor(subcategory || category)`.
   - Set `textColor` to the group color when present; otherwise keep the existing palette-based fallback.
   - Keep `haloColor` as a contrasting color (palette/background contrast path) so labels remain readable.
2. **Validate map layer consumption path** in `src/features/map/hooks/useMapLogic.ts`:
   - Confirm labels still read `textColor` and `haloColor` from feature properties.
   - No map layer style schema changes.
3. **Update/add tests if behavior expectation changed** in `test/features/map/services/PoiService.test.ts`:
   - Cover group-color preference and palette fallback behavior.
   - Preserve halo contrast expectations.

## Verification Plan
- Run targeted unit tests: `npm test test/features/map/services/PoiService.test.ts`.
- If test expectations changed, update them in the same commit and re-run that suite until green.
- Manual spot-check: ensure POI labels render with category color text where available and still have readable halo contrast.
