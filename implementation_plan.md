# Implementation Plan

## Hotfix Plan: Deployed Basemap Rendering Regression (2026-02-20)

### Goal
Fix the production regression where the deployed app shows a gray map canvas for `Standard Light` because an empty placeholder style is being treated as a full renderable MapLibre style and applied over the loaded base style.

### User Review Required
1. Scope confirmation:
   - Apply this fix as a non-breaking runtime guard (no schema migration), so existing saved styles remain valid.
2. Desired fallback behavior:
   - If a style JSON is structurally valid but has no layers/sources, treat it as placeholder and render the fetched base style instead.

### Proposed Changes
1. Add renderability guard for style JSON.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Introduce helper logic to detect placeholder/empty style JSON.
   - Update `resolveRenderStyle` to use `baseStyle` when current style has empty `layers` or empty `sources`.
   - Update `shouldApplyPaletteOverrides` so placeholder styles do not trigger incorrect full-style mode.

2. Add regression tests for empty-style fallback.
   - File: `test/features/map/hooks/useMapLogic.test.ts`
   - Add tests to verify:
     - empty placeholder style falls back to `baseStyle`,
     - non-empty compiled style still renders directly,
     - palette override mode remains correct for legacy palette objects.

3. Optional hardening follow-up if needed after validation.
   - File: `src/constants.ts` (only if required)
   - Consider changing default preset placeholder from empty style to explicit legacy marker object to make intent unambiguous.
   - This step will be skipped unless tests/manual check show ambiguity remains.

### Verification Plan
1. Targeted regression suite:
   - `npm test -- --run test/features/map/hooks/useMapLogic.test.ts`
2. Broader style safety suite:
   - `npm test -- --run test/features/map/services/styleCompiler.test.ts test/features/map/services/styleCatalog.test.ts test/features/styles/hooks/useStyleManager.import.test.ts`
3. App behavior sanity:
   - `npm test -- --run`
4. Manual production check:
   - Open deployed app, select `Standard Light`, verify basemap tiles/roads/water/labels render (not plain gray).
   - Switch between generated custom style and default style to confirm no regression in style switching.

## Hotfix Plan: Atlas Icon Coverage Reliability (2026-02-20)

### Goal
Fix real-API runs where generation completes with only two AI calls but produced icons are unusable/empty in the UI/map for large category sets (139 POI types).

### User Review Required
1. Cost/quality tradeoff:
   - Reduce atlas batch size to improve icon quality and extraction reliability while remaining low-cost.
2. UX behavior:
   - Keep `atlas` mode no-fallback (still cheapest), but surface explicit usable icon counts and warning when atlas output is empty.

### Proposed Changes
1. Improve atlas batch strategy.
   - File: `src/features/ai/services/GeminiService.ts`
   - Reduce `ICON_ATLAS_MAX_ICONS_PER_BATCH` so 139 categories are split into multiple atlas requests.
   - Keep per-icon and auto fallback caps unchanged.

2. Make atlas slicing robust against green-screen artifacts.
   - File: `src/features/ai/services/iconAtlasUtils.ts`
   - Apply deterministic chroma-key cleanup per icon cell while slicing.
   - Detect low-content/empty cells after cleanup and return `null` for those cells.

3. Improve generation diagnostics in Activity Logs.
   - File: `src/features/ai/services/GeminiService.ts`
   - Log per-batch usable icon counts and final usable count (`usable/total`).
   - Emit warning when atlas mode returns no usable icons.

4. Update cost-accounting BDD expectations.
   - File: `test/e2e/features/IconGenerationModes.feature`
   - Adjust expected atlas invocation counts for multi-batch behavior.

5. Add/update unit tests.
   - File: `test/features/ai/services/iconAtlasUtils.test.ts`
   - Add tests for chroma-key classification behavior.

### Verification Plan
1. Targeted unit tests:
   - `npm test -- --run test/features/ai/services/iconAtlasUtils.test.ts test/features/ai/services/GeminiService.test.ts`
2. BDD invocation accounting:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. Full unit sanity:
   - `npm test -- --run`
4. Manual check:
   - Generate theme with real API in `auto` mode and confirm:
     - custom icons appear in right panel and on map,
     - logs show usable icon counts,
     - request count remains low (multi-atlas, not per-icon flood).

## Goal
Replace the current heuristic palette flow with a deterministic style compiler that:
1. Starts from the OpenFreeMap Liberty base style template.
2. Applies a complete theme color system across all color-capable style properties.
3. Covers all mapped POI categories with deterministic icon assignment and robust fallback behavior.
4. Auto-discovers style color targets and icon keys from the base Liberty template so coverage stays in sync when upstream style layers/icons change.
5. Enforce generation cost safety with deterministic per-run API call caps and BDD coverage for invocation budgets.

## User Review Required
1. Confirm the scope definition for "all possible POI types":
   - Implementation target will be all POI categories represented by the app taxonomy and OSM mapping tables, plus fallback for unknown categories.
2. Confirm AI contract change:
   - AI will return a strict `ThemeSpec` (design tokens + optional targeted overrides), not raw full style JSON authored by the model.
3. Confirm backward compatibility:
   - Existing saved themes may have legacy `mapStyleJson` (simple palette object). We will support migration/fallback reads.

## Proposed Changes
0. Add auto-generated style catalog pass (new).
   - Create `src/features/map/services/styleCatalog.ts`.
   - Build catalog from a full base style JSON:
     - all color-capable paint/layout properties by layer,
     - inferred semantic role per layer (water/road/admin/label/etc),
     - all literal `icon-image` keys referenced in symbol layers,
     - POI symbol source layers.
   - Expose deterministic helpers:
     - `buildStyleCatalog(style)`
     - `extractIconImageKeys(style)`
     - `extractPoiSymbolSources(style)`

1. Add style manifest + compiler (deterministic engine).
   - Create `src/features/map/services/styleCompiler.ts`.
   - Responsibilities:
     - Load/clone Liberty style template.
     - Use style catalog output to enumerate/apply color-capable paint/layout keys for all layers.
     - Apply tokenized theme values by layer classification (water, land, roads by class, boundaries, labels, POI label halos, etc.).
     - Apply optional per-layer/per-property overrides from `ThemeSpec`.
     - Output a complete MapLibre style JSON object.
     - Persist catalog summary metadata for diagnostics (`colorTargetCount`, `iconKeyCount`).

2. Add strict `ThemeSpec` schema and defaults.
   - Create `src/features/ai/services/themeSpec.ts`.
   - Define explicit token set (example groups):
     - Base: background, land, building.
     - Water: waterFill, waterLine.
     - Roads: motorway, primary, secondary, local, roadCasing.
     - Boundaries/Admin: country, state, city.
     - Labels: textPrimary, textSecondary, haloPrimary.
     - POI: poiText, poiHalo, poiAccent.
     - Popup: background, text, border, radius, font.
   - Include validation/normalization with safe defaults.

3. Update AI generation contract to return `ThemeSpec`.
   - Modify `src/features/ai/services/GeminiService.ts`.
   - Replace current `mapColors` prompt contract with strict JSON contract:
     - `themeSpec.tokens`
     - `themeSpec.layerOverrides` (optional)
     - `popupStyle`
     - `iconTheme`
   - Parse/validate `ThemeSpec`.
   - Compile to full style JSON via `styleCompiler`.
   - Store both:
     - compiled full style JSON (`mapStyleJson`),
     - normalized tokens metadata for future re-edit/export.

4. Replace runtime heuristic palette mutation with compiled style usage.
   - Update `src/features/map/hooks/useMapLogic.ts` and `src/features/map/services/PaletteService.ts`.
   - Primary behavior:
     - If active style already contains full style JSON layers/sources, set that style directly.
   - Fallback behavior:
     - Legacy themes still supported via existing palette derivation path.
   - Keep POI source/layer injection logic intact and deterministic.

5. Expand deterministic POI icon mapping coverage.
   - Create `src/features/map/services/poiIconResolver.ts`.
   - Build canonical mapping from existing POI taxonomy + OSM mapping to icon keys.
   - Ensure all mapped categories resolve to an icon.
   - Add explicit unknown fallback icon key and fallback generation prompt.

6. Align icon generation flow to canonical POI coverage.
   - Update `src/features/ai/services/GeminiService.ts` and icon generation callers.
   - Generate icons for canonical category list used by resolver (not ad hoc duplicates).
   - Preserve atlas/per-icon/auto behavior and fallback limits.

7. Export pipeline should emit compiled style directly.
   - Update `src/features/styles/services/MapStyleExportService.ts`.
   - If preset has compiled full style JSON, export it as-is with POI layer/source checks.
   - Keep legacy path (base style + apply palette) as compatibility fallback only.

8. Documentation updates.
   - Update `README.md` with:
     - new generation architecture (`ThemeSpec -> compiler -> full style JSON`),
     - POI icon coverage rules and fallback behavior,
     - migration notes for old presets.

9. Tests (required).
   - Add `test/features/map/services/styleCatalog.test.ts`:
     - validates color target extraction, icon key extraction, and POI source discovery.
   - Add `test/features/map/services/styleCompiler.test.ts`:
     - validates complete layer/property application via catalog and output metadata shape.
   - Add `test/features/map/services/poiIconResolver.test.ts`:
     - validates all taxonomy categories resolve; unknown fallback works.
   - Update `test/features/ai/services/GeminiService.test.ts`:
     - validates strict `ThemeSpec` parsing and compilation path.
   - Update `test/features/map/hooks/useMapLogic.test.ts`:
     - verifies compiled-style-first behavior and legacy fallback behavior.
   - Update `test/features/styles/services/MapStyleExportService.test.ts`:
     - verifies compiled-style export path.
   - Update `test/e2e/features/IconGenerationModes.feature`:
     - verify per-icon mode budget cap.
     - verify auto mode atlas-success path avoids per-icon calls.
   - Update `test/features/ai/services/GeminiService.test.ts`:
     - verify per-icon mode is capped deterministically by budget guard.

## Verification Plan
1. Targeted tests:
   - `npm test -- --run test/features/map/services/styleCatalog.test.ts test/features/map/services/styleCompiler.test.ts test/features/map/services/poiIconResolver.test.ts test/features/ai/services/GeminiService.test.ts test/features/map/hooks/useMapLogic.test.ts test/features/styles/services/MapStyleExportService.test.ts`
2. Full unit suite:
   - `npm test`
3. E2E BDD sanity:
   - `npm run test:e2e:bdd -- --grep "Map Style Interaction|Icon Generation Mode Invocation Accounting"`
4. Manual checks:
   - Generate a new theme and confirm:
     - full style JSON is stored (not only palette),
     - map recolors are deterministic across water/roads/admin/labels,
     - popup style is applied,
     - every visible mapped POI uses a valid icon or fallback.
5. Cost safety checks:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
   - confirm invocation counts match configured caps and success-path minima.
