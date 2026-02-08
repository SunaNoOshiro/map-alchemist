# Implementation Plan

## Goal
Provide a customer-ready integration path where users can load a published Map Alchemist style with one runtime script, enable popup/POI features via config, and embed it in any website with minimal code.

## User Review Required
- Confirm runtime API shape and defaults:
  - `MapAlchemistRuntime.init({ container, styleUrl, features, mapOptions })`
  - default `features.popup = true`
  - default `features.poiColorLabels = true`
  - default `features.demoPois = false`
- Confirm script delivery path from GitHub Pages:
  - `https://<owner>.github.io/<repo>/runtime/map-alchemist-runtime.js`
- Confirm export metadata contract:
  - write `metadata.mapAlchemist` into published style JSON with popup + POI config.

## Proposed Changes
1. **Runtime engine script**
   - Create `/Users/suna_no_oshiro/Documents/fun-gpt/map-alchemist/public/runtime/map-alchemist-runtime.js`.
   - Expose `window.MapAlchemistRuntime.init(options)`.
   - Internally:
     - create MapLibre map from `styleUrl`.
     - attach click handler for POI layer (`unclustered-point`) when popup feature is enabled.
     - render popup HTML using style metadata (`metadata.mapAlchemist.popupStyle`) with safe defaults.
     - keep behavior toggle-driven via `features` config.

2. **Export metadata enrichment**
   - Update `/Users/suna_no_oshiro/Documents/fun-gpt/map-alchemist/src/features/styles/services/MaputnikExportService.ts`.
   - Ensure published style includes:
     - `metadata.mapAlchemist.version`
     - `metadata.mapAlchemist.poiLayerId`
     - `metadata.mapAlchemist.placesSourceId`
     - `metadata.mapAlchemist.popupStyle`
     - `metadata.mapAlchemist.palette`
   - Keep style fully MapLibre-compatible.

3. **Publish modal snippet**
   - Update `/Users/suna_no_oshiro/Documents/fun-gpt/map-alchemist/src/shared/components/MaputnikPublishModal.tsx`.
   - After successful publish, show ready-to-paste snippet:
     - MapLibre CSS/JS include
     - runtime script include
     - `MapAlchemistRuntime.init(...)` call
   - Add copy button for snippet.

4. **Documentation**
   - Update `/Users/suna_no_oshiro/Documents/fun-gpt/map-alchemist/README.md` with:
     - customer embed instructions
     - runtime config options
     - expected style URL + runtime URL format.

5. **Tests**
   - Extend `/Users/suna_no_oshiro/Documents/fun-gpt/map-alchemist/test/features/styles/services/MaputnikExportService.test.ts`:
     - assert metadata block exists and contains expected fields.
   - Add runtime smoke test for snippet generation logic if extracted to a helper module.

## Verification Plan
1. Run `npm test test/features/styles/services/MaputnikExportService.test.ts`.
2. Run `npm test`.
3. Manual check:
   - publish style.
   - open provided snippet in a static HTML file served over HTTP.
   - confirm map loads, custom icons appear, popup appears on POI click.

## Hotfix Scope (Snippet Render + Publish UX)
### Goal
Fix exported styles that fail to render in MapLibre snippets due to invalid `symbol-spacing`, and remove publish-time alert-style interruptions.

### Proposed Changes
1. Update `src/features/styles/services/MaputnikExportService.ts`:
   - ensure relaxed POI layer uses valid `'symbol-spacing'` value accepted by MapLibre style validator.
2. Update `src/features/styles/hooks/useStyleManager.ts`:
   - remove preview publish confirmation dialog so publish path is non-blocking.
3. Update tests in `test/features/styles/services/MaputnikExportService.test.ts`:
   - assert exported demo POI layer keeps validator-safe symbol layout values.

### Verification Plan
1. Run `npm test test/features/styles/services/MaputnikExportService.test.ts`.
2. Run `npm test test/features/styles/services/embedSnippet.test.ts`.
3. Run `npm test`.

## Follow-up Scope (Publish Modal Visibility + BDD Coverage)
### Goal
Ensure the publish popup is fully usable on constrained viewport heights and add BDD coverage for publish modal runtime-export UX without blocking dialogs.

### Proposed Changes
1. Update `src/shared/components/MaputnikPublishModal.tsx`:
   - constrain modal height to viewport and enable internal scrolling for long content/snippets.
2. Add BDD scenarios in `test/e2e/features/MaputnikPublish.feature`:
   - open publish modal, verify controls are visible and usable.
   - publish with mocked GitHub API and assert result section includes style/runtime/snippet blocks.
   - assert no browser dialog (`alert`/`confirm`/`prompt`) appears during configured publish flow.
3. Add step definitions in `test/e2e/steps/MaputnikPublish.steps.ts`:
   - seed localStorage publish config.
   - mock GitHub REST endpoints used by publisher.
   - perform publish and assert modal UI states/content.

### Verification Plan
1. Run `npm run test:e2e:bdd`.
2. Run `npm test`.

## Follow-up Scope (Snippet Popup Parity)
### Goal
Bring the embed runtime popup closer to in-app popup behavior and ensure exported demo POIs preserve colored text labels.

### Proposed Changes
1. Update `public/runtime/map-alchemist-runtime.js`:
   - render popup with custom close button, icon image, address/details section, and description.
   - remove default MapLibre white popup shell styling.
2. Update `src/features/styles/services/MaputnikExportService.ts`:
   - include icon URL lookup map in `metadata.mapAlchemist.iconUrls` for runtime popup images.
   - generate demo POIs with category-based `textColor` and richer properties for popup details.
3. Update tests:
   - extend `test/features/styles/services/MaputnikExportService.test.ts` with assertions for metadata icon URLs and demo POI color/details.
   - keep existing BDD flow green (`npm run test:e2e:bdd`).

### Verification Plan
1. Run `npm test test/features/styles/services/MaputnikExportService.test.ts`.
2. Run `npm run test:e2e:bdd`.
3. Run `npm test`.

## Hotfix Scope (GitHub 422 Blob Too Large)
### Goal
Prevent GitHub publish failures caused by oversized style JSON payloads while keeping popup images functional in embed runtime.

### Proposed Changes
1. Update `src/features/styles/services/MaputnikExportService.ts`:
   - stop embedding per-icon image URLs in `metadata.mapAlchemist` when they are heavy payloads.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - resolve popup icon image from exported sprite sheet (`sprite.json` + `sprite.png`) instead of large metadata payloads.
3. Update tests:
   - adjust `test/features/styles/services/MaputnikExportService.test.ts` to validate the lean metadata contract.
   - keep BDD/e2e green after runtime image source change.

### Verification Plan
1. Run `npm test test/features/styles/services/MaputnikExportService.test.ts`.
2. Run `npm run test:e2e:bdd`.
3. Run `npm test`.

## Follow-up Scope (Popup Icon Fidelity + Color Parity)
### Goal
Improve exported runtime popup icon quality and align demo POI label color behavior with in-app MapAlchemist color resolution.

### Proposed Changes
1. Update `public/runtime/map-alchemist-runtime.js`:
   - load and prefer `@2x` sprite assets for popup icon rendering.
   - render sprite icon with pixel-ratio-aware scaling to avoid blurry popup icons.
   - keep no-white-shell popup behavior and add robust symbol-spacing normalization for string numeric values.
2. Update `src/features/styles/services/MaputnikExportService.ts`:
   - replace hash-based fallback label colors with in-app-equivalent category-group lookup behavior.
   - fallback unknown demo labels to palette text color for parity.
3. Update tests:
   - extend `test/features/styles/services/MaputnikExportService.test.ts` with unknown-category fallback color assertion.

### Verification Plan
1. Run `npm test test/features/styles/services/MaputnikExportService.test.ts`.
2. Run `npm run test:e2e:bdd`.
3. Run `npm test`.

## Follow-up Scope (Popup Arrow + Zoom Close Behavior)
### Goal
Make runtime popup pointer visually indicate the opened POI and ensure popup closes automatically on zoom changes.

### Proposed Changes
1. Update `public/runtime/map-alchemist-runtime.js`:
   - add custom popup arrow element in popup HTML.
   - force popup anchor to `bottom` for consistent pointer direction.
   - track `activePopup` and close it on `zoomstart`.
2. Add contract tests:
   - `test/features/styles/services/runtimeScriptContract.test.ts` to verify runtime script keeps arrow and zoom-close behavior markers.

### Verification Plan
1. Run `npm test test/features/styles/services/runtimeScriptContract.test.ts`.
2. Run `npm run test:e2e:bdd`.
3. Run `npm test`.

## Feature Scope (UI Popup Visual Unification)
### Goal
Unify only application UI popups (program modal windows) with existing panel/section visual language, without changing POI map popups.

### Proposed Changes
1. Update `src/shared/components/MaputnikPublishModal.tsx`:
   - align modal surface, borders, spacing, and action controls to the same dark panel style used in sidebars.
   - use section accent color for key actions while keeping readability.
2. Keep map POI popup stack unchanged:
   - do not modify `PopupGenerator`, `MapLibreAdapter` popup presentation, or runtime POI popup visuals.

### Verification Plan
1. Run `npm run test:e2e:bdd`.
2. Run `npm test`.
3. Manual check:
   - open publish modal and compare against left/right panel styling for consistency.

## Follow-up Scope (Exact Panel Token Match for Modal)
### Goal
Make `MaputnikPublishModal` visually match existing app panels/headers exactly for button style, font scale, and color tokens.

### User Review Required
1. Confirm target is strict parity with existing panel controls (including `Close` button style with icon).
2. Confirm modal should keep centered-dialog layout while matching panel typography/colors.

### Proposed Changes
1. Update `src/shared/components/MaputnikPublishModal.tsx`:
   - reuse the same close-button classes used in sidebars.
   - normalize text sizes to panel scale (`text-[10px]`, `text-xs`, uppercase tracking where used in sections).
   - align modal and inner block colors to panel tokens (`bg-gray-900`, `border-gray-700/800`, `text-gray-400/500`).
   - reduce residual tinted/bluish appearance from modal internals.
2. Keep POI popup and map runtime untouched.

### Verification Plan
1. Run `npm run test:e2e:bdd`.
2. Run `npm test`.
3. Manual visual comparison against sidebar/header in the same screen.

## Follow-up Scope (POI Popup Icon Size + Pointer Clarity)
### Goal
Increase POI popup icon size and make the popup pointer to POI visually clearer in both:
1. in-app MapAlchemist map popup.
2. exported runtime snippet popup.

### User Review Required
1. Confirm target size increase for popup icon:
   - Proposed: from current small thumbnail to `56x56` effective visual size in popup header.
2. Confirm pointer style:
   - Proposed: darker, larger, high-contrast arrow/tip with explicit border so anchor point is easier to read on light and dark map themes.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - increase icon image container and image dimensions in POI popup markup.
   - preserve existing layout behavior for title/category/details while scaling icon block.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - increase popup icon rendering size for snippet runtime popup.
   - strengthen popup pointer visuals (size, contrast, border) and ensure it remains centered to POI anchor.
3. Keep map data/export contracts unchanged:
   - no changes to style metadata schema or POI source structure.

### Verification Plan
1. Run `npm run test:e2e:bdd`.
2. Run `npm test`.
3. Manual check:
   - open POI popup in app and snippet runtime.
   - verify icon appears noticeably larger.
   - verify pointer remains visible/clear over both bright and dark map backgrounds.

## Follow-up Scope (POI Popup Arrow Shape Refinement)
### Goal
Replace the current diamond-style POI popup pointer with a cleaner bordered triangle pointer that visually connects to the popup body and points to the POI more clearly.

### User Review Required
1. Confirm replacing current pointer shape with triangle pointer for both app popup and runtime snippet popup.
2. Confirm no changes to popup content structure besides pointer rendering.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - replace single rotated-square arrow element with two-layer triangle pointer (outer border triangle + inner fill triangle).
   - keep existing popup border color/background color tokens for visual consistency.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - apply same two-layer triangle pointer approach in exported popup HTML generator.
   - keep pointer centered and attached to popup bottom edge.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` pointer assertions for new marker/pattern.
   - `test/features/styles/services/runtimeScriptContract.test.ts` pointer contract markers for runtime script.

### Verification Plan
1. Run `npm test`.
2. Run `npm run test:e2e:bdd`.
3. Manual visual check:
   - open a POI popup in app and confirm pointer shape is triangular and clearly anchored.
   - verify exported snippet popup pointer matches app popup shape.

## Follow-up Scope (POI Popup Arrow Weight Reduction)
### Goal
Reduce visual heaviness of POI popup pointer so it looks lighter while preserving clear anchoring to the POI.

### User Review Required
1. Confirm only pointer weight should be reduced (no popup layout/content changes).
2. Confirm the same lighter pointer style must apply to both app popup and runtime snippet popup.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - reduce triangle pointer border thickness and base size.
   - reduce pointer shadow intensity.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - apply the same lighter triangle dimensions and border/shadow values.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` pointer assertions.
   - `test/features/styles/services/runtimeScriptContract.test.ts` pointer assertions.

### Verification Plan
1. Run `npm test`.
2. Run `npm run test:e2e:bdd`.
3. Manual check:
   - compare popup pointer with current version and confirm reduced boldness.
   - ensure pointer remains visually attached and readable on light/dark map themes.

## Follow-up Scope (POI Popup Arrow Visual Cleanup)
### Goal
Make the POI popup pointer visually cleaner by replacing CSS border triangles with a small stroked SVG pointer that has smoother edges and lighter stroke.

### User Review Required
1. Confirm switching pointer implementation to inline SVG in both app popup and runtime snippet popup.
2. Confirm target style is thinner outline with smoother anti-aliasing, not a large filled triangle.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - replace current triangle border/fill divs with a single inline SVG pointer.
   - use lighter stroke (`~1.5px`) and small drop shadow.
   - attach pointer to popup bottom via `top: calc(100% - 1px)` to remove visible seam.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - mirror the same SVG pointer markup and dimensions.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` assertions to target SVG marker.
   - `test/features/styles/services/runtimeScriptContract.test.ts` assertions to target SVG marker.

### Verification Plan
1. Run `npm test`.
2. Run `npm run test:e2e:bdd`.
3. Manual check:
   - verify pointer is visibly thinner and smoother in bright and dark themes.
   - verify pointer remains centered on the POI.

## Follow-up Scope (POI Popup Notch Minimization)
### Goal
Make the POI pointer feel like a subtle notch instead of a strong triangle by reducing dimensions, stroke weight, and removing shadow.

### User Review Required
1. Confirm notch should be visibly smaller and lighter across all themes.
2. Confirm this applies to both app popup and runtime snippet popup.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - pointer container: `24x14` -> `18x10`.
   - pointer stroke: `1.5` -> `1.1`.
   - remove pointer drop shadow.
   - move pointer attachment from `top: calc(100% - 1px)` to `top: calc(100% - 2px)`.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - apply same pointer geometry/stroke/shadow updates.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` SVG pointer assertions.
   - `test/features/styles/services/runtimeScriptContract.test.ts` SVG pointer assertions.

### Verification Plan
1. Run `npm test`.
2. Manual visual check on at least one light and one dark theme.

## Follow-up Scope (POI Arrow Seam Removal)
### Goal
Remove the horizontal seam between popup body and pointer while keeping pointer border weight consistent with popup border.

### User Review Required
1. Confirm pointer should use the same border thickness as popup (`2px`).
2. Confirm no visible horizontal line is allowed at popup-pointer junction.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - switch pointer SVG to separate fill + side-stroke paths (no top horizontal stroke).
   - match pointer side stroke width to popup border (`2px`).
   - add a small connector overlap to visually merge pointer with popup bottom edge.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - apply the same pointer SVG/path approach and overlap.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` for new SVG markers.
   - `test/features/styles/services/runtimeScriptContract.test.ts` for runtime markers.

### Verification Plan
1. Run `npm test`.
2. Manual visual check:
   - no horizontal seam between popup and arrow in light/dark themes.
   - pointer border weight visually matches popup border.

## Follow-up Scope (POI Arrow Junction Smoothing)
### Goal
Keep the current arrow shape, but remove visible junction artifacts where the arrow meets the popup bottom border.

### User Review Required
1. Confirm arrow geometry should remain unchanged; only the junction should be smoothed.
2. Confirm the same smoothing behavior is required in app popup and runtime snippet popup.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - add a dedicated small junction mask element at popup bottom center to hide anti-aliased seam artifacts.
   - simplify arrow SVG border to side strokes only (no top edge), with stable cap/join settings.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - mirror the same junction mask and side-stroke-only SVG structure.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` for new junction marker.
   - `test/features/styles/services/runtimeScriptContract.test.ts` for runtime junction marker.

### Verification Plan
1. Run `npm test`.
2. Manual visual check:
   - open popup on light and dark themes.
   - confirm no visible irregular line at arrow-to-popup junction.

## Follow-up Scope (POI Arrow Seam Eraser)
### Goal
Eliminate the remaining junction artifact by removing the external junction mask and using an SVG eraser stroke directly in the arrow graphic.

### User Review Required
1. Confirm keeping the current arrow shape while changing only the seam rendering method.
2. Confirm this must apply in both app popup and runtime snippet popup.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - remove `data-mapalchemist-popup-arrow-junction` external mask div.
   - keep arrow SVG and add an internal eraser line/path (`stroke: popup background`) at the top edge to cleanly hide the popup bottom border segment.
   - keep side strokes at `2px` to match popup border.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - mirror the same SVG eraser approach and remove external junction mask.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` expects eraser marker.
   - `test/features/styles/services/runtimeScriptContract.test.ts` expects runtime eraser marker and no junction marker.

### Verification Plan
1. Run `npm test`.
2. Manual visual check in bright and dark themes:
   - no flat bump or seam at the arrow junction.
   - border thickness remains consistent with popup border.

## Follow-up Scope (POI Arrow Vertex Micro-Fix)
### Goal
Remove the tiny center artifact at the popup-arrow junction by tuning SVG line-join rendering and a 1px vertical overlap.

### User Review Required
1. Confirm only micro-rendering adjustments are needed; no changes to pointer size/shape.
2. Confirm this should be applied in app popup and runtime snippet popup.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - set `shape-rendering="geometricPrecision"` on the arrow SVG.
   - set `stroke-linejoin="bevel"` on left/right arrow strokes.
   - nudge arrow container by `1px` for tighter overlap with popup border.
2. Update `public/runtime/map-alchemist-runtime.js` with the same SVG attributes and offset.
3. Update tests for new rendering markers.

### Verification Plan
1. Run `npm test`.
2. Manual check:
   - verify center junction artifact is gone/minimized on light and dark themes.

## Follow-up Scope (Unified Popup Frame + Arrow Contour)
### Goal
Eliminate seam artifacts completely by drawing popup body border and arrow border as one continuous shape instead of separate elements.

### User Review Required
1. Confirm replacing split border rendering (body border + separate arrow border) with a single contour overlay is acceptable.
2. Confirm same implementation is required for both in-app popup and exported runtime popup.

### Proposed Changes
1. Update `src/features/map/services/PopupGenerator.ts`:
   - keep popup content container with fill/background only.
   - add one absolute SVG overlay that draws the full rounded rectangle border + arrow contour in one path.
   - keep close button and content layout unchanged.
2. Update `public/runtime/map-alchemist-runtime.js`:
   - apply the same unified overlay path strategy.
3. Update tests:
   - `test/features/map/services/PopupGenerator.test.ts` assert unified contour marker/path.
   - `test/features/styles/services/runtimeScriptContract.test.ts` assert runtime unified contour marker/path.

### Verification Plan
1. Run `npm test`.
2. Manual visual check on light/dark themes:
   - no seam at arrow junction.
   - popup border thickness remains consistent around body and arrow.
   - close button and content positions remain unchanged.
