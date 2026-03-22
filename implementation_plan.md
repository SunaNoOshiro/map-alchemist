# Implementation Plan

## Phase 49 Plan: Route Invalid Custom POI Icons Through the Shared Fallback-Dot Layer (2026-03-22)

### Goal
Fix the remaining cases where an app-owned POI label is visible but its marker is missing, tiny, or inconsistently colored across zoom levels.

The target behavior is:
- if a POI has a valid custom icon image, it stays in the custom-icon symbol layer;
- if a POI icon is missing, blank, or otherwise unusable, that POI is treated exactly like a no-icon POI;
- all such POIs render through the same shared fallback-dot layer, with the same size scaling and the same `textColor` tint as the visible label.

### User Review Required
No product decision is needed.
- Recommended default: stop trying to rescue broken custom icons inside the custom-icon layer by swapping in a placeholder under the same `iconKey`.
- Instead, mark unusable custom-icon POIs as fallback-rendered so they move to the shared fallback-dot layer.

### Proposed Changes
1. Split “has icon URL” from “has usable rendered icon”.
   - Files:
     - `src/features/map/services/PoiService.ts`
     - `src/features/map/hooks/useMapLogic.ts`
   - Preserve raw metadata about whether a POI has an icon URL.
   - Add a render-state path so POIs whose generated icon asset is blank, missing, or invalid are excluded from the custom-icon symbol layer and included in the fallback-dot symbol layer.

2. Remove the custom-layer placeholder-dot rescue path.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
   - Stop registering fallback dots under the original `iconKey` for invalid custom icons.
   - Keep one shared fallback-dot image and one shared fallback-dot sizing behavior, so all no-icon/invalid-icon POIs look identical at every zoom.

3. Keep popup behavior unchanged while map rendering becomes consistent.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
   - Popup can still show the default pin when a generated icon asset is unusable.
   - This phase is only about map marker parity and consistency.

4. Add regressions for invalid custom-icon parity.
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/features/map/services/PoiService.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Cover:
     - valid custom icon stays in custom-icon layer,
     - blank or missing custom icon uses the shared fallback-dot layer,
     - invalid-icon fallback dot matches label color,
     - invalid-icon fallback dot keeps the same size behavior as other fallback dots.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PoiService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 44 Plan: Strict Allowlist-Only Symbol Visibility for Non-App Layers (2026-03-21)

### Goal
Eliminate the remaining duplicate or stray business labels that still survive after Phase 43 by switching from heuristic hiding to an explicit symbol-layer allowlist.

The target behavior is:
- app-owned POI labels/icons/dots remain visible;
- only essential map-context symbol layers remain visible:
  - roads / transportation names,
  - place / settlement / admin labels,
  - housenumbers / address-like labels;
- every other non-app symbol layer is hidden, even if it does not expose a normal `text-field`, uses a strange source, or is produced by theme/style-specific compilation.

### User Review Required
No product decision is needed.
- Recommended default: for non-app `symbol` layers, visibility should be `none` unless the layer matches the explicit context allowlist.

### Proposed Changes
1. Convert base symbol suppression to a strict allowlist-only rule.
   - Files:
     - `src/features/map/services/PoiService.ts`
   - Remove the remaining heuristic fallback that still lets some non-app symbol layers survive.
   - For any non-app `symbol` layer:
     - keep it only if it clearly matches the context allowlist,
     - otherwise hide it.

2. Preserve only context labels we explicitly want.
   - Files:
     - `src/features/map/services/PoiService.ts`
   - Continue allowing:
     - roads / transportation names,
     - places / settlements / admin hierarchy,
     - addresses / housenumbers.
   - Hide everything else in non-app symbol layers, including theme-colored business labels that visually mimic app POIs.

3. Add regressions for duplicate label leakage.
   - Files:
     - `test/features/map/services/PoiService.test.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Cover layers that:
     - are symbol layers,
     - are not app-owned,
     - do not match the explicit context allowlist,
     - and must always be hidden even if they do not look like classic `poi_label` layers.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 43 Plan: Remove the Remaining Non-App Symbol Layer Escape Hatch (2026-03-21)

### Goal
Eliminate the last visible label-only POIs that still survive after Phase 42 by closing the current escape hatch for non-app symbol layers that:
- are not owned by the app,
- do not have a `source-layer`,
- and do not use one of the currently recognized basemap source names.

The target behavior is:
- every app-owned visible POI label still has either a custom icon or a fallback dot;
- non-app business/venue labels like the ones in the screenshots (`Rickshaw Stop`, `Nakama Sushi`, `Zuni Cafe`) are suppressed even if they come from style-specific or unfamiliar symbol layers.

### User Review Required
No product decision is needed.
- Recommended default: stop using `known base source` as a prerequisite for hiding non-app POI-like symbol layers.
- Keep an explicit allowlist only for context labels we want to preserve:
  - roads / transportation names
  - place / settlement / admin labels
  - housenumbers / address-like labels

### Proposed Changes
1. Remove the current non-app symbol-layer escape hatch.
   - Files:
     - `src/features/map/services/PoiService.ts`
   - Update `shouldHideBaseSymbolLayer(...)` so that non-app symbol layers are evaluated by:
     - app-layer ownership,
     - explicit context allowlist,
     - POI/business/venue heuristics,
     - but not exempted just because they lack `source-layer` or use an unfamiliar `source`.

2. Preserve only explicit context labels.
   - Files:
     - `src/features/map/services/PoiService.ts`
   - Keep roads, places, admin hierarchy, and addresses visible.
   - Hide remaining non-app business/venue symbol labels, even if they are theme-compiled or style-specific.

3. Add regressions for unfamiliar non-app symbol layers.
   - Files:
     - `test/features/map/services/PoiService.test.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Cover symbol layers that:
     - are not app POI layers,
     - do not use `places`,
     - may omit `source-layer`,
     - still must be hidden unless they clearly match the context allowlist.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 42 Plan: Suppress All Non-App Symbol Labels Except Explicit Context Allowlist (2026-03-21)

### Goal
Eliminate the remaining stray labels that still survive after Phase 40 by moving from a partial base-label denylist to a strict non-app symbol allowlist.

The target behavior is:
- app-owned POI labels/icons/dots remain visible;
- map context labels like roads, places, admin names, and housenumbers remain visible;
- every other non-app symbol label is hidden, regardless of the source name or style-specific layer naming.

### User Review Required
No product decision is needed.
- Recommended default: for any symbol layer not owned by the app and not matching the explicit context allowlist, set visibility to `none`.

### Proposed Changes
1. Make base-label suppression source-agnostic and allowlist-first.
   - Files:
     - `src/features/map/services/PoiService.ts`
   - Stop relying on known base source names as the main gate.
   - Preserve only explicit context labels:
     - `place`
     - road/transportation name labels
     - housenumbers / address-like labels
     - admin/place hierarchy labels
   - Hide every other non-app symbol layer.

2. Keep the suppression re-applied across style churn.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
   - Continue re-running the hide pass on `styledata`, but now with the stricter source-agnostic rule.

3. Add regression coverage for unknown-source stray symbol labels.
   - Files:
     - `test/features/map/services/PoiService.test.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Cover symbol layers that:
     - do not use our `places` source,
     - do not match the context allowlist,
     - still must be hidden even if their `source` name is unfamiliar.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 41 Plan: Keep Custom POI Labels and Icons in the Same Placement Contract (2026-03-21)

### Goal
Remove the remaining cases where an app-controlled custom POI label is visible but its custom icon is missing.

The target behavior is:
- if a POI is rendered through the custom-icon symbol layer and its name is visible, the custom icon is visible too;
- no app-controlled custom label should survive as text-only because of symbol-collision rules.

### User Review Required
No product decision is needed.
- Recommended default: make custom-icon POI layers use the same placement contract as fallback-dot POI layers, so label and icon are placed together instead of allowing text to outlive the icon.

### Proposed Changes
1. Tighten custom-icon symbol layer layout so text cannot render without the icon.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
   - Update the custom POI symbol layer to keep icon/text placement coupled.
   - Preserve current collision behavior as much as possible, but prevent text-only survivors.

2. Add regressions for custom-icon parity.
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Cover that:
     - custom-icon POI layers do not allow visible text without visible icon;
     - fallback-dot layers still keep their existing parity behavior.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 40 Plan: Hide Base POI/Business Labels via Safe Allowlist (2026-03-21)

### Goal
Eliminate the remaining stray labels that still appear without an app-controlled icon or fallback dot at closer zoom levels by tightening what base-map symbol labels are allowed to stay visible.

The target behavior is:
- app-controlled POIs keep the existing rule: visible name implies custom icon or fallback dot;
- base-map road/place/admin labels remain visible;
- base-map business/venue/POI labels are suppressed so they cannot visually mix with the app POI system.

### User Review Required
No product decision is needed.
- Recommended default: switch from the current broad "hide POI-like layers" heuristic to a stricter allowlist for base symbol labels:
  - keep road, place, admin, address-style labels;
  - hide other base symbol layers that behave like business/venue/POI labels.

### Proposed Changes
1. Tighten base symbol-layer suppression with an allowlist-first rule.
   - Files:
     - `src/features/map/services/PoiService.ts`
     - `src/features/map/hooks/useMapLogic.ts`
   - Replace the current heuristic-only filtering with a safer allowlist approach for symbol layers.
   - Explicitly preserve map context labels such as roads, places, admin/place names, and addresses.
   - Hide remaining base symbol layers that act like POI/business/venue labels.

2. Reapply suppression after late style updates without changing map view.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
   - Keep the existing `styledata` re-hide path, but make it work with the stricter allowlist.
   - Ensure this does not trigger POI refresh or camera reset.

3. Add regressions for leaked base labels.
   - Files:
     - `test/features/map/services/PoiService.test.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Cover:
     - road/place/admin labels are preserved;
     - generic business/venue symbol labels are hidden;
     - visible app POI labels still open popups and keep icon-or-dot parity.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 39 Plan: Remove Label-Only POI Strays and Guarantee Icon-or-Dot Parity (2026-03-21)

### Goal
Fix the remaining cases where a POI name is visible on the map without either:
- its custom icon image, or
- the fallback colored dot.

This includes distinguishing between:
- genuine app-rendered POI labels missing their visual marker, and
- base-style POI labels that were not fully suppressed.

### User Review Required
No product decision is needed.
- Recommended default: any POI label owned by the app must render with either a custom icon or a same-color fallback dot, and any leftover base-style POI labels should be removed so they do not visually mix with the app POI system.

### Proposed Changes
1. Audit whether the stray names come from the app POI layers or from base-map POI layers.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiService.ts`
     - `src/features/map/services/PaletteService.ts`
   - Verify which rendered layers are producing the labels seen in the screenshot.
   - If any base-style POI symbol/text layers are still visible, extend the hiding logic so only the app-controlled POI presentation remains.

2. Guarantee icon-or-dot parity for every app-rendered visible POI label.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiService.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
   - Ensure that if a POI title is rendered from the app’s visual layers:
     - either a custom icon is present,
     - or the fallback dot is rendered alongside it.
   - Remove any branch-specific mismatch where label placement can occur without its corresponding icon/dot representation.

3. Add regressions for “visible name implies icon or dot”.
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/features/map/services/PoiService.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add coverage that visible custom POI labels do not appear marker-less.
   - Add coverage that base-map POI labels are not leaking through if the app is expected to fully own POI rendering.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PoiService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 38 Plan: Popup Header Taxonomy Hierarchy and Duplicate Summary Cleanup (2026-03-21)

### Goal
Refine popup header taxonomy presentation so it reads more naturally and avoids duplicate content:
- show the POI title first,
- show the subcategory as the primary taxonomy text under the title,
- move the broader category into a chip/tag below the subcategory,
- suppress the redundant first summary/body line when it only repeats the same subcategory text already shown in the header.

### User Review Required
Yes, for the visual hierarchy.
- Recommended default: `Title` -> `Subcategory text` -> `Category chip`.
- Example:
  - `Starbucks`
  - `Cafe`
  - `[Food & Drink]`

### Proposed Changes
1. Rework popup header taxonomy row.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
   - Replace the current inline `category chip + subcategory` row with:
     - subcategory as plain secondary text immediately below the title,
     - category chip beneath it.
   - Keep canonical category color on the chip.

2. Remove obvious duplicate summary/body content.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
   - If the first descriptive line would only restate the same subcategory/category already shown in the header, omit it.
   - Preserve real summaries, addresses, and enriched descriptions.

3. Keep layout compact and theme-safe.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
   - Ensure the new hierarchy still looks good for bright, warm, and muted popup themes.
   - Avoid increasing header height more than necessary.

### Verification Plan
1. `npm test -- --run test/features/map/services/PopupGenerator.test.ts`
2. Manual spot check on a few popup cases:
   - business POI (`Cafe`, `Bar`, `Fast Food`)
   - civic/public POI (`Bus Stop`, `Post Office`)
   - attractions/nature POI (`Monument`, `Park`)

## Phase 37 Plan: Popup Category Tag Styling with Theme-Safe Contrast (2026-03-21)

### Goal
Refine popup category presentation so it looks good across all active map themes and category colors:
- keep category signaling visually consistent with `Places`,
- avoid hard-to-read raw text colors on bright or muted popup backgrounds,
- evaluate a tag/chip treatment for the popup category label instead of plain colored text.

### User Review Required
Yes, one small UX choice:
- Recommended default: render the popup category as a compact category tag/chip, not plain text.
- Reason: a tag is more robust across bright yellows, beige themes, muted themes, and highly saturated category colors than bare uppercase text.

### Proposed Changes
1. Convert popup category accent from plain text to a tag/chip treatment.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
   - Keep the popup frame/background unchanged.
   - Replace the current raw colored category label with a compact chip using:
     - category-colored border,
     - soft tinted fill,
     - contrast-safe text.

2. Normalize category color usage across light and warm popup themes.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/services/PoiService.ts`
     - `src/shared/taxonomy/poiTaxonomy.ts`
   - Reuse canonical category colors, but clamp presentation so highly bright colors remain readable.
   - Ensure icon-frame accent and category chip belong to the same category color family.

3. Add regression coverage for multiple theme/background combinations.
   - Files:
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/features/map/services/PoiService.test.ts`
   - Cover at least:
     - bright yellow popup background,
     - warm beige popup background,
     - dark-ish text theme,
     - saturated category colors like blue, purple, green, orange.

### Verification Plan
1. `npm test -- --run test/features/map/services/PopupGenerator.test.ts test/features/map/services/PoiService.test.ts`
2. Manual spot check on at least 3 visually distinct saved themes.

## Phase 36 Plan: Canonical Category Color in POI Popup (2026-03-21)

### Goal
Make the POI popup reflect the same canonical category color system already used in `Places` result cards and taxonomy chips, so the popup visually matches the POI's category grouping instead of using only the generic popup accent.

### User Review Required
No product decision is needed.
- Recommended default: keep the overall popup frame/background theme unchanged, but apply the canonical category color to category-specific UI accents inside the popup.

### Proposed Changes
1. Identify the popup elements that should use category color instead of neutral popup styling.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/services/PoiService.ts`
     - `src/shared/taxonomy/poiTaxonomy.ts`
   - Reuse the same canonical group/category color source that powers `Places` chips and map label coloring.
   - Keep popup readability and contrast intact.

2. Thread canonical category color into popup rendering.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/types.ts`
   - Ensure popup category label/accent uses the effective canonical category color already attached to the POI (`textColor` or the same resolved category token).
   - Avoid introducing a separate popup-only color mapping that could drift from `Places`.

3. Add regressions for popup/category color consistency.
   - Files:
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/features/map/services/PoiService.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Verify a POI card and its popup use the same category color family.
   - Verify fallback/no-custom-icon POIs still keep the correct popup category color.

### Verification Plan
1. `npm test -- --run test/features/map/services/PopupGenerator.test.ts test/features/map/services/PoiService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|POI popup uses canonical category color"`

## Phase 35 Plan: Label-Coupled Fallback Dots with Correct Per-Category Color Matching (2026-03-21)

### Goal
Fix the remaining fallback-dot rendering inconsistencies so that:
- a fallback dot appears only when a POI name is actually visible on the map,
- every fallback dot uses the same effective color as that POI's rendered name/category styling,
- the behavior works consistently across all POI category branches, not only a subset.

### User Review Required
No product decision is needed.
- Recommended default: keep fallback dots only for POIs without a usable custom icon image, but make them fully label-coupled and color-derived from the actual rendered text style rather than a branch-level default.

### Proposed Changes
1. Audit the fallback symbol-layer construction per category branch.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiService.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Verify every canonical POI category branch gets both:
     - a visible label path,
     - a fallback-dot path when `hasCustomIconImage !== true`.
   - Remove any branch-specific mismatch where the name can render but the dot layer/filter/image does not.

2. Make fallback dots derive color from the same effective text color as the rendered POI label.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiService.ts`
     - `test/features/map/services/PoiService.test.ts`
   - Ensure fallback-dot imagery or per-feature styling uses the same color source as the POI label (`textColor`), not a stale or category-default color that can drift.
   - Keep halo/border treatment unchanged unless needed for contrast.

3. Tighten the "dot only when label is visible" behavior.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Make sure the fallback dot lives in the same symbol-placement flow as the name so it does not appear independently.
   - Add regression coverage that a no-icon POI with a visible name gets a matching dot, while a non-visible label does not produce a stray fallback point.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PoiService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|POI fallback dot opens popup"`

## Phase 34 Plan: Pan/Zoom Performance Stabilization for POI Rendering and Sidebar Sync (2026-03-21)

### Goal
Remove the remaining performance degradation during map zooming and panning by making viewport movement cheaper on both the map and UI sides:
- avoid expensive POI recollection when the viewport change does not actually require new POI data,
- avoid full loaded-results/sidebar recomputation during every movement cycle,
- keep icon/label rendering responsive while the camera changes.

### User Review Required
No product decision is needed.
- Recommended default: keep current behavior and feature set, but make pan/zoom updates incremental, movement-aware, and less eager.

### Proposed Changes
1. Add viewport-delta guards before POI recollection.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiRegistryService.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Track the last collected viewport signature (zoom bucket + bounds snapshot).
   - Skip `refreshPoisFromViewport(...)` when a move/zoom does not materially change the POI collection window.
   - Keep initial load and meaningful zoom transitions intact.

2. Reduce same-frame work during camera movement.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Make sidebar/result snapshot publishing lazier after movement settles.
   - Avoid any non-essential loaded-POI result recomputation while the map is still repositioning.
   - Preserve visible correctness after movement finishes.

3. Prevent repeated expensive map-side symbol work where possible.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Audit remaining zoom/move listeners that may trigger duplicate refreshes or style application.
   - Ensure pan/zoom does not cause unnecessary POI source writes or layer reconfiguration when nothing structural changed.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|POIs should appear without zooming after load"`

## Phase 33 Plan: Layer-Specific POI Hover/Click and Zoom-Time Interaction Performance (2026-03-21)

### Goal
Fix the remaining visible-POI interaction regressions introduced by fallback label/dot rendering:
- hovering a visible POI name should reliably show a pointer,
- clicking a visible POI name or fallback dot should always open that exact visible POI, not a hidden/overlapping one,
- zooming should no longer incur extra interaction jank from global per-mousemove POI hit-testing.

### User Review Required
No product decision is needed.
- Recommended default: stop doing global `queryRenderedFeatures(...)` hit-tests on every mousemove/click for visible POI labels and fallback dots, and instead bind interaction handlers directly to the concrete rendered POI visual layers.

### Proposed Changes
1. Replace generic visual POI hit-testing with layer-specific handlers.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Remove the generic `queryVisiblePoiHitsAtPoint(...)` + `onVisualPoiClick(...)` + `updatePoiCursor(...)` path for visible label/dot interactions.
   - Register `click`, `mouseenter`, and `mouseleave` handlers directly on the rendered custom-icon layers and fallback-dot layers for each POI category branch.
   - Use the `event.features` payload from the actual rendered layer click so the popup always opens the precise visible POI the user clicked.

2. Remove redundant legacy hover listeners that can fight the new pointer logic.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
   - Delete the old raw `mouseenter` / `mouseleave` listeners on `unclustered-point` that still mutate the canvas cursor separately.
   - Keep listener registration/cleanup fully symmetric through the controller abstraction to avoid stale handlers across rerenders.

3. Add regressions for visible-label interactions and cheaper hover behavior.
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Verify visible-label/fallback-layer clicks do not fall back to another hidden POI.
   - Verify pointer affordance is applied on visible POI labels/dots.
   - Verify interaction changes do not trigger a new POI data refresh during zoom/hover-only flows.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PoiService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features"`

## Phase 45 Plan: Exact Base-Label Allowlist for Context Layers Only (2026-03-21)

### Goal
Eliminate the remaining orange name-only labels that still leak through from non-app symbol layers by replacing the current broad regex allowlist with an exact allowlist for true context labels only.

### User Review Required
Yes.
- This intentionally tightens which base-map labels survive.
- We want to keep only context labels such as roads, admin/place hierarchy, and addresses.
- Business/venue-like labels should disappear entirely unless they are rendered by the app-owned POI system.

### Proposed Changes
1. Replace the broad context-label regex with an exact allowlist.
   - File: `src/features/map/services/PoiService.ts`
   - Narrow `isAllowedBaseContextLabelLayer(...)` so it only preserves explicit context label sources/patterns instead of any layer whose blob happens to match broad street/place words.
   - Keep app-owned POI layers untouched.

2. Add deny-by-default protection for unknown non-app symbol labels.
   - File: `src/features/map/services/PoiService.ts`
   - Treat non-app symbol layers as hidden unless they match the exact context allowlist.
   - This should stop theme-colored business labels like restaurant names from surviving without icon/dot pairing.

3. Add regressions for the currently leaking cases.
   - File: `test/features/map/services/PoiService.test.ts`
   - Cover business-like symbol layers whose ids/text look like venue labels but previously slipped through the broad regex path.
   - Preserve expected visibility for roads, addresses, and place/admin labels.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 46 Plan: Replace Transparent Missing POI Icons with Visible Dot Fallback (2026-03-21)

### Goal
Fix the remaining "label without icon or dot" cases by removing the transparent `styleimagemissing` loophole for POI icon ids. If a POI icon image is missing at render time, the map should show a visible fallback dot instead of silently rendering an invisible icon.

### User Review Required
Yes.
- This changes the missing-image behavior for POI icon ids only.
- Non-POI map assets should keep their existing behavior unless explicitly app-owned.

### Proposed Changes
1. Make `styleimagemissing` POI-aware.
   - File: `src/features/map/services/MapLibreAdapter.ts`
   - Stop registering a transparent 1x1 placeholder for app POI icon ids.
   - For missing POI icon ids, register a visible SDF fallback dot instead, so text never renders without a visible marker.

2. Keep the icon loading upgrade path intact.
   - Files:
     - `src/features/map/services/MapLibreAdapter.ts`
     - `src/features/map/hooks/useMapLogic.ts`
   - Ensure the real icon still replaces the fallback dot once the image finishes loading.

3. Add regressions for the missing-icon path.
   - File: `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Verify POI icon ids never settle into a transparent placeholder path.
   - Verify the fallback dot image is used when a POI icon is missing.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PoiService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 47 Plan: Keep Fallback Dot When a Generated POI Icon Asset Is Blank or Fully Transparent (2026-03-21)

### Goal
Fix the remaining cases where app-owned POI labels are visible but their custom icon is visually missing because the generated icon image exists as a URL yet resolves to a blank/fully transparent bitmap.

### User Review Required
Yes.
- This changes how generated/custom icon assets are accepted into the runtime sprite.
- Invalid or blank icon images should no longer replace the visible fallback dot.

### Proposed Changes
1. Validate loaded icon pixels before replacing the fallback dot.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - After resizing the loaded icon into `ImageData`, inspect alpha coverage.
   - If the icon is fully transparent or below a minimal visible-alpha threshold, treat it as invalid and keep the placeholder dot for that icon key.

2. Track validated icon availability separately from raw imageUrl presence.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PopupGenerator.ts`
   - Avoid using a blank generated icon in popup header or map symbol rendering once it fails the validation gate.
   - Continue using the real icon normally when the bitmap is valid.

3. Add regressions for transparent icon assets.
   - File: `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Cover:
     - blank icon image keeps fallback dot,
     - valid icon replaces fallback dot,
     - labels do not render with an invisible custom icon.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PopupGenerator.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Visible POI labels always show an icon or fallback dot"`

## Phase 48 Plan: Color-Tinted SDF Fallback for Blank Custom POI Icons (2026-03-22)

### Goal
Make blank or missing generated POI icons fall back to a visible marker that uses the same effective color as the rendered POI label, instead of a hard-coded white dot that can disappear against light backgrounds.

### Proposed Changes
1. Re-register invalid custom POI icon placeholders as SDF markers.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - When a generated icon asset is blank/transparent or fails to load, replace its `iconKey` image with a monochrome SDF dot so the existing `icon-color` expression can tint it from `textColor`.

2. Keep popup fallback behavior unchanged.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Popup should still fall back to the default pin for invalid POI icon keys instead of using the blank asset.

3. Refresh targeted regressions.
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/features/map/services/PopupGenerator.test.ts`
   - Verify invalid custom icon paths still preserve visible marker fallback behavior and popup icon fallback behavior.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PopupGenerator.test.ts`

## Phase 31 Plan: Show-on-Map Without Symbol Re-Placement Jank (2026-03-20)

### Goal
Remove the remaining "everything redraws" feeling when toggling `Show on map`, which likely now comes from MapLibre re-running symbol placement for the full POI layer even though React-side churn has already been reduced.

### User Review Required
No product decision is needed.
- Recommended default: keep the current sidebar behavior, but change the map-side visibility path so toggles stop feeling like a full repaint.

### Proposed Changes
1. Move `Show on map` away from the heavy symbol-filter path.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiRegistryService.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Investigate and replace the current full-layer `setFilter(...)` visibility toggle with a lighter map-side mechanism.
   - Preferred path: drive visibility through paint/layout state that avoids rebuilding symbol placement for the whole POI set.
   - Fallback path: split POIs into smaller visibility buckets so category/subcategory toggles touch only the affected branch instead of the entire `unclustered-point` layer.

2. Keep sidebar updates visually stable while the map visibility settles.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Preserve immediate checkbox/eye feedback, but avoid any extra loaded-results churn tied to the same toggle.
   - Ensure `Show on map` counts and states remain stable if the map-side visibility path becomes asynchronous or staged.

3. Add a regression specifically for "visibility toggle without heavy redraw side effects".
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Verify visibility toggles no longer rebuild the `places` source or reinitialize the map.
   - Add a focused BDD path that rapidly toggles category visibility and checks that the map remains responsive and synchronized with `Places`/`Icons`.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Hiding and showing POI categories on the map|Syncing map visibility controls between Icons and Places"`

## Phase 30 Plan: Show-on-Map Visibility Without Heavy Repaint (2026-03-20)

### Goal
Make `Show on map` feel like a lightweight visibility toggle instead of a full redraw by:
- keeping the map on the cheap `layer filter` path instead of rebuilding POI source data,
- deferring expensive sidebar recomputation (`loaded POIs`, taxonomy counts, results badges) so it does not compete with the same interaction frame.

### User Review Required
No product decision is needed.
- Recommended default: apply map visibility immediately, then let counts/results settle a fraction later if needed.

### Proposed Changes
1. Decouple map visibility updates from heavy sidebar publishing.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
   - Keep `setFilter(...)` immediate for the map layer.
   - Replace same-tick POI snapshot publishing with a short scheduled publish so the UI does not recalculate thousands of POIs during the same click frame.
   - Add a regression test that visibility changes do not rebuild the `places` source.

2. Defer `Places` panel derivations during map visibility changes.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Use deferred visibility filters for counts, loaded-only taxonomy options, and result badges, while keeping the actual checkbox/eye states immediate.
   - Preserve the already-approved behavior where category/subcategory menus only show options that are currently available on the map.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Hiding and showing POI categories on the map|Syncing map visibility controls between Icons and Places"`

## Phase 29 Plan: Popup Close Unclipping and One-Shot Remix Focus (2026-03-16)

### Goal
Resolve the two remaining interaction regressions:
- keep the external popup close button fully visible instead of clipping at the top-right edge,
- make popup-driven `Remix Icon` act as a one-shot deep-link into the icon editor without repeatedly snapping the list back to the originally selected icon while the user browses.

### User Review Required
No additional product decision is needed.
- Recommended default: keep the close button outside the popup vertically, but stop pushing it outside horizontally.
- Recommended default: remix focus should auto-scroll exactly once when opened from popup, then fully yield control to manual user scrolling.

### Proposed Changes
1. Refine popup close positioning.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
   - Move the close button so it remains outside the popup frame on the top edge while staying horizontally within the popup width.

2. Make remix focus strictly one-shot.
   - Files:
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `test/shared/components/sidebar/RightSidebar.test.tsx`
     - `test/e2e/features/RemixSidebar.feature`
     - `test/e2e/steps/RemixSidebar.steps.ts`
   - Stop scheduling non-remix auto-scrolls for any merely selected icon.
   - Preserve the initial popup remix jump, but once applied, leave list scrolling entirely under user control unless a new remix request arrives.

### Verification Plan
1. `npm test -- --run test/shared/components/sidebar/RightSidebar.test.tsx test/features/map/services/PopupGenerator.test.ts`
2. `npm run test:e2e:bdd -- --grep "Desktop remix focus aligns the selected icon to the top and allows scrolling|Selecting another icon after remix focus should replace the selected editor|Keeping popup close accessible on mobile"`

## Phase 28 Plan: Sidebar Highlight Normalization, Loaded-Only Places Taxonomy, and Safe Popup Close Placement (2026-03-16)

### Goal
Resolve the last visible mismatches between `Places`, `Icons`, and the rest of the app by:
- making selected/highlighted states in `Places` and `Icons` match the app’s existing panel-card language instead of using a visually different accent treatment,
- limiting `Places` category/subcategory dropdowns to taxonomy options that are currently present in loaded POIs on the map,
- fixing popup close placement so the external close button is never clipped by the viewport edge.

### User Review Required
1. Highlight style normalization:
   - Recommended default: selected tabs, selected result cards, active filter pills, and visible-state emphasis in `Places` should reuse the same subdued panel highlight language already used by the established left-sidebar cards, not a brighter custom accent shell.
   - Recommendation: keep color as a secondary accent, but let the base border/background treatment follow the existing sidebar design system.
2. Loaded-only taxonomy in `Places`:
   - Recommended default: `Places` category and subcategory filters should list only options that exist in the currently loaded POI set.
   - Recommendation: the full taxonomy universe stays in `Icons`, where it belongs for icon browsing and remix/editing.
3. Popup close placement:
   - Recommended default: keep the popup close control outside the popup frame, but clamp/re-anchor it so it always remains fully visible inside the map viewport and never gets cut off by the top/right edge.

### Proposed Changes
1. Normalize selection/highlight styling in `Places` and `Icons`.
   - Files:
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/shared/components/sidebar/RightSidebar.test.tsx`
   - Audit current selected tab, selected result card, active metadata filter, and `Show on map` emphasis styles.
   - Replace the brighter custom highlight treatment with the same border/background/spacing language already used by existing sidebar cards and tabs.
   - Keep taxonomy colors as labels/chips where useful, but avoid making the whole control feel like a different component family.

2. Restrict `Places` taxonomy dropdowns to currently loaded options only.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Build category options strictly from the currently loaded POI summary.
   - Build subcategory options strictly from the currently loaded POIs within the selected category scope.
   - Ensure stale selections are cleared if the currently selected taxonomy value no longer exists in the loaded set.

3. Keep the popup close button fully visible.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Adjust popup close anchor offsets and viewport-fit math so the external close button remains fully visible.
   - Verify it still stays reachable on mobile and desktop without clipping when popup opens near edges.

### Verification Plan
1. `npm test -- --run test/shared/components/sidebar/right/PoiSearchPanel.test.tsx test/shared/components/sidebar/RightSidebar.test.tsx test/features/map/services/PopupGenerator.test.ts test/features/map/services/PoiSearchService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Searching loaded POIs by name and category|Filtering loaded POIs by metadata|Verifying Remix functionality|Keeping popup close accessible on mobile|Switching styles and interacting with map features"`
3. Manual sanity check:
   - verify selected `Places` tab, selected result card, and active metadata filters feel visually aligned with the rest of the sidebar cards,
   - verify `Places` category/subcategory dropdowns contain only currently loaded map options,
   - open a popup near the top-right edge and confirm the outside close button is fully visible and clickable.

## Phase 27 Plan: Dropdown Lifecycle Cleanup, Remix Focus Release, and Places Section Consistency (2026-03-16)

### Goal
Resolve the remaining interaction bugs and visual inconsistencies in `Places` and popup-driven `Remix` flow by:
- making taxonomy dropdowns close predictably when the user performs other actions,
- making `Show on map` visually match the same section-card language as the rest of the sidebar,
- releasing popup-driven remix focus as soon as the user intentionally selects a different icon,
- tightening the `Has photo / Has website / Open now` control styling so they read like the same UI family as the rest of the app,
- restricting `Places` category/subcategory filters to options that are currently available in the loaded map POI set, while leaving the full taxonomy catalog to the `Icons` panel.

### User Review Required
1. Dropdown close behavior:
   - Recommended default: category/subcategory dropdowns should close not only on outside click, but also when the user clicks another control inside `Places` such as metadata filters, `Show on map` toggle, result cards, or another dropdown trigger.
   - Result: the panel behaves like a single coherent form, not a sticky overlay.
2. `Show on map` visual language:
   - Recommended default: `Show on map` should use the same section rhythm as the other panels, with cleaner header spacing, matching chevron affordance, and the same subdued copy treatment as established sections.
   - Result: it reads as part of the same app, not a different mini-widget.
3. Remix focus release:
   - Recommended default: clicking `Remix Icon` from popup should only seed the first selected icon; once the user clicks another icon item manually, remix focus should be cleared immediately and all auto-scroll/auto-realign behavior must stop.
   - Result: popup remix acts as a deep-link, not a lock that keeps snapping back to the old icon.
4. Metadata filter controls:
   - Recommended default: `Has photo`, `Has website`, and `Open now` should use the same field/control visual family as the rest of the sidebar, instead of feeling like a separate button system.
   - Result: filters read as sibling controls to dropdowns and other sidebar inputs.
5. Loaded-only taxonomy options in `Places`:
   - Recommended default: the `Places` category and subcategory dropdowns should expose only the taxonomy options that currently exist in the loaded POI set for the current map/session.
   - Recommendation: the full “all possible categories/subcategories” universe should remain an `Icons` concern, not a `Places` filter concern.
   - Result: the `Places` filters stay relevant to what the user can actually search right now.

### Proposed Changes
1. Fix dropdown lifecycle so menus close on other `Places` interactions.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/common/SidebarSelectMenu.tsx`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Centralize a small `closeOpenMenus()` helper in `Places`.
   - Call it when clicking metadata filters, resetting filters, toggling `Show on map`, selecting results, or opening the other taxonomy dropdown.
   - Keep explicit selection behavior intact while preventing menus from lingering over unrelated actions.

2. Make `Show on map` visually match the rest of the sidebar sections.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Align header spacing, panel padding, chevron placement, muted helper copy, and action row spacing with the same section treatment already used in other panels.
   - Keep collapsed-by-default behavior, but make the expanded section feel like the same design system rather than a custom block.

3. Release remix focus as soon as the user manually changes icon selection.
   - Files:
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/IconItem.tsx`
     - `src/shared/layouts/MainLayout.tsx`
     - `test/e2e/features/RemixSidebar.feature`
     - `test/e2e/steps/RemixSidebar.steps.ts`
   - Distinguish programmatic selection from manual icon selection.
   - On any deliberate icon click, clear `remixFocusCategory` immediately before applying the new selection.
   - Prevent the current selected remix item from reasserting itself via auto-scroll or group-collapse logic after the user has chosen another icon.

4. Bring metadata filter controls into the same control family.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Restyle `Has photo`, `Has website`, and `Open now` so their sizing, typography, padding, and active state feel like sibling sidebar controls rather than oversized custom buttons.
   - Preserve their current semantics and test IDs.

5. Limit `Places` taxonomy dropdowns to currently available loaded options.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Build category options only from currently loaded POIs that survive the relevant parent scope.
   - Build subcategory options only from the currently loaded POIs within the selected category scope.
   - Keep `All categories` / `All subcategories`, but do not leak the full icon taxonomy catalog into the `Places` dropdowns.

### Verification Plan
1. `npm test -- --run test/shared/components/sidebar/right/PoiSearchPanel.test.tsx test/shared/components/sidebar/RightSidebar.test.tsx test/features/map/services/PoiSearchService.test.ts test/features/map/services/poiIconResolver.test.ts`
2. `npm run test:e2e:bdd -- --grep "Searching loaded POIs by name and category|Filtering loaded POIs by metadata|Verifying Remix functionality|Desktop remix focus aligns the selected icon to the top and allows scrolling|Selecting another icon after remix focus should replace the selected editor"`
3. Manual sanity check:
   - open category dropdown, then click `Has photo` or `Show on map` and confirm the dropdown closes,
   - open subcategory dropdown, then click a result card and confirm the dropdown closes,
   - open popup, click `Remix Icon`, then click another icon item and confirm it becomes the active editor without snapping back or scrolling back,
   - verify `Show on map` header/copy/actions visually match the sidebar’s existing section rhythm,
   - verify `Has photo / Has website / Open now`, `Show on map` checkboxes, and selected result card all feel visually consistent with the same sidebar control family,
   - verify `Places` category/subcategory dropdowns list only options that are currently available in the loaded POI set.

## Phase 26 Plan: Taxonomy Readability and Places/Icon Panel Visual Simplification (2026-03-16)

### Goal
Resolve the remaining readability and design-system mismatches in `Places` and `Icons` by:
- making category and subcategory names fully readable in dropdowns and visibility rows instead of wrapping into awkward split words,
- reorganizing result-card taxonomy so the colored category label sits below the title and reads more clearly,
- simplifying the `Icons` panel by removing POI count noise that does not help icon browsing,
- aligning `Places` controls and result cards with the same design tokens, spacing, radii, colors, and dropdown field language already used across the existing sidebar panels.

### User Review Required
1. Dropdown readability:
   - Recommended default: category and subcategory option labels should use the full available row width and never break a single label into stacked word fragments like `Shoppi / ng`.
   - Recommendation: if space is still tight, preserve the whole label on one line with gentle truncation at the tail rather than breaking the word itself.
2. Result card taxonomy placement:
   - Recommended default: move the colored category chip below the POI title, with the subcategory label beside or beneath it.
   - Result: the title remains the main focal point, and taxonomy becomes a secondary line that is easier to scan consistently.
3. `Icons` panel counts:
   - Recommended default: remove POI counts from the `Icons` panel entirely.
   - Recommendation: keep the focus there on icon browsing/editing only, while count semantics remain a `Places` concern.
4. Design-system parity:
   - Recommended default: reuse the same visual language as the existing sidebar panels and form controls instead of introducing a near-match variant.
   - Recommendation: dropdowns, field shells, section spacing, labels, muted copy, borders, and chips should all derive from the same tokens/patterns already used in panels like `AI Provider`, `Text Model`, and other established sidebar sections.

### Proposed Changes
1. Fix taxonomy control readability in `Places`.
   - Files:
     - `src/shared/components/sidebar/common/SidebarSelectMenu.tsx`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Make dropdown rows use the full width for labels and count columns without forced word splitting.
   - Prevent category/subcategory labels from wrapping mid-word in both select menus and `Show on map` rows.
   - Keep count/value columns visually aligned without squeezing the label into unreadable fragments.
   - Reuse the same field shell, option-row spacing, muted text treatment, and selected-state styling already used by the established sidebar dropdowns.

2. Re-layout taxonomy presentation in `Places` result cards.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/constants.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Move the category chip below the result title.
   - Keep the subcategory label as secondary metadata near that chip instead of crowding the title row.
   - Preserve the shown/hidden badge, but keep title + taxonomy visually cleaner.
   - Match the spacing rhythm, type scale, and chip sizing used elsewhere in the sidebar cards.

3. Remove POI count display from the `Icons` panel.
   - Files:
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/IconItem.tsx`
     - `test/e2e/features/RemixSidebar.feature`
     - `test/e2e/steps/RemixSidebar.steps.ts`
   - Remove leaf POI count strings from icon items and group rows in the `Icons` panel.
   - Keep icon browsing focused on icon name, preview, selection state, visibility controls, and remix actions.
   - Leave count semantics only in `Places`, where they help filtering and visibility understanding.
   - Preserve the existing `Icons` panel’s spacing, colors, and control alignment so this stays a cleanup, not a redesign.

### Verification Plan
1. `npm test -- --run test/shared/components/sidebar/right/PoiSearchPanel.test.tsx test/features/map/services/PoiSearchService.test.ts test/features/map/services/poiIconResolver.test.ts`
2. `npm run test:e2e:bdd -- --grep "Searching loaded POIs by name and category|Interacting with Right Sidebar Categories|Verifying Remix functionality"`
3. Manual sanity check:
   - open category and subcategory dropdowns and verify long labels remain readable without broken word wrapping,
   - expand `Show on map` and confirm category names also stay readable there,
   - verify a result card shows its colored category chip below the title,
   - verify the `Icons` panel no longer displays POI count strings next to icon items.

## Phase 25 Plan: Remix Focus Correctness, Taxonomy Count Clarity, Desktop Filter Reliability, and Popup Chrome Polish (2026-03-15)

### Goal
Stabilize the latest `Places / Icons / Popup` workflow by fixing the remaining mismatches that make it feel unreliable:
- ensure popup `Remix Icon` focuses the correct icon target and that switching selection in the `Icons` panel actually changes the selected editor item,
- fix `category / subcategory` dropdown filters on desktop so they reliably change the result set,
- clarify and correct count semantics so category rows and subcategory rows display the right numbers,
- move `Show on map` to the top of the `Places` panel and place search/filters lower directly above results,
- align the collapsed `Show on map` control with the same expand/collapse affordance style used in the `Icons` panel,
- move popup close affordance fully inside the popup frame and reduce layout jank while popup details are loading,
- make `Places` result cards show an explicit colored category label so taxonomy is easier to scan.

### User Review Required
1. Remix focus and selection behavior:
   - Recommended default: when popup `Remix Icon` opens the `Icons` panel, the resolved target icon leaf should become the single selected editor item.
   - Recommendation: if the user then clicks a different icon row, selection should immediately move to that row and the previous remix focus should be cleared.
   - Result: remix acts as an initial deep-link only, not a sticky lock on the old category.
2. Count semantics:
   - Recommended default: category rows continue to show `shown / loaded` POIs for the whole category branch.
   - Recommendation: subcategory rows also show `shown / loaded` for that exact leaf only, never inherited category totals.
   - Recommendation: `69 / 69` should therefore mean “69 loaded POIs exist in this exact subcategory and all 69 are currently shown on the map”.
3. `Show on map` collapsed affordance:
   - Recommended default: replace the text-only `Expand` button in `Places` with the same chevron-led affordance style already used in `Icons` section headers.
   - Result: the interaction language stays consistent across both sidebars.
4. `Places` panel layout:
   - Recommended default: make `Show on map` the first major section, then search/category/subcategory/metadata filters, then the result list.
   - Recommendation: separate these blocks visually with the same section-card rhythm used by the other sidebar panels, so the panel reads clearly at a glance.
5. Popup chrome and loading:
   - Recommended default: keep the close button outside the popup frame, but positioned consistently so it stays reachable and does not overlap controls awkwardly.
   - Recommendation: loading state should not cause the popup shell to jump, overflow, or visually detach its action buttons while details are being fetched.
6. Result list taxonomy badge:
   - Recommended default: each `Places` result card should show a small colored taxonomy chip using the canonical category color and category label.
   - Recommendation: keep the existing category + subcategory text line too, but add the chip so scanning is faster.

### Proposed Changes
1. Fix popup remix deep-link state so icon selection is not sticky to the previous POI.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/IconItem.tsx`
     - `src/features/map/services/poiIconResolver.ts`
     - `test/e2e/features/RemixSidebar.feature`
     - `test/e2e/steps/RemixSidebar.steps.ts`
   - Audit the current `remixFocusCategory`, `selectedCategory`, and programmatic scroll path.
   - Ensure popup remix sets the correct resolved canonical icon leaf as the initial selected item.
   - Ensure manually selecting another icon row clears the remix lock and updates the editor card immediately.
   - Add regression coverage for “remix opens correct icon” and “manual re-selection replaces previous remix target”.

2. Correct count semantics for category and subcategory rows.
   - Files:
     - `src/features/map/services/PoiSearchService.ts`
     - `src/shared/taxonomy/poiTaxonomy.ts`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `test/features/map/services/PoiSearchService.test.ts`
     - `test/shared/taxonomy/poiTaxonomy.test.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Change category rows to show the number of discovered subcategories in that group, not the number of loaded POIs in the whole branch.
   - Keep subcategory rows showing leaf-level `shown / loaded` POI counts for that exact subtype.
   - Remove any accidental reuse of category aggregate counts when rendering icon subcategory rows.
   - Clarify the legend copy so it distinguishes category-group counts from leaf POI counts.

3. Repair desktop category/subcategory dropdown filters.
   - Files:
     - `src/shared/components/sidebar/common/SidebarSelectMenu.tsx`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Re-check trigger/menu open-close logic for desktop specifically.
   - Ensure menu clicks consistently select the option instead of being swallowed by outside-click handling or overlay stacking.
   - Confirm category and subcategory filters update results and counts immediately on desktop.

4. Replace the collapsed `Show on map` button with the same expand/collapse visual language used in `Icons`.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/common/SidebarVisibilityActions.tsx`
     - `src/shared/styles/uiTokens.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Replace the standalone `Expand` button with a header row using chevron + title, matching the existing `Icons` expand/collapse rhythm.
   - Preserve collapsed-by-default behavior.

5. Reorder and separate `Places` panel sections more clearly.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Move `Show on map` above the search and metadata filters.
   - Move search/category/subcategory/metadata filters directly above the results list.
   - Make the section separation more explicit, matching the way other panels break content into distinct cards/blocks.

6. Polish popup close placement and reduce loading jank.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Keep the popup close control outside the popup chrome on desktop and mobile, but anchor it more reliably so it stays accessible and visually attached.
   - Keep loading, body content, and action rows inside the frame while async details resolve.
   - Reduce resize/reflow lag introduced by loading transitions.

7. Add a colored category chip to `Places` result cards.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/constants.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
   - Render a compact category chip using the canonical category color and label.
   - Keep the existing `category · subcategory` secondary line for full context.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiSearchService.test.ts test/shared/taxonomy/poiTaxonomy.test.ts test/shared/components/sidebar/right/PoiSearchPanel.test.tsx test/features/map/services/PopupGenerator.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. `npm run test:e2e:bdd -- --grep "Searching loaded POIs by name and category|Filtering loaded POIs by metadata|Verifying Remix functionality|Desktop remix focus aligns the selected icon to the top and allows scrolling|Interacting with Right Sidebar Categories|Keeping popup close accessible on mobile"`
3. Manual sanity check:
   - open a popup, click `Remix Icon`, then click a different icon row and confirm the editor switches to the newly clicked icon,
   - verify a category row shows the number of subcategories in that group,
   - verify a subcategory row such as `Supermarket` shows leaf counts, not the full category total,
   - confirm `Show on map` is the first section in `Places` and that search/filters sit directly above results,
   - use category and subcategory dropdowns on desktop and confirm the result list changes,
   - confirm `Show on map` starts collapsed and uses the same chevron-style affordance as `Icons`,
   - open a popup during loading and confirm the outside close button stays reachable while the loading block and action buttons stay inside the popup shell,
   - confirm result cards show a colored category badge plus the existing taxonomy text.

## Phase 24 Plan: Stable Visibility Semantics, Collapsed Map Filters, Popup Loading Fixes, and Full POI Taxonomy Sync (2026-03-15)

### Goal
Stabilize the new `Places/Icons/Popup` workflow so it stops feeling jittery or inconsistent by:
- making `Show on map` counts stable instead of flashing between `0 / N` and non-zero values,
- ensuring search result visibility badges agree with the shared category/subcategory visibility state,
- collapsing `Show on map` by default so the panel is less overwhelming on load,
- fixing remaining popup loading/layout issues on desktop and mobile,
- making `Remix Icon` work for the full POI taxonomy instead of only the smaller legacy icon list,
- aligning `Places`, `Icons`, icon generation, and popup remix around the same canonical POI category/subcategory universe.

### User Review Required
1. Visibility semantics:
   - Recommended default: stop deriving `visible` counts and badges from transient rendered/queryable map state, because that is what causes the `0 / N` flicker and stale “Visible” labels.
   - Recommendation: compute a stable shared visibility status from cached loaded POIs + current category/subcategory visibility filters + current zoom eligibility.
   - Result: if a branch is hidden, counts and result badges should update immediately and consistently without waiting for the map to redraw.
2. `Show on map` panel behavior:
   - Recommended default: keep the entire `Show on map` section collapsed by default in `Places`.
   - Recommendation: preserve the user’s expand/collapse choice per session after first interaction.
3. Taxonomy expansion for remix/icon generation:
   - Recommended default: treat the loaded POI taxonomy as the source of truth and extend icon/remix support to all discovered POI category/subcategory keys.
   - Recommendation: keep existing grouped UI buckets, but allow every leaf POI subcategory to map to a concrete icon/remix target, with fallback grouping only for display.
   - Tradeoff: the icon domain gets much larger, so icon generation should stay lazy/on-demand rather than eagerly creating assets for every possible type.
4. Popup loading behavior:
   - Recommended default: keep loading UI compact and inside the popup frame at all times, even while details are still resolving or while viewport fitting is happening.
   - Recommendation: never let loading/action rows visually detach from the popup shell.

### Proposed Changes
1. Make map visibility counts and badges stable.
   - Files:
     - `src/features/map/services/PoiRegistryService.ts`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/RightSidebar.tsx`
   - Replace the current flickery `visible` derivation that depends on momentary rendered/queryable map state.
   - Introduce a stable branch/result visibility model derived from:
     - loaded POI cache,
     - active shared category/subcategory visibility filters,
     - current zoom thresholds or any other deterministic map eligibility rule already used by the symbol layer.
   - Ensure counts do not bounce through `0 / N` just because the source/layer is refreshing.
   - Ensure result cards in `Places` never say `Visible` when their category/subcategory is currently hidden.

2. Collapse `Show on map` by default and reduce panel noise.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/common/SidebarVisibilityActions.tsx`
   - Make the `Show on map` section collapsed on initial open.
   - Preserve expand/collapse state after the user interacts.
   - Keep reset/show-only actions accessible, but avoid front-loading the entire visibility tree on every tab open.
   - This should also help perceived performance when switching to `Places`.

3. Fix remaining popup loading/layout issues.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
   - Audit the popup loading state so the loading card and action rows always remain inside the popup container.
   - Prevent popup content from visually “spilling” outside the frame while details are still loading.
   - Re-check mobile positioning with the top toolbar and zoom controls together.
   - Keep the popup loading state compact so it does not stretch the popup before real content arrives.

4. Unify icon/remix taxonomy with the full POI taxonomy.
   - Files:
     - `src/shared/taxonomy/poiTaxonomy.ts`
     - `src/features/map/services/poiIconResolver.ts`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/features/map/services/PoiService.ts`
     - `src/features/map/services/PopupGenerator.ts`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/IconItem.tsx`
   - Expand the taxonomy layer so all POI categories/subcategories discovered from OSM/loaded POIs have canonical keys that can participate in:
     - `Places`,
     - `Icons`,
     - popup `Remix Icon`,
     - icon generation/regeneration prompts.
   - Stop depending on the smaller hardcoded icon-category list as the upper bound for remix eligibility.
   - Keep grouped sidebar presentation, but route every actual POI subtype to a specific canonical leaf key.

5. Repair `Remix Icon` enablement and generation targets.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/features/map/services/poiIconResolver.ts`
   - Enable popup remix whenever the clicked POI resolves to a valid canonical icon target, even if that target comes from the expanded taxonomy instead of the old list.
   - Ensure clicking remix opens the right sidebar focused on the matching canonical category/subcategory target.
   - Add a clear fallback for POIs that still cannot resolve to a remixable icon leaf.

6. Improve `Places` tab performance under large caches.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/features/map/services/PoiRegistryService.ts`
   - Avoid eagerly computing deep visibility trees while `Show on map` is collapsed.
   - Memoize stable branch counts/indexes by cache version instead of recomputing the whole tree for every render.
   - Keep search results responsive even when loaded POI cache grows large.

7. Expand regression coverage for stable counts, collapsed visibility UI, popup loading, and remix taxonomy.
   - Files:
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/features/map/services/PoiRegistryService.test.ts`
     - `test/features/map/services/PoiSearchService.test.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/features/map/services/poiIconResolver.test.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add or update coverage for:
     - stable counts that do not jitter through `0 / N`,
     - result badges switching from `Visible` to `Loaded` when categories are hidden,
     - `Show on map` collapsed by default,
     - popup loading staying inside the popup frame on desktop/mobile,
     - remix working for POIs whose subtype exists in the expanded taxonomy but not in the old icon list.

### Verification Plan
1. `npm test -- --run test/shared/components/sidebar/right/PoiSearchPanel.test.tsx test/features/map/services/PoiRegistryService.test.ts test/features/map/services/PoiSearchService.test.ts test/features/map/services/PopupGenerator.test.ts test/features/map/services/poiIconResolver.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. `npm run test:e2e:bdd -- --grep "Filtering loaded POIs|Hiding and showing POI categories|Syncing map visibility controls|Keeping popup close accessible on mobile|Verifying Remix functionality"`
3. Manual sanity check:
   - open `Places` and confirm `Show on map` starts collapsed,
   - hide a category and confirm result cards for that branch switch away from `Visible`,
   - keep the panel open for several seconds and confirm counts do not oscillate,
   - open a popup while details load and confirm the loading state stays inside the popup shell,
   - test `Remix Icon` on a POI subtype that previously existed in `Places` but not in the limited icon list.

## Phase 23 Plan: Places Performance Recovery, Reversible Show-Only State, and Visibility Clarity (2026-03-15)

### Goal
Stabilize the new `Places/Icons` visibility workflow so it feels fast and understandable by:
- removing the major slowdown when opening or interacting with `Places`,
- fixing category/subcategory filter dropdown selection so they actually affect the result set,
- adding a dedicated visibility reset action inside `Icons`,
- making `show only this` reversible back to the previously selected visibility state,
- clarifying what the `Show on map` numbers mean,
- preserving mobile popup usability while the sidebar/visibility changes continue to evolve.

### User Review Required
1. Reversible `show only this` behavior:
   - Recommended default: treat `show only this` as a temporary isolation mode backed by a saved visibility snapshot.
   - When the same control is toggled off, restore the exact category/subcategory visibility state that existed before isolation.
   - Recommendation: keep only one active isolation snapshot at a time; starting a new isolation replaces the previous snapshot.
2. Icons reset behavior:
   - Recommended default: add a `Reset visibility` action inside the `Icons` panel that resets the shared map visibility state, not icon generation data.
   - Recommendation: keep it visually near the new eye/show-only controls so the recovery path is obvious.
3. `Show on map` counts meaning:
   - Recommended default: define counts as `visible / loaded`.
   - Example: `85 / 327` means 85 POIs in that branch are currently visible on the map, out of 327 loaded in cache.
   - Recommendation: surface a tiny inline legend or tooltip so users do not have to guess.
4. Performance scope:
   - Recommended default: prioritize removing synchronous whole-tree recomputation on `Places` tab open and on every visibility toggle.
   - Recommendation: memoize taxonomy indexes, virtualize only the rows that are actually visible, and avoid recalculating filtered result cards until the user interacts with search/filters.

### Proposed Changes
1. Recover `Places` panel performance.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/features/map/services/PoiRegistryService.ts`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/features/map/hooks/useMapLogic.ts`
   - Profile and remove the hottest synchronous work on `Places` tab activation.
   - Stop deriving the full taxonomy tree, counts, filtered results, and visible-state badges multiple times during the same render turn.
   - Memoize expensive indexes by registry version and active filter state instead of raw POI array identity.
   - Keep large lists windowed and avoid mounting deep subcategory branches until expanded.

2. Fix category/subcategory dropdown filters so they apply correctly.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/common/SidebarSelectMenu.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/shared/taxonomy/poiTaxonomy.ts`
   - Audit the taxonomy values passed into the dropdowns versus the values used in search filtering.
   - Ensure category and subcategory selections use the same normalized identifiers as the search/index layer.
   - Verify that selecting or clearing each dropdown immediately updates the loaded-results list and counts.

3. Add shared visibility reset inside the `Icons` panel.
   - Files:
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/IconList.tsx`
     - `src/shared/components/sidebar/right/IconCategoryList.tsx`
     - `src/features/map/services/PoiRegistryService.ts`
   - Add a dedicated reset action in the `Icons` panel that restores all categories/subcategories to visible.
   - Keep this action wired to the exact same shared visibility state as `Places > Show on map`.

4. Make `show only this` reversible.
   - Files:
     - `src/features/map/services/PoiRegistryService.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/right/IconItem.tsx`
     - `src/shared/components/sidebar/common/SidebarVisibilityActions.tsx`
   - Store the pre-isolation visibility snapshot before applying `show only this`.
   - If the user toggles off the same isolated branch, restore that snapshot instead of falling back to “everything visible”.
   - Make the UI state explicit so users can tell when they are in isolation mode.

5. Clarify `Show on map` counts.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/right/IconItem.tsx`
     - `src/shared/components/sidebar/RightSidebar.tsx`
   - Label counts as `visible / loaded`.
   - Add supporting microcopy near the section title or count rows so the meaning is clear.
   - Keep the same count semantics in both `Places` and `Icons` so the panels do not drift.

6. Re-check mobile popup layout while visibility/UI work lands.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
   - Ensure the popup action button grid still fits on narrow screens after the latest UI changes.
   - Prevent action rows from visually spilling or overlapping when the popup opens under the mobile toolbar.

7. Expand regression coverage for performance-sensitive flows and reversible isolation.
   - Files:
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/features/map/services/PoiRegistryService.test.ts`
     - `test/features/map/services/PoiSearchService.test.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add or update coverage for:
     - category/subcategory dropdown filters actually changing results,
     - `show only this` followed by toggle-off restoring the previous visibility snapshot,
     - `Icons` reset restoring shared visibility state,
     - consistent `visible / loaded` count rendering,
     - mobile popup action buttons remaining usable.

### Verification Plan
1. `npm test -- --run test/shared/components/sidebar/right/PoiSearchPanel.test.tsx test/features/map/services/PoiRegistryService.test.ts test/features/map/services/PoiSearchService.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. `npm run test:e2e:bdd -- --grep "Searching loaded POIs|Filtering loaded POIs|Hiding and showing POI categories|Syncing map visibility controls|mobile"`
3. Manual sanity check:
   - open `Places` with a large POI set and confirm tab switch no longer stalls badly,
   - select a category and subcategory filter and confirm the result set changes correctly,
   - use `show only this`, then toggle it off and confirm the previous visibility selection returns,
   - use the new `Icons` reset control and confirm it resets the same shared map visibility state,
   - confirm the `Show on map` counts are understandable without guessing,
   - confirm popup action buttons remain usable on a phone-sized viewport.

## Phase 22 Plan: Places Visibility UX Polish, Mobile Popup Access, and Cross-Panel Visibility Sync (2026-03-15)

### Goal
Tighten the new Places workflow so it feels native to the rest of the app by:
- making Places dropdowns, filter buttons, typography, and checkboxes fully match the shared sidebar control system,
- removing the distracting “everything disappears, then comes back” feeling when map visibility checkboxes change,
- improving mobile popup accessibility so the close button is never blocked by the zoom controls,
- syncing category/subcategory visibility controls between the `Places` panel and the `Icons` panel,
- adding fast visibility shortcuts such as “show only this category/subcategory”.

### User Review Required
1. Visibility toggle behavior:
   - Recommended default: do not hard-refresh all rendered POIs when one category checkbox changes.
   - Instead, update the map source/layer filter atomically so only affected categories fade or swap visibility in place.
   - Recommendation: preserve already-rendered features and avoid any intermediate empty-map frame.
2. Cross-panel visibility controls:
   - Recommended default: add eye controls directly inside the `Icons` panel next to category and subcategory rows.
   - These controls should be backed by the same shared visibility state used by `Places > Show on map`.
   - Recommendation: keep one source of truth for visibility and reflect it in both panels immediately.
3. “Show only this” shortcut behavior:
   - Recommended default: add a secondary action on category/subcategory rows that hides all siblings and leaves only the chosen branch visible.
   - Recommendation: implement this as a reversible map-visibility shortcut, not a destructive taxonomy reset.
4. Mobile popup strategy:
   - Recommended default: when a popup opens on narrow screens, offset/pad the viewport and reposition map controls so the popup close affordance remains tappable.
   - Recommendation: treat the popup close button as a protected interaction zone and avoid overlapping it with map zoom controls.
5. Dropdown menu clipping:
   - Recommended default: render Places dropdown menus in the same overlay/popper style as the provider/model menus so options are fully visible and not clipped by nearby content.
   - Recommendation: prioritize reliable option visibility over preserving the current inline menu positioning.

### Proposed Changes
1. Bring Places filters fully into design-system parity.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/common/SidebarSelectMenu.tsx`
     - `src/shared/styles/uiTokens.ts`
     - `src/shared/components/sidebar/left/AiSettingsPanel.tsx`
   - Make the category/subcategory dropdown menus render like the provider/model controls, including menu placement, option spacing, truncation treatment, typography, and hover/selected states.
   - Align filter button typography and line-height with the rest of the sidebar so labels such as `Has photo`, `Has website`, and `Open now` no longer look like a different font system.
   - Normalize checkbox appearance so the checked state is less visually harsh and matches the rest of the app.
   - Fix dropdown option visibility so labels/counts are readable and not visually clipped in narrow sidebar layouts.

2. Smooth map visibility toggles so POIs do not appear to fully disappear and reload.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiRegistryService.ts`
     - `src/features/map/services/PoiService.ts`
     - `src/features/map/services/PoiSearchService.ts`
   - Audit the current map-visibility update path and remove any full-source replacement or transient empty state when category/subcategory visibility changes.
   - Prefer updating the rendered feature set or map filters incrementally from cached POI registry data.
   - Keep visible POIs stable while applying visibility changes so the map feels filtered, not reloaded.

3. Improve mobile popup accessibility and control collision handling.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/components/MapView.tsx`
     - `src/shared/layouts/MainLayout.tsx`
   - Detect narrow/mobile viewport popup opens and reposition or pad the camera so the popup frame stays fully operable.
   - Revisit map control placement or dynamic control padding on mobile so the `+/-` zoom stack does not cover the popup close button.
   - Ensure popup action buttons and frame width remain usable on phone screens.

4. Add shared visibility controls to the Icons panel and sync them with Places.
   - Files:
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/IconList.tsx`
     - `src/shared/components/sidebar/right/IconCategoryList.tsx`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/layouts/MainLayout.tsx`
     - `src/types.ts`
   - Add an eye toggle for category and subcategory rows in the icon-generation panel.
   - Wire these controls to the same underlying map visibility state used by the Places panel.
   - Reflect hidden/visible status consistently in both panels, without diverging counts or stale state.

5. Add “show only this” shortcuts for category and subcategory branches.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/right/IconList.tsx`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiRegistryService.ts`
   - Add a dedicated affordance on category and subcategory rows for isolating one branch.
   - Apply the shortcut by updating shared visibility filters so all sibling branches are hidden and only the selected branch stays visible.
   - Ensure the action is reversible via `Reset map` / explicit re-enable flows.

6. Keep performance stable while adding the new visibility UI.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/right/IconList.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/features/map/services/PoiRegistryService.ts`
   - Reuse memoized taxonomy/visibility indexes so the new eye toggles do not make Places or Icons feel slower.
   - Avoid recomputing the full taxonomy tree on every checkbox/eye toggle.
   - Keep deferred rendering/windowing intact for large POI sets.

7. Expand regression coverage for mobile popup access, menu visibility, and shared visibility sync.
   - Files:
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/features/map/services/PoiRegistryService.test.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/features/RemixSidebar.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
     - `test/e2e/steps/RemixSidebar.steps.ts`
   - Add or update coverage for:
     - fully visible Places dropdown menus on narrow widths,
     - consistent filter button typography/sizing,
     - smoother category/subcategory visibility toggles without transient empty-map behavior,
     - mobile popup close affordance remaining accessible,
     - shared eye visibility toggles between Places and Icons,
     - “show only this category/subcategory” behavior.

### Verification Plan
1. `npm test -- --run test/shared/components/sidebar/right/PoiSearchPanel.test.tsx test/features/map/services/PoiRegistryService.test.ts test/features/map/hooks/useMapLogic.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm test -- --run test/features/map/services/PoiSearchService.test.ts test/features/map/services/poiIconResolver.test.ts`
3. `npm run test:e2e:bdd -- --grep "Searching loaded POIs|Filtering loaded POIs|Hiding and showing POI categories|Keeping popup visible|popup|Remix"`
4. Manual sanity check:
   - open Places on desktop and confirm dropdown menus are fully readable and match provider/model controls,
   - toggle map visibility checkboxes and confirm the map filters smoothly without a full disappear/reappear cycle,
   - open the app on a phone-sized viewport and confirm popup close remains tappable even near the zoom controls,
   - toggle visibility from both `Places` and `Icons` and confirm the two panels stay in sync,
   - use the new “show only this” shortcut and confirm it isolates one branch without losing cached POIs.

## Phase 21 Plan: Places Panel Design-System Sync, Taxonomy Unification, and Large-List Performance (2026-03-15)

### Goal
Bring the Places workflow back into alignment with the rest of the app by:
- making Places dropdowns visually and behaviorally match the existing provider/model dropdown controls,
- normalizing button sizes, checkbox visuals, spacing, and control density to the app's shared sidebar language,
- syncing POI category/subcategory taxonomy with the icon grouping model so Places and Icons speak the same structure,
- making the Places tab feel fast even with very large loaded POI sets.

### User Review Required
1. Shared taxonomy source of truth:
   - Recommended default: introduce one canonical taxonomy adapter that both the Icons panel and Places panel consume.
   - Icon groups should stay the primary curated structure, and POIs should be projected into that same grouped hierarchy.
   - POI categories/subcategories that do not map cleanly should go into explicit fallback groups such as `Other` / `Unmapped` instead of creating raw one-off buckets.
   - Recommendation: keep fallback groups visible so no POI disappears from the taxonomy, but visually separate them from curated icon groups.
2. Dropdown styling direction:
   - Recommended default: reuse the same menu pattern and sizing language already used by the AI provider/model dropdowns instead of maintaining a Places-only custom control style.
   - This means the Places dropdown trigger, menu surface, option spacing, hover states, and selection treatment should mirror the provider controls unless there is a compelling feature-specific reason not to.
3. Performance strategy:
   - Recommended default: do not compute the entire Places taxonomy/results tree eagerly on every sidebar render.
   - Instead:
     - defer heavy derivations until the `Places` tab is active,
     - memoize precomputed indexes from the POI registry,
     - virtualize or window long category/result lists,
     - avoid rendering all nested category rows up front.
   - Recommendation: optimize for smooth tab switching first, then for fast filter interaction.
4. Category synchronization behavior:
   - Recommended default: if Icons currently expose fewer curated groups than raw POI taxonomy does, keep the curated group structure and surface any unmatched POI types inside clearly labeled fallback subgroups.
   - Recommendation: do not explode the icon taxonomy to mirror every raw OSM subtype; instead normalize POIs toward the curated structure.

### Proposed Changes
1. Replace Places dropdown visuals with the app's existing dropdown language.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/components/sidebar/left/AiSettingsPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - possibly new shared sidebar menu primitive(s) under `src/shared/components/sidebar/common/`
   - Extract or reuse a single sidebar dropdown/menu presentation model based on the provider options UI.
   - Make the Places category and subcategory triggers, menu surface, selection row, spacing, and hover/selected states match that style.
   - Remove Places-specific visual deviations that currently make it look like a separate design system.

2. Normalize control sizing and checkbox styling across Places and the rest of the app.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - possibly shared checkbox/toggle helpers under `src/shared/components/`
   - Align button heights, padding, typography, border radii, and icon sizes with existing sidebar controls.
   - Make Places checkboxes match the checkbox treatment used elsewhere in the app rather than using a one-off variant.
   - Tighten the metadata filter row so `Has photo`, `Has website`, and `Open now` look and feel like first-class app controls instead of oversized custom chips.

3. Create a shared taxonomy adapter so Places and Icons stay in sync.
   - Files:
     - `src/constants.ts`
     - new taxonomy helper/service under `src/shared/` or `src/features/map/services/`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
   - Introduce one canonical grouping layer that:
     - maps raw POI category/subcategory data to the same curated groups used by icon browsing,
     - exposes category + subcategory labels for Places filters,
     - preserves unmatched POI types in explicit fallback buckets.
   - Use that adapter in both the Icons panel and the Places panel so counts, labels, and grouping logic do not drift.

4. Reduce tab-switch cost for large loaded POI sets.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/features/map/services/PoiRegistryService.ts`
     - `src/shared/layouts/MainLayout.tsx`
   - Defer heavy Places computations until the Places tab is actually active.
   - Build memoized indexes from the session POI registry so repeated filtering does not recompute full taxonomy summaries from scratch.
   - Only derive visible UI slices needed for the current interaction path:
     - collapsed groups first,
     - expanded subgroup lists on demand,
     - filtered result list only when search/filter state changes.

5. Add list virtualization or equivalent windowing for the biggest Places UI sections.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - possibly new helper under `src/shared/hooks/`
   - Apply virtualization/windowing to:
     - the long category/subcategory visibility tree,
     - the result list if it grows large.
   - Avoid mounting hundreds or thousands of rows at once when switching tabs.
   - Keep expansion behavior and checkbox state stable while rows mount/unmount.

6. Harden search/filter interaction performance and consistency.
   - Files:
     - `src/features/map/services/PoiSearchService.ts`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/features/map/hooks/useMapLogic.ts`
   - Continue using deferred search input, but make category/subcategory changes cheaper by querying memoized indexes instead of raw arrays wherever possible.
   - Prevent unnecessary re-renders when toggling Places/Icons tabs or changing one filter.
   - Ensure the Places panel shows counts and results from the synced taxonomy model rather than raw unsorted category data.

7. Expand regression coverage for styling parity, taxonomy sync, and large-list responsiveness.
   - Files:
     - `test/features/map/services/PoiSearchService.test.ts`
     - `test/features/map/services/PoiRegistryService.test.ts`
     - `test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add/adjust coverage for:
     - Places dropdown rendering and selection behavior matching the shared sidebar dropdown pattern,
     - consistent control sizing/checkbox behavior,
     - POI taxonomy mapping into curated icon groups plus fallback buckets,
     - stable counts between Places and Icons taxonomy views,
     - fast-enough Places tab activation without rendering the full large tree eagerly,
     - filtering/searching still working correctly after the performance optimizations.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiSearchService.test.ts test/features/map/services/PoiRegistryService.test.ts test/shared/components/sidebar/right/PoiSearchPanel.test.tsx`
2. `npm test -- --run test/features/map/hooks/useMapLogic.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
3. `npm run test:e2e:bdd -- --grep "Searching loaded POIs|Filtering loaded POIs|Hiding and showing POI categories|Places|Icons"`
4. Manual sanity check:
   - open the Places tab with a large loaded POI set and confirm it appears without a noticeable freeze,
   - verify the category/subcategory dropdowns visually match the provider/model dropdown family,
   - verify buttons and checkboxes feel consistent with the rest of the app,
   - compare Places grouping against the Icons panel and confirm categories are aligned or clearly placed in fallback groups,
   - expand several map-visibility groups and confirm scrolling and toggling remain smooth.

## Phase 20 Plan: Places Panel Maturity, Persistent POI Cache, and Map Visibility Filters (2026-03-15)

### Goal
Upgrade the new Places workflow so it feels production-ready:
- fix POIs whose popup `Remix Icon` action does not open a usable icon editor target,
- make Places panel controls visually consistent with the rest of the app,
- replace the single flat category filter with category + subcategory browsing,
- keep already-loaded POIs cached across map movement instead of dropping and reloading them every time the viewport changes,
- add a separate map-display filter for category/subcategory visibility via checkboxes,
- improve panel responsiveness and interaction performance,
- make `Has photo` work from POI metadata/background enrichment instead of only after a popup has already been opened.

### User Review Required
1. POI cache scope:
   - Recommended default: keep a persistent in-memory POI registry for the current session, keyed by normalized POI identity.
   - POIs should remain in the loaded index when the user pans away, and only be marked `visible` / `not visible` depending on the current viewport.
   - New source refreshes should merge into that registry instead of replacing it.
   - Recommendation: do not persist this registry to IndexedDB yet; keep this phase focused on fast runtime UX.
2. Map-display filtering behavior:
   - Recommended default: add a separate “Show on map” taxonomy filter inside Places mode, using checkbox groups by category and subcategory.
   - This filter should affect map rendering and loaded results visibility, but should not delete cached POIs from memory.
   - Recommendation: default to “all visible”; hiding a category only changes rendered/output POIs until toggled back on.
3. Category/subcategory UX:
   - Recommended default: use a grouped custom dropdown/panel, visually aligned with the theme selector, rather than the browser-native `<select>`.
   - This avoids platform-default styling and lets us support category + subcategory drill-down in one control family.
4. `Has photo` semantics:
   - Recommended default: treat `has photo` as “known photo candidate exists from source tags or background-enriched metadata”.
   - It should not require opening the popup first.
   - Recommendation: background-enrich lightweight photo facets for loaded POIs with bounded concurrency rather than fetching full popup details for everything.
5. Remix fallback:
   - Recommended default: if a POI cannot map cleanly to an editable icon category, do not silently fail.
   - Either map it to the closest valid icon category/group, or keep the button disabled with a clear reason.

### Proposed Changes
1. Fix POI-to-icon remix targeting and panel opening reliability.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/layouts/MainLayout.tsx`
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - possibly `src/features/map/services/PopupGenerator.ts`
     - related tests under `test/features/map/hooks/` and `test/e2e/steps/`
   - Audit the current POI → edit category resolution path used by popup `Remix Icon`.
   - Add a stronger fallback chain:
     - iconKey,
     - POI subcategory,
     - POI category,
     - nearest icon group/category alias.
   - Ensure the right sidebar always opens in `icons` mode for valid remix targets.
   - For unsupported POIs, surface an explicit disabled reason instead of a dead control.

2. Redesign Places filter controls to match app styling.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/styles/uiTokens.ts`
     - possibly new small reusable control components under `src/shared/components/`
   - Replace the native `<select>` with a custom menu/popover pattern matching [TopToolbar.tsx](/Users/suna_no_oshiro/Documents/fun-gpt/map-alchemist/src/shared/components/TopToolbar.tsx).
   - Remove the duplicate clear affordance in the search field and keep a single consistent clear action.
   - Tighten button sizing/spacing to match the rest of the sidebar controls.

3. Replace the flat category filter with category + subcategory browsing.
   - Files:
     - `src/features/map/services/PoiSearchService.ts`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/types.ts`
   - Extend the search/filter model so it understands:
     - selected categories,
     - selected subcategories,
     - grouped taxonomy summaries.
   - Show taxonomy in a grouped structure similar to icon groupings rather than one long flat list.
   - Keep search text matching over both category and subcategory.

4. Introduce a persistent loaded-POI registry and separate visibility state.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/PoiService.ts`
     - `src/features/map/services/PoiSearchService.ts`
     - `src/types.ts`
   - Replace the current “replace loaded POIs with current source snapshot” behavior with:
     - a merged registry of all seen POIs for the session,
     - `visible` derived from current viewport/rendered features,
     - `lastSeenAt` or similar bookkeeping for dedupe/debugging.
   - Avoid re-adding or re-processing POIs already known to the registry.
   - Keep source refreshes for new viewport content, but do not discard prior loaded POIs on pan.
   - Recommendation: only force aggressive refresh/reset on major zoom-band changes or style changes.

5. Add map-level category/subcategory visibility filters with checkboxes.
   - Files:
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
     - `src/shared/layouts/MainLayout.tsx`
     - `src/features/map/hooks/useMapLogic.ts`
     - possibly `src/features/map/services/PoiService.ts`
   - Add a separate section such as `Show on map` using grouped checkboxes.
   - Apply this filter to map-rendered POIs without deleting them from the loaded registry.
   - Ensure Places results reflect the same visibility state clearly.

6. Make `Has photo` available before popup-open and improve Places panel responsiveness.
   - Files:
     - `src/features/map/services/PoiSearchService.ts`
     - `src/features/map/services/PoiDetailsService.ts`
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/components/sidebar/right/PoiSearchPanel.tsx`
   - Add lightweight background enrichment for photo/website/opening-hours facets on loaded POIs with bounded concurrency and caching.
   - Use those cached facets to populate `hasPhoto` / `hasWebsite` / `openNow` in the Places panel even before popup open.
   - Add memoized indexes and/or pre-grouped results so switching to Places mode and toggling filters stays responsive for large loaded POI sets.

7. Expand regression coverage for remix, taxonomy filters, cache persistence, and empty states.
   - Files:
     - `test/features/map/services/PoiSearchService.test.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add coverage for:
     - popup remix opening the icons panel for supported POIs,
     - unsupported remix targets showing a clear disabled state,
     - category + subcategory filtering,
     - persistent loaded POIs surviving pan-away / pan-back,
     - map checkbox visibility filters,
     - `Has photo` working without first opening a popup,
     - valid empty-state behavior when no POIs match filters.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiSearchService.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. `npm run test:e2e:bdd -- --grep "Searching loaded POIs|Filtering loaded POIs|Remix|popup|map features"`
3. Manual sanity check:
   - open a POI with a previously non-working `Remix Icon` button and confirm the icons panel opens to a valid editable target or shows a clear disabled reason,
   - use Places mode and verify search field, dropdown/menu, and buttons visually match the rest of the app,
   - filter by category + subcategory,
   - pan away and back and confirm previously seen POIs remain in the loaded registry and simply flip visible/invisible,
   - toggle map visibility checkboxes and confirm POIs hide/show without being forgotten,
   - verify `Has photo` works for enriched POIs even before manually opening their popup.

## Phase 19 Plan: POI Search + Filter Panel for Loaded Places (2026-03-15)

### Goal
Add a practical POI finder that lets the user search through already loaded POIs by name/category and filter them by:
- `category`
- `has photo`
- `has website`
- `open now`

### User Review Required
1. Search scope:
   - Recommended default: search across currently loaded POIs in the app's `places` source, not the whole world.
   - This keeps the feature fast, free, and aligned with what the map already knows.
   - If the user pans/zooms and the `places` source changes, the result list should update automatically.
2. Panel placement:
   - Recommended default: reuse the existing right sidebar instead of adding a new floating search window.
   - This avoids overcrowding the map and fits the current layout better.
3. `open now` semantics:
   - Recommended default: best-effort evaluation based on `opening_hours` when it is available.
   - If a POI has no `opening_hours`, it should not match `open now`.
   - This should be clearly treated as “known open now from available data”, not a guaranteed live business status.
4. Selection behavior:
   - Recommended default: clicking a result should center/fly to the POI and open the same popup/details flow that map clicks already use.
   - This preserves one details experience instead of inventing a second one.

### Proposed Changes
1. Create a typed POI discovery/query model for loaded map features.
   - Files:
     - `src/types.ts`
     - new `src/features/map/services/PoiSearchService.ts`
     - possibly `src/features/map/services/PoiDetailsService.ts`
   - Add a normalized client-side POI search item shape derived from the `places` source.
   - Include fields needed for search/filtering:
     - `id`
     - `title`
     - `category`
     - `subcategory`
     - `coordinates`
     - `address`
     - `website`
     - `opening_hours`
     - `hasPhoto`
     - `hasWebsite`
     - `isOpenNow` (best-effort)
   - Implement a small search/filter service that:
     - tokenizes title/category text,
     - applies category matching,
     - applies boolean filters,
     - sorts useful matches first.

2. Expose loaded POIs from the map layer to React state.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/components/MapView.tsx`
     - `src/shared/layouts/MainLayout.tsx`
   - Surface the current loaded/searchable POI collection from `useMapLogic`.
   - Keep it synchronized with the `places` source refresh lifecycle.
   - Avoid triggering extra network requests just to build the search list.

3. Add search/filter UI to the right sidebar.
   - Files:
     - `src/shared/components/sidebar/RightSidebar.tsx`
     - possibly new small sibling components under `src/shared/components/sidebar/right/`
   - Add:
     - search input for name/category text,
     - category dropdown or grouped selector,
     - toggles/checks for `has photo`, `has website`, `open now`,
     - results list using loaded POIs.
   - Keep existing icon asset browsing accessible; recommended default:
     - add a compact “mode” or section split inside the right sidebar,
     - do not remove the current icon workflow.

4. Connect search results back to map interaction.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/shared/layouts/MainLayout.tsx`
   - Clicking a result should:
     - move the map to the POI,
     - open the existing popup/details flow,
     - keep popup viewport fitting behavior intact.
   - Reuse existing popup generation instead of duplicating details UI.

5. Add robust coverage for loaded-POI search/filter combinations.
   - Files:
     - new `test/features/map/services/PoiSearchService.test.ts`
     - update `test/features/map/hooks/useMapLogic.test.ts`
     - update `test/e2e/features/MapStyles.feature` or add a dedicated POI search feature
     - update/add step definitions in `test/e2e/steps/`
   - Unit coverage should include:
     - name search,
     - category filter,
     - `has photo`,
     - `has website`,
     - `open now`,
     - mixed filter combinations,
     - absent-field combinations.
   - BDD should cover:
     - typing a query,
     - filtering down results,
     - selecting a result and opening the correct POI popup.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiSearchService.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. `npm run test:e2e:bdd -- --grep "POI search|Switching styles and interacting with map features"`
3. Manual sanity check:
   - load the map and wait for POIs,
   - search by name,
   - filter by category,
   - toggle `has photo`, `has website`, `open now`,
   - click a result and confirm the map navigates to that POI and opens the popup.

## Phase 18 Plan: First-Load POI Visibility Without Zoom (2026-03-15)

### Goal
Ensure POIs appear on the initial settled map view right after the map loads, without requiring the user to zoom or otherwise move the camera first.

### User Review Required
1. Initial POI refresh trigger:
   - Recommended default: keep the existing immediate POI refresh, but add one more startup refresh tied to the first stable map/style lifecycle event after the selected theme is painted.
   - This is safer than relying on a single early refresh because the new smooth first-paint flow can resolve before all POI source data is queryable.
2. Scope boundary:
   - Keep this phase focused on startup POI visibility only.
   - Do not change ongoing moveend/zoom refresh behavior unless needed to avoid duplicate work or flicker.

### Proposed Changes
1. Add a guaranteed post-initial-style POI refresh after first map/style readiness.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - possibly `src/features/map/services/MapLibreAdapter.ts`
   - Preserve the current eager `PoiService.refreshData(...)` call.
   - Add a second startup refresh on the first stable post-style event so POIs populate even when the first refresh runs before style/source queries are ready.
   - Keep existing debounced `moveend` refresh behavior unchanged for subsequent navigation.

2. Add a regression test for “POIs visible without zoom”.
   - Files:
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
     - optionally `test/features/map/hooks/useMapLogic.test.ts`
   - Cover the user path:
     - open the app,
     - wait for the map to finish booting,
     - verify POI features populate without triggering zoom or map movement.
   - Keep the test independent from popup interaction so it specifically guards initial POI visibility.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "POIs should appear without zooming after load|Switching styles and interacting with map features"`
3. Manual sanity check:
   - reload with a saved theme,
   - wait without touching the map,
   - confirm POI icons and labels appear on their own.

## Phase 17 Plan: First-Paint Selected Theme + Smooth Map Reveal (2026-03-15)

### Goal
Remove the remaining visual style-swap on refresh where the map still paints a generic/base style first and only then switches to the saved theme.

### User Review Required
1. First-paint strategy:
   - Recommended default: initialize MapLibre with the resolved selected render-style on the very first mount instead of always booting from the shared default base style and then calling `setStyle(...)`.
   - This is the cleanest fix because it removes the visible style swap instead of trying to mask it afterward.
2. Visual reveal strategy:
   - Recommended default: keep a very short, neutral map veil over the canvas until the first intended style is loaded enough to render stably, then fade the veil out.
   - This is a support layer, not the main fix.
   - Recommendation: combine “correct first style” + “brief smooth reveal”, rather than relying on hiding the problem behind a long skeleton.
3. Scope boundary:
   - Keep map center/zoom persistence and POI behavior unchanged in this phase unless needed to avoid a secondary visual jump.
   - Focus on style first paint and visual continuity only.

### Proposed Changes
1. Resolve the intended initial map style before creating the MapLibre instance.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - possibly `src/features/map/services/MapLibreAdapter.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
   - Load the shared base style only as an input for style resolution, not as the style the user actually sees on first paint.
   - Build the initial renderable style from:
     - saved/selected `mapStyleJson`,
     - fallback base style when needed for incomplete styles,
     - existing numeric/runtime sanitizers.
   - Pass that resolved style directly into `controller.initialize(...)`.
   - Avoid immediately calling `setStyle(...)` with the same style on first mount.

2. Distinguish first style mount from later style switches.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
   - Track whether the current style application is:
     - initial hydration,
     - later user-driven style switch.
   - Keep `setStyle(...)` for real style changes after the map already exists, but skip redundant “apply selected style again” work during the initial mount path.
   - Preserve existing popup cleanup, POI infrastructure, and palette refresh behavior after style changes.

3. Add a smooth reveal for the first correct style pass.
   - Files:
     - `src/features/map/components/MapView.tsx`
     - `src/features/map/hooks/useMapLogic.ts`
     - possibly `src/shared/layouts/MainLayout.tsx`
   - Expose a small readiness signal from map logic such as `isInitialVisualReady`.
   - Keep the map canvas visually muted or covered by a neutral overlay until the first intended style has emitted the necessary load/style events.
   - Fade that overlay away quickly so the user perceives one continuous reveal instead of a visible style replacement.

4. Extend regression coverage for the refresh-time map style reveal.
   - Files:
     - `test/features/map/hooks/useMapLogic.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add or update unit coverage to assert:
     - initial map creation uses the resolved selected style,
     - first mount does not perform an unnecessary immediate `setStyle(...)`,
     - later style switches still do call `setStyle(...)`.
   - Strengthen the reload-focused BDD path so it verifies:
     - the saved theme is active after refresh,
     - the auth shell does not flash,
     - the map canvas only becomes visible once the intended theme is ready enough to show.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.test.ts test/App.bootstrap.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Restoring the selected theme cleanly after reload|Switching styles and interacting with map features"`
3. Manual sanity check:
   - save/select a non-default theme,
   - refresh the page,
   - confirm the map no longer visibly paints the generic style before the selected one,
   - confirm the first reveal feels like one smooth load instead of a style swap.

## Phase 16 Plan: Softer Popup Loading + Clean Refresh Rehydration (2026-03-14)

### Goal
Polish two visible UX rough edges:
1. replace the current popup loading UI with a calmer, cleaner loading state that feels less noisy,
2. remove the refresh-time flicker where the app briefly shows the start/auth screen or a default theme before the saved theme and POI labels are restored.

### User Review Required
1. Popup loading treatment:
   - Recommended default: replace the current animated orbit + shimmer block with a quieter inline loading card built from subtle theme-colored skeleton rows and a compact status line.
   - Avoid playful or decorative animation here, because it draws too much attention inside an already small popup.
   - Recommendation: keep motion minimal and optional-looking, more like “content is filling in” than “loading widget”.
2. Refresh bootstrap behavior:
   - Recommended default: gate the main app render behind an explicit bootstrap-ready state that waits for:
     - auth state to initialize,
     - saved styles to load,
     - the active style to resolve.
   - During that short window, show either:
     - nothing but the app background, or
     - a neutral shell that matches the persisted app frame.
   - Recommendation: do not render `AuthScreen` or the default map layout until initialization is complete, so users never see the wrong screen/theme flash first.
3. Scope boundary:
   - Keep this phase focused on bootstrap polish and popup loading.
   - Do not change the actual saved-style selection behavior, map content generation flow, or auth capabilities unless needed to remove the visual flash.

### Proposed Changes
1. Replace the popup loading UI with a softer, less attention-grabbing placeholder.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Remove the current orbit + progress-bar style loading block.
   - Introduce a simpler loading section with:
     - concise copy,
     - a subtle theme-aware accent,
     - lightweight skeleton rows sized to the content that is about to appear.
   - Preserve stable height as much as practical so the popup does not jump dramatically when details arrive.
   - Update selectors/tests so they assert the new loading structure rather than the old orbit/shimmer markup.

2. Add explicit bootstrap readiness for auth/config initialization.
   - Files:
     - `src/features/auth/hooks/useAppAuth.ts`
     - `src/App.tsx`
     - `test/features/auth/components/AuthScreen.test.tsx` only if prop or gating expectations change
   - Add an `isAuthReady` or similarly named state that stays false until:
     - AI config has been loaded from storage,
     - host API-key availability check completes.
   - Prevent `AuthScreen` from rendering while auth initialization is still in flight.
   - Ensure the app only decides between auth screen and main layout after the auth layer is actually ready.

3. Add explicit bootstrap readiness for style/theme rehydration.
   - Files:
     - `src/features/styles/hooks/useStyleManager.ts`
     - `src/App.tsx`
     - `src/shared/layouts/MainLayout.tsx`
   - Add an `isStylesReady` or similarly named state that remains false until the saved styles / bundled defaults fallback path fully resolves.
   - Avoid rendering `MainLayout` with an empty styles array and a transient default theme before the persisted style set is known.
   - Ensure the active style is resolved once, then rendered once, instead of visually stepping through “default then saved”.
   - If helpful, use a lightweight app shell during bootstrap that matches the final app chrome so refresh feels continuous instead of reset.

4. Add regression coverage for the new loading and refresh behavior.
   - Files:
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
     - `test/features/auth/components/AuthScreen.test.tsx` or a nearby hook test if the readiness logic is extracted
   - Extend unit coverage to assert:
     - the old popup loading widget is gone,
     - the new loading block markup is present and stable,
     - auth/style readiness guards prevent premature screen selection.
   - Extend BDD to cover a refresh/bootstrap regression if practical in the current harness:
     - restore a saved non-default theme,
     - reload the page,
     - verify the app does not visibly route through the auth/start screen or render the default style before the saved style appears.
   - If a fully visual “no flash” assertion is too brittle for BDD, add deterministic guard assertions around the rendered bootstrap state and final selected theme state.

### Verification Plan
1. `npm test -- --run test/features/map/services/PopupGenerator.test.ts test/features/auth/components/AuthScreen.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Dismissing popup when zooming the map"`
3. Manual sanity check:
   - open a POI popup and confirm the new loading state feels quieter and cleaner,
   - refresh on a saved custom or bundled non-default theme,
   - verify the app does not flash the auth/start screen,
   - verify it does not briefly render the default theme before the saved theme and POI labels appear.

## Phase 15 Plan: Keep Popups Fully Visible + Theme-Aware Loading Motion + Button Layout Refresh (2026-03-14)

### Goal
Improve popup usability in four connected ways:
1. prevent newly opened POI popups from rendering partially outside the visible map viewport,
2. make the loading state feel intentional and theme-aware instead of static text,
3. revisit action-button sizing/layout so the popup reads cleaner across different content combinations and viewport sizes,
4. improve popup photo presentation so image resolution, framing, and height feel more appropriate for both the available source image and the selected POI category.

### User Review Required
1. Popup visibility behavior:
   - Recommended default: keep the popup open, but auto-pan the map just enough after render so the full popup frame fits inside the visible map canvas with a small safe margin.
   - Alternative: dynamically shrink the popup more aggressively near edges, but that tends to hurt readability and still fails for tall content.
   - Recommendation: prefer auto-pan/re-anchor over extra shrinking.
2. Theme-aware loading animation style:
   - Recommended default: use lightweight CSS-only motion derived from the active popup theme colors (for example shimmer / pulsing accent border / animated dots), not category-specific artwork or heavy animated assets.
   - This keeps the effect consistent with every map theme while staying fast and easy to test.
3. Button sizing/layout:
   - Recommended default: slightly reduce button height, keep a responsive 2-column grid when space allows, and collapse to 1 column only when the popup width is genuinely constrained.
   - Keep the Remix action visually distinct but not oversized relative to the link buttons.
4. Photo treatment:
   - Recommended default: make photo rendering category-aware and source-aware.
   - Example direction:
     - monuments / landmarks / parks / viewpoints can use a wider scenic crop,
     - cafes / bars / shops / services should use a shorter hero area so actions and facts stay visible,
     - low-resolution images should render smaller instead of being stretched into a blurry hero banner.
   - Recommendation: adapt display size from both the POI category and the chosen image candidate's intrinsic resolution.

### Proposed Changes
1. Keep popups within the visible map viewport after open and after async content expansion.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
     - `src/features/map/services/PopupGenerator.ts`
     - possibly `test/features/map/hooks/useMapLogic.test.ts` if a pure helper is extracted
   - After the popup is rendered and after async details/photo fallbacks mutate its size, measure the popup frame relative to the actual map container.
   - If the popup would be clipped by the top, left, right, or bottom edge, pan the map by the minimum required delta so the popup becomes fully visible.
   - Harden the viewport-fit path so it only measures the currently active popup element from the adapter, not any stale MapLibre popup nodes that may still linger in the DOM after re-render.
   - Treat popup-triggered `panBy` as an internal camera adjustment and suppress the corresponding `moveend` POI refresh so opening a popup does not feel like a map reload.
   - Re-run that visibility correction after:
     - the initial loading popup render,
     - enriched details render,
     - photo fallback swaps that can change popup height.
   - Keep the existing zoom-dismiss behavior intact.

2. Add theme-aware loading animation states to the popup.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - possibly `docs/features/poi-details-popup.md`
   - Replace the current plain loading block with a lightweight animated treatment using inline/CSS-safe primitives already compatible with exported popup markup.
   - Drive the animation appearance from the current popup theme colors so it harmonizes with bright, muted, dark, or novelty themes.
   - Ensure loading remains readable and does not create layout jumps when replaced by details.

3. Refresh popup action button sizing and responsiveness.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Rebalance button padding, min-heights, and grid widths so:
     - buttons do not dominate the popup,
     - labels fit more gracefully,
     - the Remix button feels related but secondary to the navigation links.
   - Verify the layout still works with:
     - 2 links,
     - 3 links,
     - 4 links,
     - loading/error states.

4. Revisit popup photo resolution and framing by category and source quality.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/services/PoiDetailsService.ts`
     - `src/types.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Derive a small media-presentation strategy from:
     - POI category,
     - popup width / viewport constraints,
     - image candidate intrinsic width/height when available,
     - image source confidence / thumbnail size.
   - Use that strategy to choose:
     - hero height / aspect ratio,
     - object-fit or object-position behavior,
     - whether a low-resolution image should render in a more compact frame.
   - Keep the behavior deterministic so test coverage stays practical.

5. Add regression coverage for viewport-fit, loading/button UI, and image presentation.
   - Files:
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
   - Extend BDD to cover:
     - opening a popup near an edge and verifying it remains fully visible within the map viewport,
     - the presence of animated loading UI before enriched details arrive,
     - updated button sizing/layout expectations,
     - photo frame behavior for at least one scenic category and one business-like category.
   - Extend unit tests to assert:
     - loading markup contains the new animation hooks,
     - button grid markup and sizing constraints remain stable,
     - optional sections do not break the revised layout,
     - category-aware image sizing decisions stay stable for low-res vs high-res candidates.

### Verification Plan
1. `npm test -- --run test/features/map/services/PopupGenerator.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|Dismissing popup when zooming the map"`
3. Manual sanity check:
   - open a popup near the top edge of the map,
   - confirm the map auto-pans so the popup is fully visible,
   - confirm the loading state animates in a theme-consistent way,
   - verify action buttons look balanced in both 2-link and 4-link cases,
   - verify a scenic POI and a business-like POI produce appropriately different photo treatments,
   - verify low-resolution photos are not stretched into oversized hero banners.

## Phase 14 Plan: Dismiss or Reanchor Popup on Zoom + BDD Regression Coverage (2026-03-14)

### Goal
Fix the popup behavior when the map viewport changes after a POI has been opened, so the popup does not remain stranded in an incorrect visual position during zoom interactions.

### User Review Required
1. Desired UX on zoom:
   - Preferred default: close the popup on zoom start / significant camera change, because the selected POI context becomes visually ambiguous once the viewport shifts dramatically.
   - Alternative: keep the popup but explicitly re-anchor and revalidate the selected feature on every zoom/move change.
2. Scope recommendation:
   - Implement the simpler, more reliable behavior first: dismiss the popup when the user zooms the map.
   - Add a BDD regression so this never comes back unnoticed.
3. No product copy changes are needed in this phase unless we discover a need for a small hint or animation.

### Proposed Changes
1. Update map popup lifecycle logic for camera changes.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
   - Review the popup binding and current MapLibre popup lifecycle.
   - Listen for zoom-driven camera changes such as `zoomstart`, `movestart`, or a similarly appropriate event.
   - Close the active popup when the viewport starts changing in a way that invalidates its current on-screen anchor.
   - Ensure cleanup removes listeners correctly so we do not leak handlers across map re-renders or style switches.

2. Preserve normal popup behavior outside zoom interactions.
   - Files:
     - `src/features/map/hooks/useMapLogic.ts`
     - possibly `src/features/map/services/PopupGenerator.ts` only if a tiny integration hook is needed
   - Confirm the popup still:
     - opens on POI click,
     - loads async details,
     - closes from the explicit close button,
     - survives unrelated operations that should not dismiss it.

3. Add BDD coverage for the zoom regression.
   - Files:
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Extend the existing popup scenario with:
     - opening a popup,
     - zooming the map,
     - asserting the popup is dismissed or no longer visible.
   - Prefer reusing the existing map-interaction helpers rather than introducing duplicate step logic.

4. Add targeted logic/unit coverage if the implementation extracts a reusable helper.
   - Files:
     - `test/features/map/services/*.test.ts` only if a pure helper is introduced
   - If the fix remains entirely event-driven inside the hook, BDD coverage is the main regression guard.

### Verification Plan
1. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features"`
2. `npm test -- --run test/features/map/services/PoiDetailsService.test.ts test/features/map/services/PopupGenerator.test.ts`
3. Manual sanity check:
   - open a POI popup,
   - zoom the map,
   - verify the popup no longer hangs in the old screen position.

## Phase 13 Plan: Pinned Google Exact Location + Nearby Commons Photo Discovery (2026-03-14)

### Goal
Reduce two remaining UX gaps in POI popups:
1. make `Open Exact Location` reliably open a pinned Google Maps coordinate instead of a bare map viewport with no obvious target,
2. increase free photo coverage again by searching geotagged Wikimedia Commons files near the POI, not only Wikipedia article thumbnails.

### User Review Required
1. Exact-location semantics:
   - Replace the current Google `map_action=map` URL with a coordinate-search URL so Google opens a pinned result for the exact latitude/longitude.
   - Keep the existing `Search in Google Maps` button for place-card discovery by name/address.
2. Photo confidence strategy:
   - Add nearby Wikimedia Commons geotagged image discovery as a last-resort fallback after direct OSM/Wikidata/Wikipedia-linked images.
   - Prefer conservative matching so we do not show a random nearby streetscape unless it is strongly tied to the POI by title or immediate proximity.
3. Scope boundary:
   - Keep this phase zero-key and browser-safe.
   - Do not introduce Google APIs, Foursquare, Yelp, or any token-based media provider in this pass.

### Proposed Changes
1. Improve the Google exact-location URL.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `src/types.ts`
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Replace the current exact-location deeplink with a Google search URL that uses only `lat,lng`.
   - Keep the button label explicit, but make the destination behave more like a pinned target and less like an unannotated map.
   - Adjust tests so `Search in Google Maps` and `Open Exact Location` assert different query semantics.

2. Add nearby Wikimedia Commons geotagged file discovery.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `src/types.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
   - When no direct or article-linked image exists, query Wikimedia Commons near the POI coordinates for geotagged file pages.
   - Resolve candidate thumbnails through the Commons API and score them by:
     - file title similarity to POI name,
     - distance from POI,
     - optional business/category hints where safe.
   - Only promote nearby Commons images when confidence clears a conservative threshold.

3. Improve photo fallback ordering and attribution.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `src/features/map/services/PopupGenerator.ts`
     - `docs/features/poi-details-popup.md`
   - Insert Commons geotagged candidates after direct/linked sources but before giving up on photos.
   - Preserve attribution to the exact Commons file page when a nearby file is selected.
   - Document that business-photo coverage is still limited by open-data availability even after this added fallback.

4. Expand verification for the new fallback layer.
   - Files:
     - `test/features/map/services/PoiDetailsService.test.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add unit coverage for:
     - exact-location link using coordinate search semantics,
     - nearby Commons candidate acceptance and rejection,
     - fallback ordering when Wikimedia Commons geotagged files beat “no photo”.
   - Add BDD assertions for:
     - Google exact-location href behavior,
     - continued Google search behavior,
     - popup photo rendering from a Commons geotagged fallback.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiDetailsService.test.ts test/features/map/services/PopupGenerator.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features"`
3. `npm run build`

## Phase 32 Plan: POI Dot Fallback for Missing Custom Icons + Clickable Label/Dot (2026-03-21)

### Goal
When a POI has a visible label but no usable custom icon image, show a simple themed dot in the same category/text color, and make both the dot area and the visible label reliably open the popup.

### User Review Required
1. Dot fallback visual:
   - Default assumption: filled circular dot using the POI/category text color, with the existing label halo color kept for consistency against the map.
2. Popup trigger scope:
   - Default assumption: click support should work on the fallback dot and on the visible POI label, not only on the hidden interaction circle.

### Proposed Changes
1. Mark POIs that have a usable custom icon image vs label-only fallback.
   - File: `src/features/map/services/PoiService.ts`
   - Extend collected POI feature properties with an explicit flag such as `hasCustomIconImage`.
   - Base this on the currently active icon catalog so the map can tell whether to render the symbol icon or fallback dot.

2. Add a visual fallback layer for POIs without custom icons.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Keep the existing category-specific symbol layers for POIs with custom icon images.
   - Add category-specific circle fallback layers filtered to POIs without a custom icon image.
   - Color the fallback dot from the same `textColor` already used for labels.
   - Preserve existing visibility filtering so hidden categories/subcategories still stay hidden without reloading data.

3. Make label/dot clicks open the popup reliably.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Expand popup click handling so it works not only from the invisible interaction circle, but also from the visible symbol/circle fallback layers where needed.
   - Keep popup behavior identical to current POI popup flow.

4. Add regression tests.
   - Files:
     - `test/features/map/services/PoiService.test.ts`
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Cover:
     - POI with custom icon keeps icon behavior,
     - POI without custom icon gets fallback dot,
     - clicking fallback dot opens popup,
     - clicking visible label opens popup.

### Verification Plan
1. Targeted unit tests:
   - `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. Targeted BDD:
   - `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features|POI fallback dot opens popup"`

## Phase 12 Plan: Honest Google UX + Zero-Key Nearby Wiki Photo Discovery (2026-03-14)

### Goal
Address the two remaining usability gaps in POI popups:
1. make the Google fallback honest and less misleading when we cannot guarantee a specific Google place card without a Google Place ID,
2. increase free photo coverage for POIs by discovering nearby Wikimedia/Wikipedia article images using coordinates, without introducing Google APIs or any new third-party token requirement.

### User Review Required
1. Google fallback semantics:
   - Replace the current implication of "open exact details in Google" with two explicit actions:
     - `Search in Google Maps` for best-effort place lookup,
     - `Open exact location` for a guaranteed map point by coordinates.
   - This is more truthful than pretending the current search URL targets a definitive place card.
2. Photo confidence strategy:
   - Use nearby Wikipedia article discovery only when the article is geographically close and name/category similarity is reasonable.
   - Prefer no photo over a clearly unrelated photo.
3. Scope boundary:
   - Keep this phase zero-key.
   - Do not add Mapillary or other token-backed providers in this pass.

### Proposed Changes
1. Split Google fallback into two explicit intents.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `src/types.ts`
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Keep the current Google search URL, but relabel it to `Search in Google Maps`.
   - Add a separate exact-point URL using Google Maps `map_action=map` with `center=lat,lng` and zoom.
   - Render the two actions distinctly so users understand:
     - one is search-based and may land on partial matches,
     - one is coordinate-accurate but may not show a business details card.

2. Add zero-key nearby Wikipedia image discovery.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
   - When direct POI-linked photos are missing, call Wikipedia `geosearch` around the POI coordinates.
   - For the top nearby pages, resolve page thumbnails via `PageImages`.
   - Score candidates using:
     - distance from POI,
     - title similarity to POI name,
     - category/class hints (for example, monuments/parks/schools are better candidates than random nearby neighborhoods).
   - Only promote a nearby article photo when the confidence clears a conservative threshold.

3. Improve UI wording and fallback prioritization.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `docs/features/poi-details-popup.md`
   - Update action labels to reduce false expectations.
   - Keep photo attribution aligned with whichever nearby wiki/commons candidate is selected.
   - Document that broad image coverage for commercial POIs remains structurally limited in open data.

4. Expand coverage for the new behavior.
   - Files:
     - `test/features/map/services/PoiDetailsService.test.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add unit coverage for:
     - Google search URL vs exact-location URL,
     - nearby geosearch promotion when title/distance are a good match,
     - nearby geosearch rejection when the article is too generic or too far away.
   - Add BDD assertions for:
     - `Search in Google Maps`,
     - `Open exact location`,
     - popup photo appearing from nearby wiki discovery when direct POI photos are absent.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiDetailsService.test.ts test/features/map/services/PopupGenerator.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features"`
3. `npm run build`

## Phase 11 Plan: Best-Effort Free Photo Enrichment + More Precise Google Fallback (2026-03-14)

### Goal
Maximize relevant POI photos using only free/open sources, eliminate broken-image popup states, and make the Google fallback open the most specific place view possible without relying on Google Places API or paid Google place IDs.

### User Review Required
1. Photo sourcing strategy:
   - Prioritize POI-linked factual sources first (`image`, `wikimedia_commons`, `wikidata`, `wikipedia` thumbnails, `mapillary`) before any generic search-style imagery source.
   - Avoid speculative stock-photo search by default if it cannot be tied to the exact POI with high confidence.
2. Google fallback strategy:
   - Keep Google as a best-effort fallback only.
   - Prefer a more specific query built from exact address and coordinates, but do not introduce any Google API dependency or key.
3. Popup behavior:
   - Hide failed images and transparently fall back to the next candidate image instead of rendering a broken image frame.

### Proposed Changes
1. Expand POI photo candidate pipeline with ranked free sources.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `src/types.ts`
   - Replace the single `photoUrl` approach with a ranked list of photo candidates and a resolved primary image.
   - Add candidate extraction in this order:
     - direct `image` URL from OSM tags,
     - Wikimedia Commons file from `wikimedia_commons`,
     - Wikipedia summary thumbnail,
     - Wikidata `P18` image,
     - OSM `mapillary` / `contact:mapillary` identifiers when present,
     - optional nearby Mapillary imagery fallback by coordinates if a POI-specific image is still missing.
   - Normalize attribution/source metadata per candidate so the UI can credit the selected image correctly.

2. Make Wikimedia image resolution more robust.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
   - Stop relying only on raw Commons `Special:FilePath`.
   - Resolve Commons images through a thumbnail-friendly API path when possible, preserving a stable file-page attribution link.
   - Validate and sanitize candidate URLs so obviously broken or unsupported URLs are skipped before rendering.

3. Improve popup image resilience and presentation.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
   - Render the best current photo candidate only if it is valid.
   - Add runtime fallback behavior so a failed image load automatically swaps to the next candidate or removes the image block.
   - Keep the popup compact while ensuring attribution still maps to the active image source.

4. Tighten Google Maps fallback links without using Google APIs.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts`
     - `test/features/map/services/PoiDetailsService.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Build a more precise details-search URL from:
     - POI title,
     - normalized street address,
     - exact coordinates appended to the query,
     - consistent UTM markers for debugging.
   - Add a second exact-location fallback URL when search confidence is low, so users can still land on the precise map point.
   - Keep the existing button label user-friendly while ensuring tests verify the richer URL structure.

5. Add coverage for photo-source combinations and failure handling.
   - Files:
     - `test/features/map/services/PoiDetailsService.test.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add unit cases for:
     - Wikimedia candidate selection,
     - Wikipedia thumbnail fallback,
     - Wikidata image fallback,
     - Mapillary-linked image fallback,
     - broken-primary-image to next-candidate behavior,
     - no-valid-image behavior.
   - Extend BDD with representative states:
     - POI with valid wiki photo,
     - POI with broken primary photo and successful fallback,
     - POI with no photo but valid external links,
     - Google link built from normalized address plus coordinates.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiDetailsService.test.ts test/features/map/services/PopupGenerator.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features"`
3. `npm run build`

## Phase 10 Plan: Compact Popup Layout + Exhaustive Field-Combination Coverage (2026-03-14)

### Goal
Reduce POI popup footprint so long summaries/photos do not overwhelm the map, while adding strong automated coverage for popup field presence/absence combinations and the resulting rendered layout.

### User Review Required
1. Compactness strategy:
   - Prefer a bounded popup width with tighter spacing, summary truncation, and a capped photo height instead of allowing the card to grow with content.
2. Coverage strategy:
   - Cover all optional field combinations at the renderer/model level with generated matrix tests, and keep end-to-end visual checks focused on representative compact/expanded states.

### Proposed Changes
1. Compact popup layout rules.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
   - Constrain popup width to a mobile/desktop-friendly maximum.
   - Reduce spacing and image footprint.
   - Clamp long summary content to a small number of lines by default.
   - Limit photo height and avoid oversized action rows.
   - Preserve accessibility and link behavior.

2. Extract popup section/view derivation for exhaustive testing.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `test/features/map/services/PopupGenerator.test.ts`
   - Add a small pure helper that derives which popup sections should render from feature/details inputs.
   - Use generated tests to verify all presence/absence combinations of optional sections:
     - summary,
     - photo,
     - address,
     - hours,
     - cuisine,
     - brand,
     - operator,
     - phone,
     - website,
     - Wikipedia link,
     - OSM link,
     - loading state,
     - error state.
   - Assert both section visibility and key compact-layout markers in rendered HTML.

3. Add representative UI/BDD coverage for view states.
   - Files:
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Add mocked popup states for:
     - minimal factual popup,
     - photo + summary popup,
     - loading state,
     - error/fallback state.
   - Add explicit BDD assertions for external action links:
     - `Open in Google Maps`,
     - `OpenStreetMap`,
     - `Wikipedia` when available,
     - absence of `Wikipedia` when no wiki source exists.
   - Verify popup remains compact enough and only shows controls/rows relevant to the current state.

### Verification Plan
1. `npm test -- --run test/features/map/services/PopupGenerator.test.ts test/features/map/services/PoiDetailsService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Map Style Interaction"`
3. `npm run build`

## Phase 9 Plan: Free POI Details Enrichment + Google Fallback (2026-03-14)

### Goal
Enrich POI popups with as much free factual metadata as possible from OpenStreetMap-related sources, plus optional Wikimedia imagery/encyclopedic context, while providing a reliable Google Maps fallback link for ratings, reviews, and richer photo galleries that are not available in open data.

### User Review Required
1. Public API usage:
   - Use public Nominatim lookups only on explicit popup open, with in-memory caching and request throttling, so we stay within low-volume usage expectations.
2. Data expectations:
   - Ratings/reviews will not be shown inline unless a free factual source exists for a given POI; the popup will instead expose a clear `Open in Google Maps` action for those details.
3. Popup behavior:
   - Show the current lightweight popup immediately, then progressively hydrate it with fetched details and photos when available.

### Proposed Changes
1. Add a POI details enrichment service and free-source adapters.
   - Files:
     - `src/features/map/services/PoiDetailsService.ts` (new)
     - `src/features/map/services/PoiService.ts`
     - `src/types.ts`
   - Preserve more source identity in `places` features (`osm_id`, `osm_type`, class/subclass, address fragments, contact tags when present).
   - Add a details service that:
     - prefers Nominatim `lookup` when `osm_id/osm_type` is available,
     - falls back to reverse/details by coordinates when identity is incomplete,
     - requests `addressdetails`, `namedetails`, and `extratags`,
     - extracts website, phone, opening hours, Wikipedia/Wikidata/image hints,
     - builds a normalized popup-details model,
     - caches results per POI and throttles Nominatim requests.
   - Add free image enrichment from Wikimedia when `image`, `wikimedia_commons`, or `wikidata` references are available.

2. Upgrade popup rendering to support progressive details and external links.
   - Files:
     - `src/features/map/services/PopupGenerator.ts`
     - `src/features/map/hooks/useMapLogic.ts`
   - Render richer popup sections for:
     - formatted address,
     - phone / website / opening hours,
     - factual source links (OSM / Wikipedia when available),
     - photo preview when a free image is available,
     - loading / unavailable states for async enrichment.
   - Re-render the active popup after enrichment completes without breaking close/remix behavior.
   - Add a robust Google Maps deep-link builder that tries the most specific query possible from the POI name, address, and coordinates.

3. Cover behavior with focused tests and documentation.
   - Files:
     - `test/features/map/services/PopupGenerator.test.ts`
     - `test/features/map/services/PoiService.test.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
     - `docs/features/poi-details-popup.md` (new)
   - Add unit coverage for normalized details extraction, popup rendering with enriched metadata, and Google fallback link generation.
   - Extend popup BDD expectations so the UI verifies enriched details blocks/links in a mocked scenario.
   - Document the feature, free-data limitations, and fallback behavior.

### Verification Plan
1. `npm test -- --run test/features/map/services/PopupGenerator.test.ts test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. `npm run test:e2e:bdd -- --grep "Map popup functionality"`
3. `npm run build`

## Phase 8 Plan: Full Provider BDD Matrix for Icon Modes (2026-02-28)

### Goal
Close the remaining end-to-end coverage gaps so Gemini and OpenAI icon generation modes are exercised across success, hard-failure, transient retry, repair, and usable-coverage scenarios.

### Proposed Changes
1. Expand invocation-accounting BDD scenarios.
   - Files:
     - `test/e2e/features/IconGenerationModes.feature`
     - `test/e2e/steps/IconGenerationMode.steps.ts`
   - Add the missing OpenAI cases:
     - atlas hard failure without per-icon fallback,
     - atlas transient 429 retry,
     - auto full repair pass,
     - auto partial repair pass,
     - auto persistent partial failure,
     - batch create failure.
   - Align OpenAI route mocks so async batch creation failures can be simulated deterministically.

2. Expand usable-coverage BDD scenarios.
   - Files:
     - `test/e2e/features/IconUsableCoverage.feature`
     - `test/e2e/steps/IconGenerationMode.steps.ts`
   - Mirror the recovery/coverage matrix for OpenAI:
     - atlas success/error/rate-limit,
     - auto full recovery / partial recovery / persistent partial / hard failure,
     - batch success / batch create failure.

### Verification Plan
1. `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting|Icon Usable Coverage Recovery"`

## Phase 7 Plan: True OpenAI Batch Transport + Provider-Aware Mode UX (2026-02-26)

### Goal
Replace OpenAI pseudo-batch with true OpenAI Batch API transport for icon generation and make icon generation mode UX provider-aware with explicit behavior/cost descriptions.

### Proposed Changes
1. OpenAI true async batch transport.
   - Files:
     - `src/features/ai/services/openai/openaiBatchTransport.ts`
     - `src/features/ai/services/OpenAIService.ts`
   - Implement real `/v1/files` upload + `/v1/batches` create + `/v1/batches/{id}` polling + `/v1/files/{id}/content` output parsing.
   - Keep shared orchestration in `AbstractAiService`; provider service only wires transport and error adapters.

2. Provider-aware icon mode configuration and descriptions.
   - Files:
     - `src/constants/aiConstants.ts`
     - `src/shared/components/sidebar/left/AiSettingsPanel.tsx`
     - `src/features/auth/components/AuthScreen.tsx`
   - Add provider-supported icon mode list helper.
   - Show only supported modes in dropdown.
   - Show provider-specific “how it works + cost” descriptions.

3. Test coverage updates.
   - Files:
     - `test/e2e/features/IconGenerationModes.feature`
     - `test/e2e/steps/IconGenerationMode.steps.ts`
     - `test/constants/aiConstants.test.ts`
     - `test/shared/components/AiSettingsPanel.test.tsx`
     - `test/features/auth/components/AuthScreen.test.tsx`
   - Extend OpenAI BDD mocks and assertions for true batch calls.
   - Verify provider-aware description rendering.

### Verification Plan
1. `npm test -- --run test/features/ai/services/OpenAIService.test.ts test/features/ai/services/GeminiService.test.ts test/features/ai/services/AiFactory.test.ts test/constants/aiConstants.test.ts test/shared/components/AiSettingsPanel.test.tsx test/features/auth/components/AuthScreen.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`

## Phase 5 Plan: Thin Provider Services via Shared Chunk Orchestration (2026-02-26)

### Goal
Reduce provider-service size and duplication by moving remaining reusable chunk processing into `AbstractAiService` so `GeminiService` and `OpenAIService` only wire provider transport/error adapters.

### User Review Required
1. Provider boundary:
   - Keep provider services focused on provider APIs, error parsing, and adapter wiring.
2. Shared behavior:
   - Keep async chunk polling/waiting/retry mapping and sequential fallback chunk behavior centralized in abstract base logic.

### Proposed Changes
1. Add shared chunk helpers in abstract base.
   - File: `src/features/ai/services/AbstractAiService.ts`
   - Add reusable helpers for:
     - async transport chunk execution + response-to-icon mapping,
     - sequential per-icon chunk fallback with shared cooldown handling.

2. Thin OpenAI async chunk fallback.
   - File: `src/features/ai/services/OpenAIService.ts`
   - Replace local sequential chunk loop with shared abstract helper call.

3. Thin Gemini service and extract provider adapters.
   - Files:
     - `src/features/ai/services/GeminiService.ts`
     - `src/features/ai/services/gemini/geminiErrors.ts` (new)
     - `src/features/ai/services/gemini/geminiBatchTransport.ts` (new)
   - Move Gemini error parsing and batch transport mapping out of service file.
   - Use shared abstract async transport chunk helper in Gemini mode config.

### Verification Plan
1. `npm test -- --run test/features/ai/services/GeminiService.test.ts test/features/ai/services/OpenAIService.test.ts test/features/ai/services/AiFactory.test.ts`
2. `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`

## Phase 6 Plan: OpenAI Mode-Config Parity + Scenario Matrix (2026-02-26)

### Goal
Align OpenAI icon pipeline config shape and execution path with Gemini so both providers use the same abstract orchestration for async icon chunks, atlas async batching, retries, and repair flows.

### Proposed Changes
1. OpenAI provider adapter parity.
   - Files:
     - `src/features/ai/services/OpenAIService.ts`
     - `src/features/ai/services/openai/openaiErrors.ts` (new)
     - `src/features/ai/services/openai/openaiBatchTransport.ts` (new)
   - Add OpenAI `toUserFacingError` adapter.
   - Add transport-backed `asyncIconChunk` path via shared abstract runner.
   - Add `asyncAtlas` config path and keep retry/cooldown knobs aligned.
   - Keep provider-only responsibilities to HTTP request/response adapters.

2. BDD parity coverage for OpenAI modes.
   - Files:
     - `test/e2e/features/IconGenerationModes.feature`
     - `test/e2e/steps/IconGenerationMode.steps.ts`
   - Add mode scenarios for OpenAI (`atlas`, `auto`, `batch-async`) and classify OpenAI image invocations by atlas vs per-icon prompts.

### Verification Plan
1. `npm test -- --run test/features/ai/services/OpenAIService.test.ts test/features/ai/services/GeminiService.test.ts test/features/ai/services/AiFactory.test.ts`
2. `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`

## Phase 3 Plan: Shared Image Transport Policy in Abstract Service (2026-02-25)

### Goal
Remove remaining provider duplication around image pacing, retry/backoff, and cooldown circuit-breaker behavior by centralizing this policy in `AbstractAiService`, while keeping provider-specific API transport implementations separate.

### Proposed Changes
1. Add shared image transport policy helpers.
   - File: `src/features/ai/services/AbstractAiService.ts`
   - Add reusable methods for:
     - image request pacing (`waitForImageRequestSlot`),
     - cooldown state (`isImageRateLimited`, `getImageRateLimitRemainingMs`, `activateImageRateLimitCooldown`),
     - retry backoff (`computeRateLimitBackoffMs`),
     - unified rate-limit retry executor (`runWithImageRateLimitRetries`).

2. Migrate OpenAI service to shared policy.
   - File: `src/features/ai/services/OpenAIService.ts`
   - Remove local duplicate pacing/cooldown/backoff fields and helpers.
   - Route `generateImageDataUrl` through abstract retry executor.
   - Keep OpenAI-specific auth handling and payload parsing in provider methods.

3. Migrate Gemini service to shared policy.
   - File: `src/features/ai/services/GeminiService.ts`
   - Remove local duplicate pacing/cooldown/backoff fields and helpers.
   - Route image and async-batch creation retries through abstract retry executor.
   - Keep Gemini-specific error envelope parsing and async batch polling transport logic provider-side.

4. Validation.
   - Re-run focused AI service unit tests plus icon-mode BDD accounting suite to confirm behavior parity.

### Verification Plan
1. `npm test -- --run test/features/ai/services/OpenAIService.test.ts test/features/ai/services/GeminiService.test.ts test/features/ai/services/AiFactory.test.ts`
2. `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. `npm run build`

## Phase 4 Plan: Provider Adapter Architecture (2026-02-25)

### Goal
Enforce clean provider boundaries so provider services implement only transport adapters (text/image/batch), while shared orchestration (retry, cooldown, chunking, atlas repair, async-batch waiting/polling) lives in `AbstractAiService`.

### Proposed Changes
1. Add normalized provider async-batch contract in abstract service.
   - File: `src/features/ai/services/AbstractAiService.ts`
   - Introduce normalized async batch types and a shared `runProviderAsyncImageBatch(...)` method handling:
     - create with shared retry/cooldown policy,
     - polling loop and timeout,
     - rate-limit aware poll backoff,
     - terminal state handling,
     - cleanup in `finally`.

2. Rewire Gemini batch paths to shared batch runner.
   - File: `src/features/ai/services/GeminiService.ts`
   - Replace local batch wait/poll/cleanup loops with provider adapter functions that map Gemini batch payloads to normalized state/response shapes.
   - Keep only Gemini-specific API calls and response extraction in provider code.

3. Keep OpenAI adapter boundary explicit.
   - File: `src/features/ai/services/OpenAIService.ts`
   - No behavior change; ensure OpenAI remains transport-only for text/image and uses shared orchestration path.

### Verification Plan
1. `npm test -- --run test/features/ai/services/OpenAIService.test.ts test/features/ai/services/GeminiService.test.ts test/features/ai/services/AiFactory.test.ts`
2. `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. `npm run build`

## Parity Plan: OpenAI Rate-Limit + Circuit Breaker Logic (2026-02-25)

### Goal
Bring OpenAI provider transport behavior to parity with Gemini for image generation resilience: pacing, retry/backoff, cooldown circuit breaker, and mode-level skip behavior when rate-limited.

### Proposed Changes
1. OpenAI image transport resilience:
   - File: `src/features/ai/services/OpenAIService.ts`
   - Add request pacing, transient 429 retry with exponential backoff+jitter, cooldown activation after retry exhaustion, and cooldown checks before new image work.
2. Mode handler parity for OpenAI:
   - File: `src/features/ai/services/OpenAIService.ts`
   - Wire `isRateLimitActive`/`onRateLimitSkip` into shared mode engine so per-icon and batch-like chunk flow stop burning quota during cooldown windows.
3. Add OpenAI service unit tests:
   - File: `test/features/ai/services/OpenAIService.test.ts` (new)
   - Cover invalid key, per-icon cap, transient 429 retry, and cooldown activation behavior.

### Verification Plan
1. `npm test -- --run test/features/ai/services/OpenAIService.test.ts test/features/ai/services/GeminiService.test.ts test/features/ai/services/AiFactory.test.ts`
2. `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. `npm run build`

## Architecture Plan: Provider-Agnostic Mode Engine (2026-02-25)

### Goal
Ensure icon generation modes (`auto`, `batch-async`, `atlas`, `per-icon`) run through one shared orchestration path independent of provider so adding a new provider does not duplicate full service logic.

### User Review Required
1. Mode parity contract:
   - Keep mode behavior/messages consistent across Gemini and OpenAI through shared orchestration.
2. Provider boundary:
   - Providers should implement transport/capability methods only (text/image + optional async batch transport), while the shared base controls mode flow.

### Proposed Changes
1. Shared mode pipeline in abstract base.
   - File: `src/features/ai/services/AbstractAiService.ts`
   - Add provider-agnostic icon mode orchestration helper:
     - canonical category normalization,
     - per-icon budget cap,
     - mode routing (`auto`, `batch-async`, `atlas`, `per-icon`),
     - fallback behavior for unsupported async batch,
     - progress logging and icon finalization.

2. Gemini service consumes shared mode engine.
   - File: `src/features/ai/services/GeminiService.ts`
   - Replace local mode branching in `generateMapTheme` with shared helper calls.
   - Keep Gemini-specific batch transport and rate-limit circuit breaker logic as provider transport details.

3. OpenAI service consumes shared mode engine.
   - File: `src/features/ai/services/OpenAIService.ts`
   - Replace local mode branching in `generateMapTheme` with shared helper calls.
   - Add provider-side batch-mode transport implementation (chunked + retry) so `batch-async` path is handled through the same engine.

4. Verification updates.
   - Re-run unit and BDD suites that validate mode behavior and invocation accounting.

### Verification Plan
1. Targeted unit tests:
   - `npm test -- --run test/features/ai/services/GeminiService.test.ts test/features/ai/services/AiFactory.test.ts test/constants/aiConstants.test.ts test/features/auth/components/AuthScreen.test.tsx test/shared/components/AiSettingsPanel.test.tsx`
2. BDD mode accounting suite:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. Build sanity:
   - `npm run build`

## Refactor Plan: Shared AI Base + OpenAI BDD Coverage (2026-02-25)

### Goal
Extract cross-provider AI service logic into a reusable abstract base so Gemini/OpenAI/future providers share one implementation path for theme JSON parsing, base style compilation, icon prompt construction, chunking, per-icon budgets, and background removal. Add BDD coverage to validate the new OpenAI provider runtime path.

### User Review Required
1. Refactor scope:
   - Move shared behavior into `AbstractAiService` and make provider services consume inherited helpers.
2. BDD scope:
   - Add provider-level invocation coverage for OpenAI endpoints without changing existing Gemini invocation accounting scenarios.

### Proposed Changes
1. Service abstraction alignment.
   - Files: `src/features/ai/services/AbstractAiService.ts`, `src/features/ai/services/GeminiService.ts`, `src/features/ai/services/OpenAIService.ts`
   - Ensure Gemini and OpenAI both extend the abstract service and call inherited helper methods (`buildThemeSystemInstruction`, `tryParseJson`, `buildThemeVisualPackage`, prompt builders, chunking, per-icon budget, background removal).

2. Provider BDD coverage for OpenAI.
   - Files: `test/e2e/features/IconGenerationModes.feature`, `test/e2e/steps/IconGenerationMode.steps.ts`
   - Add OpenAI API mocks (`/v1/chat/completions`, `/v1/images/generations`).
   - Add scenario verifying generation completes and invocation counts match expected per selected mode.

3. Keep backward safety around current modes.
   - Ensure existing `auto` / `batch-async` / `atlas` / `per-icon` behavior and counters remain unchanged for Gemini scenarios.

### Verification Plan
1. Targeted unit tests:
   - `npm test -- --run test/features/ai/services/AiFactory.test.ts test/features/ai/services/GeminiService.test.ts test/constants/aiConstants.test.ts test/features/auth/components/AuthScreen.test.tsx test/shared/components/AiSettingsPanel.test.tsx`
2. BDD feature slice:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. Build sanity:
   - `npm run build`

## Feature Plan: True Gemini Batch API + Icon Reliability + Cost Controls (2026-02-22)

### Goal
Implement a real async Gemini Batch API pipeline for icon generation so large POI sets (139+) are generated reliably, cheaply, and with bounded request behavior.

### User Review Required
1. Execution scope:
   - Deliver end-to-end now: new `batch-async` mode, upgraded `auto` strategy, retry round for failed icons, and popup/icon fallback correctness fix.
2. Product default:
   - Switch default icon generation mode to Batch API first (`batch-async`) for cheaper async generation by default.

### Proposed Changes
1. Add true Batch API mode in AI config and UI.
   - Files: `src/types.ts`, `src/constants/aiConstants.ts`, `src/features/auth/components/AuthScreen.tsx`, `src/shared/components/sidebar/left/AiSettingsPanel.tsx`
   - Add `iconGenerationMode = 'batch-async'` option with explicit label.
   - Keep existing modes (`auto`, `atlas`, `per-icon`) for controlled fallback/testing.

2. Implement Gemini async batch icon pipeline.
   - File: `src/features/ai/services/GeminiService.ts`
   - Use `client.batches.create(...)` + `client.batches.get(...)` polling with terminal-state handling.
   - Submit inlined per-icon requests in bounded chunks (to avoid oversized payloads).
   - Parse inlined responses deterministically by request order.
   - Preserve invalid-key and 429 protections with user-facing errors.

3. Add failed-icon retry rounds (batch-first).
   - File: `src/features/ai/services/GeminiService.ts`
   - Collect failed/missing icons after first pass.
   - Re-run failed icons in one or more compact async batch rounds.
   - Cap retry rounds and per-round icon volume to keep spend bounded.

4. Upgrade `auto` orchestration for reliability.
   - File: `src/features/ai/services/GeminiService.ts`
   - Prefer true batch path first.
   - If batch path fails or returns partial output, use bounded fallback path (atlas/per-icon) instead of silently completing with empty icons.

5. Fix wrong-icon fallback behavior in POI mapping.
   - File: `src/features/map/services/poiIconResolver.ts`
   - Stop returning arbitrary first available icon when no matching icon exists.
   - Prefer deterministic fallback key (`Landmark`) to avoid mismatched popup/map icon semantics.

6. Expand automated coverage (unit + BDD impact points).
   - Files: `test/features/ai/services/GeminiService.test.ts`, `test/constants/aiConstants.test.ts`, `test/features/map/services/poiIconResolver.test.ts`, `test/e2e/steps/IconGenerationMode.steps.ts`, `test/e2e/steps/General.steps.ts`, `test/e2e/features/IconGenerationModes.feature`
   - Add tests for async batch success/failure/polling/retry behavior.
   - Update icon mode parsing/assertions for new `batch-async` label/mode.
   - Keep invocation accounting deterministic under mocked network routes.

### Verification Plan
1. Targeted unit tests:
   - `npm test -- --run test/features/ai/services/GeminiService.test.ts test/constants/aiConstants.test.ts test/features/map/services/poiIconResolver.test.ts test/shared/components/AiSettingsPanel.test.tsx test/features/auth/components/AuthScreen.test.tsx`
2. BDD icon mode suite:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. Full unit sanity:
   - `npm test -- --run`
4. Manual sanity:
   - Generate a theme with real API and verify:
     - icon generation logs show async batch creation/polling/completion,
     - custom icons appear in sidebar/map/popup (not mismatched),
     - network is batch-oriented (not one request per icon in standard sync path).

## Hotfix Plan: POI Refresh Churn & Console Spam (2026-02-20)

### Goal
Reduce runtime map churn and console noise caused by repeated POI refreshes that rebuild and push identical GeoJSON payloads.

### User Review Required
1. Execution scope:
   - Apply all four optimizations in one pass: dedupe updates, stabilize props, throttle moveend refresh, and lower log verbosity.

### Proposed Changes
1. Dedupe `places` source updates for identical POI snapshots.
   - File: `src/features/map/services/PoiService.ts`
   - Build deterministic feature signature and skip `setGeoJsonSourceData` when unchanged for the same map instance.
   - Keep refresh logic intact for real data/color/icon changes.

2. Stabilize `popupStyle` (and empty icon fallback object) references.
   - File: `src/shared/layouts/MainLayout.tsx`
   - Memoize normalized popup style before passing to `MapView`.
   - Avoid creating a fresh empty icon object on each render.

3. Throttle/debounce move-end driven POI refreshes.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Debounce `moveend` refresh calls to prevent burst updates during rapid map interactions.

4. Lower high-frequency POI logs to debug level.
   - File: `src/features/map/services/PoiService.ts`
   - Convert frequent `info` messages to `debug` and add explicit debug message for skipped unchanged updates.

5. Add regression tests for dedupe behavior.
   - File: `test/features/map/services/PoiService.test.ts`
   - Verify repeated identical refreshes do not re-write source data.
   - Verify changes that affect rendered POI properties still trigger source updates.

### Verification Plan
1. Targeted tests:
   - `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. Full unit suite:
   - `npm test -- --run`
3. Manual sanity:
   - Pan/zoom map in browser with DevTools open.
   - Confirm POI logs are no longer flooding at `info` level.
   - Confirm POI icons/labels still update when theme/icons change.

## Hotfix Plan: Gemini Image 429 Rate-Limit Resilience (2026-02-20)

### Goal
Prevent icon generation failures when Gemini image model returns `429 Too Many Requests` / `RESOURCE_EXHAUSTED`.

### User Review Required
1. Reliability preference:
   - Favor stable generation over peak throughput by pacing per-icon requests and adding automatic retries for transient rate limits.

### Proposed Changes
1. Add explicit retry/backoff handling for transient rate-limit failures.
   - File: `src/features/ai/services/GeminiService.ts`
   - Detect `429`, `RESOURCE_EXHAUSTED`, and related rate-limit signals.
   - Retry image generation calls with exponential backoff + jitter.

2. Pace image requests to avoid bursty traffic.
   - File: `src/features/ai/services/GeminiService.ts`
   - Enforce minimum spacing between image model requests in a generation run.

3. Remove bursty per-batch parallel icon requests.
   - File: `src/features/ai/services/GeminiService.ts`
   - Process each icon request sequentially within batch loop to avoid 64-way fallback spikes.

4. Add regression coverage.
   - File: `test/features/ai/services/GeminiService.test.ts`
   - Add test ensuring an image-model 429 is retried and eventually succeeds.

### Verification Plan
1. Targeted tests:
   - `npm test -- --run test/features/ai/services/GeminiService.test.ts`
2. Full unit suite:
   - `npm test -- --run`
3. Manual check:
   - Generate a theme with real API and inspect Network tab for reduced immediate 429 failures.
   - Confirm generation completes even when transient 429 occurs.

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

## Feature Plan: Split Text/Image Model Configuration (2026-02-20)

### Goal
Use explicit Gemini model selection per workload:
1. Text model for theme/style JSON generation.
2. Image model for icon/atlas generation.
3. Remove legacy single-model config path and keep only explicit text/image model fields.

### User Review Required
1. UX scope:
   - Add separate dropdowns in both onboarding (`AuthScreen`) and sidebar AI settings.

### Proposed Changes
1. Extend AI config schema.
   - Files: `src/types.ts`, `src/constants/aiConstants.ts`, `src/features/auth/hooks/useAppAuth.ts`
   - Add `textModel` and `imageModel`.
   - Remove legacy `model` field from runtime config.
   - Enforce strict config sanitization: no migration/fallback from legacy single-model key.

2. Route models correctly in service layer.
   - Files: `src/features/ai/services/AiFactory.ts`, `src/features/ai/services/GeminiService.ts`
   - Pass text model for map/theme generation calls.
   - Pass image model for icon and atlas generation calls.

3. Update UI with two model selectors.
   - Files: `src/features/auth/components/AuthScreen.tsx`, `src/shared/components/sidebar/left/AiSettingsPanel.tsx`, and prop plumbing through layout/app files.
   - Add `Text Model` and `Image Model` dropdowns.

4. Update tests and BDD fixtures.
   - Files in `test/**` where `AiConfig` is constructed.
   - Ensure fixtures include both models and UI tests still validate dropdown-close behavior.

### Verification Plan
1. Targeted tests:
   - `npm test -- --run test/shared/components/AiSettingsPanel.test.tsx test/features/auth/components/AuthScreen.test.tsx test/features/ai/hooks/MapGeneration.test.ts test/features/ai/hooks/useMapGeneration.invalidKey.test.ts test/constants/aiConstants.test.ts`
2. AI service tests:
   - `npm test -- --run test/features/ai/services/GeminiService.test.ts`
3. Full unit suite:
   - `npm test -- --run`
4. Manual check:
   - Set different text/image models in UI.
   - Generate theme and confirm logs indicate normal completion and custom icons appear.

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

## Feature Plan: HQ Low-Quota Icon Pipeline (4x4 Atlas + Validation + Repair) (2026-02-22)

### Goal
Implement the agreed high-quality, low-quota icon generation pipeline so icon generation no longer relies on one request per category, while still repairing failed cells deterministically.

### User Review Required
1. Execution scope:
   - Apply the full pipeline now in `auto` mode:
     - generate 4x4 (16-icon) atlas chunks,
     - slice and validate each cell,
     - re-generate failed icons per-icon with a bounded budget,
     - keep existing async Batch API mode available as a separate explicit mode.

### Proposed Changes
1. Atlas chunking strategy
   - Files: `src/features/ai/services/GeminiService.ts`, `src/features/ai/services/iconAtlasUtils.ts`
   - Force atlas chunk size to 16 for HQ mode (`4x4`).
   - Build deterministic cell mapping for each chunk and preserve category order.

2. Cell quality validation
   - File: `src/features/ai/services/iconAtlasUtils.ts`
   - Add per-cell quality checks after chroma-keying:
     - non-empty and visible area thresholds,
     - noise/speckle heuristics,
     - text-like caption/noise heuristics,
     - structured validation result (valid/invalid reason).

3. Failed-cell repair queue
   - File: `src/features/ai/services/GeminiService.ts`
   - Collect failed atlas cells across all chunks.
   - Run one additional 4x4 atlas retry pass for all failed categories (chunked).
   - Preserve rate-limit circuit breaker behavior and skip logic under 429 cooldown.

4. Prompt hardening for cleaner icon outputs
   - File: `src/features/ai/services/GeminiService.ts`
   - Tighten atlas and per-icon prompts:
     - symbols only,
     - no letters/captions/numbers,
     - no decorative noise/particles/grain.
   - Reframe “glitchy” to controlled geometric digital accents rather than random visual noise.

5. Mode semantics update
   - Files: `src/features/ai/services/GeminiService.ts`, `src/constants/aiConstants.ts`, `test/e2e/steps/General.steps.ts`, `test/e2e/features/IconGenerationModes.feature`
   - Keep `batch-async` as explicit true Batch API mode.
   - Make `auto` run HQ atlas+repair pipeline by default.

6. Automated coverage
   - Files: `test/features/ai/services/GeminiService.test.ts`, `test/features/ai/services/iconAtlasUtils.test.ts`, `test/e2e/steps/IconGenerationMode.steps.ts`, `test/e2e/features/IconGenerationModes.feature`
   - Add/adjust tests for:
     - 4x4 atlas chunk invocation behavior,
     - failed-cell atlas retry behavior,
     - validation functions,
     - unchanged explicit batch-async mode behavior.

### Verification Plan
1. Targeted unit tests:
   - `npm test -- --run test/features/ai/services/iconAtlasUtils.test.ts test/features/ai/services/GeminiService.test.ts test/constants/aiConstants.test.ts`
2. BDD icon mode accounting:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. Full unit sanity:
   - `npm test -- --run`
4. Manual sanity:
   - Run theme generation in `Auto` mode and verify logs show:
     - atlas chunk generation in groups of 16,
     - failed-cell repair pass,
     - no per-icon repair calls in auto mode.

## Test Plan: Extended BDD for Icon Quality Recovery (2026-02-22)

### Goal
Increase end-to-end confidence for the new 4x4 atlas + repair pipelines by asserting usable icon coverage across success, partial-failure, hard-failure, and rate-limit conditions.

### Proposed Changes
1. Add new BDD feature focused on usable icon outcomes.
   - File: `test/e2e/features/IconUsableCoverage.feature`
   - Cover atlas-only, auto-repair, and batch-async outcomes.

2. Extend BDD step mocks to simulate richer atlas failure modes.
   - File: `test/e2e/steps/IconGenerationMode.steps.ts`
   - Add behaviors for primary-pass-only failures, partial failures, persistent partial failures, and one-time 429.

3. Add reusable BDD assertions for usable coverage.
   - File: `test/e2e/steps/IconGenerationMode.steps.ts`
   - Assert full/zero/partial coverage from `Usable icons: X/Y` progress logs.

### Verification Plan
1. Targeted feature:
   - `npm run test:e2e:bdd -- --grep "Icon Usable Coverage Recovery"`
2. Combined icon BDD suites:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting|Icon Usable Coverage Recovery"`

## Feature Plan: Hybrid Auto via True Async Batch for 4x4 Atlas (2026-02-22)

### Goal
Move `Auto (HQ Atlas 4x4 + Repair)` to true Gemini async Batch API transport so 4x4 atlas chunk requests are submitted as inlined batch requests (primary + repair), improving cost efficiency while preserving existing slicing/validation quality behavior.

### User Review Required
1. Execution scope:
   - Keep `Atlas only` as direct sync calls.
   - Upgrade only `Auto` transport to async batch for atlas chunks.

### Proposed Changes
1. Async batch transport for atlas chunks in auto mode.
   - File: `src/features/ai/services/GeminiService.ts`
   - Create generic async batch job method for arbitrary inlined requests.
   - Build atlas requests per 4x4 chunk and submit in grouped async batch jobs.
   - Parse inlined responses in-order and run existing slicing/validation pipeline.

2. Keep repair logic atlas-to-atlas.
   - File: `src/features/ai/services/GeminiService.ts`
   - Primary pass via async batch atlas requests.
   - Repair pass via async batch atlas requests for failed subset only.
   - No per-icon fallback in `auto`.

3. BDD mock alignment for batch-atlas behavior.
   - File: `test/e2e/steps/IconGenerationMode.steps.ts`
   - Distinguish atlas vs single-icon requests inside batch payload.
   - Simulate partial/primary failure paths for auto via atlas-style responses.

4. BDD scenario expectations update.
   - Files: `test/e2e/features/IconGenerationModes.feature`, `test/e2e/features/IconUsableCoverage.feature`
   - Update invocation accounting for auto mode from `atlas` counters to batch counters.
   - Preserve coverage assertions for full/partial/zero usable outputs.

### Verification Plan
1. Targeted unit tests:
   - `npm test -- --run test/features/ai/services/GeminiService.test.ts test/features/ai/services/iconAtlasUtils.test.ts`
2. Icon invocation BDD:
   - `npm run test:e2e:bdd -- --grep "Icon Generation Mode Invocation Accounting"`
3. Icon usable-coverage BDD:
   - `npm run test:e2e:bdd -- --grep "Icon Usable Coverage Recovery"`
4. Full unit sanity:
   - `npm test -- --run`

## UX Plan: Icon Mode Explanations on Hover (2026-02-22)

### Goal
Improve clarity of icon generation modes by showing concise explanations for all modes and previewing each explanation when hovering options in the mode dropdown.

### Proposed Changes
1. Add centralized descriptions per icon generation mode.
   - File: `src/constants/aiConstants.ts`
2. Update AI settings mode dropdown to:
   - show selected mode explanation by default,
   - preview hovered mode explanation while the dropdown is open,
   - provide native hover tooltips (`title`) on each option.
   - File: `src/shared/components/sidebar/left/AiSettingsPanel.tsx`
3. Add unit coverage for hover-preview behavior.
   - File: `test/shared/components/AiSettingsPanel.test.tsx`

### Verification Plan
1. Run targeted tests:
   - `npm test -- --run test/shared/components/AiSettingsPanel.test.tsx test/constants/aiConstants.test.ts`

## Provider Plan: Add OpenAI with Budget Models (2026-02-22)

### Goal
Add a second AI provider (`openai`) with a low-cost text model and `gpt-image-1-mini` image model, wired through configuration, UI provider selectors, and runtime service factory.

### Proposed Changes
1. Extend provider types/config:
   - Files: `src/types.ts`, `src/constants/aiConstants.ts`
   - Add `openai` provider entry, model lists, and sanitization compatibility.
2. Update provider selectors in UI:
   - Files: `src/features/auth/components/AuthScreen.tsx`, `src/shared/components/sidebar/left/AiSettingsPanel.tsx`
   - Render providers dynamically (not hardcoded Gemini only).
3. Add OpenAI runtime service:
   - Files: `src/features/ai/services/OpenAIService.ts`, `src/features/ai/services/AiFactory.ts`
   - Implement `IAiService` with OpenAI text + image generation using configured models.
4. Update tests:
   - Files: `test/constants/aiConstants.test.ts`, `test/features/auth/components/AuthScreen.test.tsx`, `test/shared/components/AiSettingsPanel.test.tsx`, `test/features/ai/services/AiFactory.test.ts` (new)
   - Cover provider availability and factory routing.

### Verification Plan
1. Targeted tests:
   - `npm test -- --run test/constants/aiConstants.test.ts test/features/auth/components/AuthScreen.test.tsx test/shared/components/AiSettingsPanel.test.tsx test/features/ai/services/AiFactory.test.ts`

## Phase 9 Plan: Rate-Limit Safe Theme Finalization + MapLibre Style Sanitization (2026-03-12)

### Goal
Prevent map crashes when icon generation is fully rate-limited or produces unusable assets by guaranteeing that finalized styles are always MapLibre-valid (no unresolved theme tokens, no missing `layout`/`paint` objects) and by applying a safe fallback path when usable icon count is zero.

### User Review Required
1. Fallback behavior choice when icons are unavailable:
   - Keep generated palette/theme intent, but force symbol layers to built-in/default marker icons.
2. Validation strictness:
   - Sanitize generated styles before `setStyle`, and if still invalid, fall back to the last known-good style instead of applying a broken style.

### Proposed Changes
1. Harden style compilation/sanitization for MapLibre invariants.
   - Files (expected):
     - `src/features/map/services/styleCompiler.ts`
     - `src/features/map/services/MapLibreAdapter.ts`
   - Ensure each emitted layer has valid object defaults:
     - `layout: {}` when omitted.
     - `paint: {}` when required by layer type or when paint keys are merged.
   - Resolve or strip unresolved `token('...')` values before final style emission.

2. Add explicit zero-usable-icons fallback in AI pipeline.
   - Files (expected):
     - `src/features/ai/services/AbstractAiService.ts`
     - `src/features/ai/services/themeSpec.ts` (if token normalization lives there)
   - When `usableIconCount === 0`:
     - mark icon assets as unavailable,
     - compile style using default icon strategy (no missing sprite references),
     - emit a clearer user-facing progress/warn message explaining fallback.

3. Guard style application in map logic.
   - Files (expected):
     - `src/features/map/hooks/useMapLogic.ts`
   - Validate/sanitize style payload immediately before `map.setStyle`.
   - If invalid after sanitization, preserve current style and surface actionable log message.

4. Regression tests.
   - Files (expected):
     - `test/features/ai/services/GeminiService.test.ts`
     - `test/features/map/services/styleCompiler.test.ts`
     - `test/features/map/hooks/useMapLogic.test.ts`
   - Add/extend tests for:
     - full 429 icon failure -> theme finalization still returns valid style,
     - unresolved token input -> compiled output has concrete color values,
     - layers without explicit layout/paint are normalized to valid objects.

### Verification Plan
1. Targeted regression tests:
   - `npm test -- --run test/features/ai/services/GeminiService.test.ts test/features/map/services/styleCompiler.test.ts test/features/map/hooks/useMapLogic.test.ts`
2. Full unit suite sanity:
   - `npm test -- --run`
3. Optional end-to-end smoke (if runtime/env allows):
   - `npm run test:e2e:bdd -- --grep "Icon Usable Coverage Recovery"`

## Phase 10 Plan: Adaptive Label Halo Harmony + Export Consistency (2026-03-12)

### Goal
Make label border/halo rendering visually unified for a selected theme by deriving one complementary halo color from the generated style (light-theme vs dark-theme aware), and ensure the same behavior appears in exported style/snippet outputs.

### Proposed Changes
1. Add adaptive halo derivation from theme tokens.
   - File: `src/features/map/services/styleCompiler.ts`
   - Compute a harmonized halo color from text + surface luminance and apply it to all text/icon halo properties in compiled styles.

2. Align runtime POI label halo behavior with theme harmony.
   - File: `src/features/map/services/PoiService.ts`
   - Replace per-feature contrasting halo selection with one style-aware halo derived from current palette/popup context.

3. Keep export/snippet parity.
   - Files:
     - `src/features/styles/services/MapStyleExportService.ts` (behavior verification path)
     - `src/features/styles/services/MaputnikExportService.ts` (behavior verification path)
   - Ensure exported style JSON retains harmonized halo values for the selected style.

4. Add regression tests.
   - Files:
     - `test/features/map/services/styleCompiler.test.ts`
     - `test/features/map/services/PoiService.test.ts`
   - Validate dark vs bright style adaptive halo choice and consistent halo usage.

### Verification Plan
1. `npm test -- --run test/features/map/services/styleCompiler.test.ts test/features/map/services/PoiService.test.ts`
2. `npm test -- --run`
3. `npm run build`

## Phase 32 Follow-Up: Label-Coupled Dot Fallback + Pointer Hover (2026-03-21)

### Goal
Refine the missing-icon POI fallback so the colored dot appears only when the POI label is actually rendered, and make hovering the visible POI name behave like a clickable target.

### Proposed Changes
1. Replace the standalone fallback circle with a fallback symbol layer.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Render a simple colored dot as the symbol icon for POIs without a custom icon image.
   - Keep the dot and text in the same symbol placement flow so the dot only appears when the label appears.

2. Extend pointer/click handling to visible POI labels.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Query visual POI layers on hover/click so the cursor becomes a pointer over the visible label and popup opening works from the visible dot/label target.

3. Refresh targeted regressions.
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/features/map/services/PoiService.test.ts`
   - Verify the fallback symbol path still relies on `hasCustomIconImage` and that the missing-icon fallback remains enabled only for those POIs.

### Verification Plan
1. `npm test -- --run test/features/map/services/PoiService.test.ts test/features/map/hooks/useMapLogic.initialization.test.tsx`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features"`

## Phase 33 Plan: Layer-Specific POI Hover/Click Reliability + Zoom Performance (2026-03-21)

### Goal
Fix three regressions introduced by the visual POI fallback path:
- hovering visible POI labels should reliably show a pointer,
- clicking a visible label/dot should open the correct visible POI,
- zooming should not feel janky from global POI hit-testing work.

### Proposed Changes
1. Replace global visual hit-testing with layer-specific listeners.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Remove the current global `mousemove` + `queryRenderedFeatures(...)` pointer logic.
   - Bind `click`, `mouseenter`, and `mouseleave` directly to each visible POI symbol/fallback layer.
   - Reuse one shared handler but register it per visual layer so MapLibre gives the actual hit feature from the clicked label/dot.

2. Remove conflicting legacy cursor listeners.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - Delete the older raw `unclustered-point` hover listeners that currently fight with the new label-hover behavior.

3. Improve clicked-feature selection safety.
   - File: `src/features/map/hooks/useMapLogic.ts`
   - When multiple features are returned for a clicked visual label, choose the best match deterministically from that click event instead of a broad global rendered query path.

4. Add regressions.
   - Files:
     - `test/features/map/hooks/useMapLogic.initialization.test.tsx`
     - `test/e2e/features/MapStyles.feature`
     - `test/e2e/steps/MapStyles.steps.ts`
   - Cover:
     - pointer/click behavior on visible POI label fallback path,
     - no global hover-query path,
     - existing popup interaction remains intact.

### Verification Plan
1. `npm test -- --run test/features/map/hooks/useMapLogic.initialization.test.tsx test/features/map/services/PoiService.test.ts`
2. `npm run test:e2e:bdd -- --grep "Switching styles and interacting with map features"`
