# Implementation Plan

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
