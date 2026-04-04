# Map Alchemist

Map Alchemist is a standalone React + Vite web app for generating themed MapLibre maps and AI-rendered POI icons. It supports Gemini and OpenAI providers, stores styles locally in IndexedDB, and can export or publish finished styles for MapLibre, Maputnik, and GitHub Pages embeds.

## Run locally

Prerequisites: Node.js

1. Install dependencies:
   `npm install`
2. Start the app:
   `npm run dev`
3. Open the local app and add a provider API key in **AI Configuration**, or continue in guest mode for read-only exploration.

API keys are used directly from the browser and stored locally on the current device when you save them in AI Configuration.

## Architecture at a glance

- `src/core`: logger, default-theme loading, storage, low-level interfaces.
- `src/features/auth`: local AI configuration, guest-mode state, auth gating.
- `src/features/ai`: provider-neutral `IAiService`, `AiFactory`, shared `AbstractAiService`, Gemini and OpenAI implementations.
- `src/features/map`: `MapView`, `useMapLogic`, MapLibre adapter, POI rendering and popup services.
- `src/features/styles`: import/export, Maputnik packaging, GitHub Pages publishing, embed snippet generation.
- `src/shared`: reusable layouts, sidebar panels, and UI primitives.

## Theme generation pipeline

Generated themes follow a deterministic pipeline:

1. The selected provider returns a structured `ThemeSpec` plus popup and icon art-direction data.
2. Map Alchemist builds a style catalog from the current OpenFreeMap Liberty template:
   - color-capable layer properties,
   - semantic layer roles,
   - literal `icon-image` keys and POI source-layer references.
3. The compiler applies `ThemeSpec` tokens across all catalog targets to produce a full MapLibre style JSON.
4. POI icon generation uses the canonical app POI taxonomy with deterministic fallback icon resolution.
5. Cost guardrails cap per-run image generation so full-style generation and targeted icon repair stay predictable.

This keeps style output stable across in-app rendering, MapLibre package export, Maputnik export, and published runtime embeds.

## Export MapLibre packages

You can export a generated style as a reusable MapLibre package:

1. Select a style in the app.
2. In **Theme Library**, click **Package**.
3. Use the downloaded JSON in your project.

Example usage:

```ts
import maplibregl from 'maplibre-gl';
import stylePackage from './map-alchemist-style.json';

const map = new maplibregl.Map({
  container: 'map',
  style: stylePackage.styleJson
});

map.on('load', () => {
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

## Export for Maputnik

Maputnik expects a plain MapLibre style JSON plus sprite assets. Map Alchemist can export both.

1. Select a style in the app.
2. In **Theme Library**, click **Maputnik**.
3. Enter a sprite base URL without an extension, for example `https://cdn.example.com/sprites/my-style`.
4. Upload the downloaded sprite files to your CDN:
   - `my-style.json`
   - `my-style.png`
   - `my-style@2x.json`
   - `my-style@2x.png`
5. Load the downloaded `maputnik-<style>-style.json` in Maputnik.

## Publish to GitHub Pages

You can publish Maputnik assets directly to GitHub Pages with a per-user PAT.

1. Create a GitHub token with `contents: write`.
2. In **Theme Library**, click **Publish**.
3. Enter the target repo, branch, and PAT when prompted.
4. The style JSON and sprite assets are written under `public/` on the selected branch, and the app logs the final `style.json` URL.

## Customer embed runtime

After a successful publish, the modal includes:

1. `styleUrl`
2. `runtime` script URL
3. A copyable HTML snippet for direct website integration

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

The exported style includes `metadata.mapAlchemist` so runtime defaults can be applied without extra wiring.

## Preview deployments for pull requests

Pull requests publish a temporary GitHub Pages preview:

- Open the PR checks and expand the `deploy-preview` job to find the `page_url`.
- Previews use the same build output as production.
- Forked PRs keep build artifacts but skip publishing for security.

## Debug logging

The app uses a namespaced logger. Set log levels in the browser console via `localStorage`:

```js
localStorage.setItem('mapAlchemistLogLevel', 'trace');
localStorage.setItem('mapAlchemistLogLevel:map-view', 'debug');

localStorage.removeItem('mapAlchemistLogLevel');
localStorage.removeItem('mapAlchemistLogLevel:map-view');
```

You can also set `VITE_LOG_LEVEL` to `error`, `warn`, `info`, `debug`, or `trace` when building.

## Testing

- Typecheck: `npm run typecheck`
- Unit and component tests once: `npm test -- --run`
- Unit tests in watch mode: `npm test`
- Vitest UI: `npm run test:ui`
- E2E BDD tests: `npm run test:e2e:bdd`

CI runs typecheck, unit tests, the production build, and Playwright BDD coverage from `.github/workflows/ci.yml`.
