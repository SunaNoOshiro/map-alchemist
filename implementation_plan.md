# Implementation Plan

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
