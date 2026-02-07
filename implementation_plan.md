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
