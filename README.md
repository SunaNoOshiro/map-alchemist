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
verify theme or map changes before merging to `main`:

- Open the pull request checks and expand the **deploy-preview** job to find the
  **page_url** it produces.
- The preview uses the same `npm run build` output as production, but is scoped
  to the PR so it will not affect the main deployment.
- For security reasons, previews are only generated when the branch lives in
  this repository (forked PRs keep the build artifacts but skip publishing).
