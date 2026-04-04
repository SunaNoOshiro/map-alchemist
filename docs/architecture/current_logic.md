# Unified Architecture Model

## 1. System Boundary

Map Alchemist is a standalone client-side SPA built with React and Vite. There is no app-owned backend. AI requests, map rendering, export generation, and local persistence all run in the browser.

The supported runtime model is:

- provider API key is supplied through the app UI and stored locally,
- guest mode is read-only,
- generated and imported styles persist in IndexedDB,
- exported assets can be consumed by MapLibre, Maputnik, or the published runtime embed.

## 2. Core Concepts

### 2.1 Primary Entities

- `AiConfig`: selected provider, text model, image model, icon-generation mode, and locally stored API key.
- `MapStylePreset`: persisted map theme, prompt metadata, popup style, palette, and icon catalog.
- `IconDefinition`: per-category prompt and image payload used for in-app rendering and export.
- `PopupStyle`: visual contract for POI popup rendering and exported runtime defaults.
- `LoadedPoiSearchItem`: normalized POI search/sidebar model derived from rendered map features.

### 2.2 Stable Module Roles

- `src/core`
  - app-wide primitives such as logging, storage, default theme loading, and low-level interfaces.
- `src/features/auth`
  - local AI configuration, guest mode, and auth gating.
- `src/features/ai`
  - provider abstraction and generation pipelines.
- `src/features/map`
  - MapLibre integration, POI rendering, popup enrichment, search, and view logic.
- `src/features/styles`
  - style import/export, sprite generation, Maputnik packaging, GitHub Pages publishing, runtime embed generation.
- `src/shared`
  - reusable layouts and UI components used across features.

## 3. Contracts and Interfaces

### 3.1 AI Contract

- `IAiService` is the provider-neutral contract.
- `AiFactory` is the only provider-selection entry point.
- `GeminiService` and `OpenAIService` inherit shared generation behavior from `AbstractAiService`.
- Provider-specific rate-limit, async-batch, and error mapping logic stays inside provider folders.

### 3.2 Map Contract

- `MapView.tsx` is a thin React shell.
- `useMapLogic.ts` owns map lifecycle, POI collection, popup coordination, palette application, and style refresh behavior.
- `MapLibreAdapter.ts` is the boundary around direct `maplibre-gl` interaction.

### 3.3 Style Contract

- `MapStyleExportService` builds reusable MapLibre export packages.
- `MaputnikExportService` produces a plain style JSON plus sprite assets and metadata for published embeds.
- `GitHubPagesPublisher` is the only module that writes published assets to GitHub.

## 4. Data Flow

1. `App.tsx` composes auth, style-management, and AI-generation hooks.
2. `useAppAuth` resolves local auth state and provider configuration.
3. `useStyleManager` loads persisted or bundled styles and exposes export/publish flows.
4. `useMapGeneration` calls `AiFactory`, creates a new `MapStylePreset`, and updates active state.
5. `MainLayout` passes the selected preset into `MapView`.
6. `useMapLogic` resolves renderable style JSON, syncs icon images, refreshes POI data, and manages popup/search side effects.
7. Export services consume the same `MapStylePreset` contract used by the live map.

## 5. Naming and Boundary Rules

- Feature folders own feature-specific services and helpers.
- Root-level `shared/` is only for code reused across features.
- Tests live in the mirrored top-level `test/` tree, not beside source files.
- New top-level runtime decisions should be documented in `README.md`, this architecture file, and `implementation_plan.md`.

## 6. Design Principles and Patterns

### 6.1 SOLID application

- Single Responsibility Principle
  - `MapView` renders, `useMapLogic` orchestrates, provider services call AI APIs, and style services own export/publish behavior.
- Open/Closed Principle
  - New AI providers or export behaviors should extend existing contracts like `IAiService` and service seams instead of spreading new conditional logic through the UI.
- Liskov Substitution Principle
  - Callers should be able to switch between `IAiService` implementations or map-controller implementations without adding provider-specific or adapter-specific branches.
- Interface Segregation Principle
  - Cross-module props and contracts should stay narrow; shared components should receive only the state and callbacks they actually use.
- Dependency Inversion Principle
  - Feature seams should depend on contracts such as `IAiService` and `IMapController`, while third-party details remain inside provider services and adapters.

### 6.2 Approved patterns

- Factory
  - `AiFactory` is the reference pattern for runtime provider selection.
- Strategy
  - Icon-generation modes, export paths, and publish flows should remain strategy-like and swappable behind stable interfaces.
- Adapter
  - `MapLibreAdapter` isolates direct MapLibre behavior from the rest of the feature code.
- Observer / reactive flow
  - Map, popup, sidebar, and search state should synchronize through hooks, events, and controlled props rather than direct mutation across components.

## 7. Verification Model

- Type contract: `npm run typecheck`
- Unit/component coverage: `npm test -- --run`
- Interactive/unit watch workflow: `npm test`
- Browser BDD coverage: `npm run test:e2e:bdd`

Test layout:

- `test/core/**`: app-wide primitives
- `test/features/**`: unit and feature-level behavior
- `test/shared/**`: reusable component behavior
- `test/e2e/features/**`: Playwright BDD feature files
- `test/e2e/steps/**`: Playwright BDD step definitions

## 8. Non-Goals for the Current Architecture

- No hidden AI Studio key bridge is assumed in the standalone app runtime.
- No backend persistence or server-side secret management exists in this repository.
- Provider expansion should happen through `IAiService` implementations, not ad hoc branching inside UI components.
