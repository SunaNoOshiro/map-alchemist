<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1vLhztt7l7Qs_Qu10L2KmPFEluqPaeS3u

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Export MapLibre packages

You can export a generated style (colors + AI icons) as a reusable MapLibre package for use in other sites/projects.

1. Select a style in the app.
2. In **Theme Library**, click **Package** (Export MapLibre Package).
3. Use the downloaded JSON in your project (it saves as `map-alchemist-<style>.json`, rename if you want a shorter name).

Example usage:

```ts
import maplibregl from 'maplibre-gl';
import stylePackage from './map-alchemist-style.json';

const map = new maplibregl.Map({
  container: 'map',
  style: stylePackage.styleJson
});

map.on('load', () => {
  // Register icons (data URIs) so iconKey works in the POI layer.
  Object.values(stylePackage.iconsByCategory).forEach((icon) => {
    if (!icon.imageUrl) return;
    const img = new Image();
    img.src = icon.imageUrl;
    img.onload = () => {
      if (!map.hasImage(icon.category)) {
        map.addImage(icon.category, img);
      }
    };
  });

  // Optional: provide POI data to the built-in \"places\" source.
  const places: GeoJSON.FeatureCollection<GeoJSON.Geometry> = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: {
          title: 'Cafe Aurora',
          iconKey: 'Cafe',
          textColor: '#111827',
          haloColor: '#ffffff'
        },
        geometry: { type: 'Point', coordinates: [30.5234, 50.4501] }
      }
    ]
  };

  const source = map.getSource(stylePackage.placesSourceId) as maplibregl.GeoJSONSource | undefined;
  source?.setData(places);
});
```

## Export for Maputnik (style + sprites)

Maputnik expects a plain MapLibre style JSON plus sprite assets. MapAlchemist can export both.

1. Select a style in the app.
2. In **Theme Library**, click **Maputnik**.
3. Enter a sprite base URL (no extension), for example `https://cdn.example.com/sprites/my-style`.
4. Upload the downloaded sprite files to your CDN:
   - `my-style.json`
   - `my-style.png`
   - `my-style@2x.json`
   - `my-style@2x.png`
5. Load the downloaded `maputnik-<style>-style.json` in Maputnik. The style already points to your sprite base URL.

## Publish to GitHub Pages (one-click)

You can publish Maputnik assets directly to GitHub Pages with a per-user PAT.

1. Create a GitHub token with **contents: write** access.
2. In **Theme Library**, click **Publish** (Maputnik → GitHub Pages).
3. The first time, enter your PAT (it is stored in `localStorage` for one-click reuse).
4. The style JSON and sprite files are uploaded under `public/` on the deploy branch (so they get copied into the Pages build), and the app logs the final `style.json` URL.

Note: Publishing writes commits to the configured deploy branch.

## Customer Embed Runtime (drop-in)

After a successful **Publish**, the modal now includes:

1. `styleUrl`
2. `runtime` script URL
3. A copyable HTML snippet for direct website integration

The runtime handles POI popup behavior that Maputnik itself does not execute.

Minimal integration shape:

```html
<script src="https://unpkg.com/maplibre-gl@4.6.0/dist/maplibre-gl.js"></script>
<script src="https://<owner>.github.io/<repo>/runtime/map-alchemist-runtime.js"></script>
<script>
  MapAlchemistRuntime.init({
    container: 'map',
    styleUrl: 'https://<owner>.github.io/<repo>/styles/<style>.json',
    features: {
      popup: true,
      poiColorLabels: true,
      demoPois: false
    }
  });
</script>
```

The exported style includes `metadata.mapAlchemist` (popup style, palette, POI layer/source ids) so runtime defaults can be applied automatically.

## Preview deployments for pull requests

Pull requests now publish a temporary GitHub Pages preview so you can manually
verify theme or map changes before merging. Previews run for PRs targeting any
branch, not just `main`:

- Open the pull request checks and expand the **deploy-preview** job to find the
  **page_url** it produces (published to the `github-pages-preview`
  environment so protected `github-pages` rules do not block PRs).
- The preview uses the same `npm run build` output as production, but is scoped
  to the PR so it will not affect the main deployment.
- For security reasons, previews are only generated when the branch lives in
  this repository (forked PRs keep the build artifacts but skip publishing).

## Debug logging

The app now uses a namespaced logger so you can tune verbosity without
changing code. Set log levels in the browser console via `localStorage`:

```js
// Log everything from every namespace
localStorage.setItem('mapAlchemistLogLevel', 'trace');

// Only turn up logs for the map view logic
localStorage.setItem('mapAlchemistLogLevel:map-view', 'debug');

// Clear overrides
localStorage.removeItem('mapAlchemistLogLevel');
localStorage.removeItem('mapAlchemistLogLevel:map-view');
```

You can also set `VITE_LOG_LEVEL` (error, warn, info, debug, trace) in your
environment to control the default level for all namespaces when building.

## Testing

The project uses a multi-layered testing strategy:

- **Unit/BDD Tests (Vitest)**: Fast tests for business logic and feature requirements in `test/`.
  - Run tests: `npm test`
  - UI Mode: `npm run test:ui`
- **E2E BDD Tests (Playwright)**: Full-stack browser tests using Gherkin in `test/e2e/`.
  - Run tests: `npm run test:e2e:bdd`
