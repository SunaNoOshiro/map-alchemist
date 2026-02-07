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
