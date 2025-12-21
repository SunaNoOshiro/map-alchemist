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
