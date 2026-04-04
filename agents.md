# Agent Operational Integration Protocol

This document defines the working agreement for AI agents operating in the `map-alchemist` repository.

## 0. Mission

**Map Alchemist** is a standalone React + Vite SPA for generating and styling interactive maps with AI and MapLibre GL.

- Core runtime: React, Vite, MapLibre GL, IndexedDB
- AI providers: Gemini and OpenAI
- Key workflows: theme generation, AI icon generation, local style persistence, MapLibre export, Maputnik export, GitHub Pages publish
- Goal: deliver a "magic" map-styling experience without letting code, tests, configs, or docs drift apart

## 1. Testing Protocol

**Rule:** changes are not done until the relevant automated checks pass.

### 1.1 Required checks

- Type contract: `npm run typecheck`
- Unit/component verification: `npm test -- --run`
- E2E BDD verification: `npm run test:e2e:bdd`

### 1.2 When to run what

- Small logic fix: run `npm run typecheck` plus the closest matching unit test path.
- Feature change touching existing behavior: run `npm run typecheck` and `npm test -- --run`.
- Broad change across modules, shared contracts, or UI flows: run all three checks.

### 1.3 Test maintenance rules

- If behavior changes, update the affected tests in the same change.
- Reuse existing BDD steps before creating new ones.
- Keep tests in the mirrored top-level `test/` tree, not next to source files.

## 2. Architectural Source of Truth

### 2.1 Module responsibilities

- `src/core`
  - logger, storage, default theme loading, low-level interfaces
- `src/features/auth`
  - local AI configuration, guest mode, auth gating
- `src/features/ai`
  - `IAiService`, `AiFactory`, shared generation pipeline, Gemini and OpenAI providers
- `src/features/map`
  - `MapView`, `useMapLogic`, MapLibre adapter, POI rendering, popup enrichment, search
- `src/features/styles`
  - import/export, Maputnik packaging, GitHub Pages publishing, runtime embed generation
- `src/shared`
  - reusable layouts and UI components

### 2.2 Boundary rules

- UI components should render and delegate.
- Hooks own orchestration and stateful behavior.
- Services own provider, export, storage, or map-integration logic.
- Provider branching belongs in `AiFactory` and provider services, not scattered through UI.
- Feature-specific helpers stay inside their feature folder unless they are truly reused elsewhere.

## 3. Design Principles

### 3.1 SOLID in this repository

- Single Responsibility Principle
  - Keep `MapView` focused on rendering and shell concerns; keep map orchestration in `useMapLogic`; keep provider calls inside `features/ai/services`; keep export/publish logic inside `features/styles/services`.
- Open/Closed Principle
  - Extend AI providers through `IAiService` and `AiFactory`, not by adding provider-specific branches across UI components.
- Liskov Substitution Principle
  - Any `IAiService` implementation or map-controller abstraction should be swappable without forcing callers to special-case one provider or one map backend.
- Interface Segregation Principle
  - Pass narrow props and contracts across module boundaries; avoid handing large app-shaped objects to small UI components.
- Dependency Inversion Principle
  - Depend on stable contracts like `IAiService` and `IMapController` at feature boundaries; keep third-party specifics inside provider services and `MapLibreAdapter`.

### 3.2 Approved patterns

- Factory
  - Use `AiFactory` for provider selection and similar centralized runtime selection points.
- Strategy
  - Keep export modes, publish modes, and icon-generation modes as swappable strategies rather than branching through unrelated modules.
- Adapter
  - Keep direct `maplibre-gl` integration inside `MapLibreAdapter` so the rest of the app works with map-controller behavior, not library details.
- Observer / reactive flow
  - Let sidebar state, popup state, and map state react through hooks and controlled props instead of direct cross-component mutation.

## 4. Coding Standards

### 4.1 TypeScript

- Prefer explicit types for public contracts and cross-module boundaries.
- Avoid introducing new `any` unless the third-party API truly forces it.
- Use `unknown`, narrow aggressively, and keep unsafe casts close to the interop edge.

### 4.2 Naming and structure

- Components: `PascalCase.tsx`
- Hooks/services/utils/data: `camelCase.ts`
- Keep files small and single-purpose where practical.

### 4.3 Clean code

- Comment why, not what.
- Extract long effect logic into named helpers or hooks.
- Preserve existing behavior unless the task explicitly calls for a behavioral change.

## 5. Documentation Rules

- Update `README.md` when setup, testing, exports, or runtime behavior changes.
- Update `docs/architecture/current_logic.md` when module boundaries or data flow change.
- Update feature docs in `docs/features/` when user-visible behavior changes materially.
- Keep `implementation_plan.md` current for substantial work.

## 6. Security Rules

- Never commit secrets, PATs, or hardcoded credentials.
- Remember this is a client-side app: any runtime key used by the app is user-supplied and browser-visible.
- Validate external input and imported data before trusting it.
- Avoid unsafe HTML injection unless sanitized.

## 7. Planning Protocol

- Before substantial edits, create or update `implementation_plan.md` with:
  1. Goal
  2. User review requirements
  3. Proposed changes
  4. Verification plan
- If the user explicitly requested direct execution and no product decision is blocked, update the plan and continue in the same turn.
- If a decision has non-obvious product or architectural consequences, pause after updating the plan and ask for direction.

## 8. Repository-Specific Guidance

- Auth in the standalone app is based on locally configured provider keys.
- Guest mode is read-only.
- Export and publish flows must stay aligned with the same `MapStylePreset` contract used by live rendering.
- CI must reflect reality: skipped checks are considered config drift unless intentionally documented.

## 9. Developer Cheat Sheet

- Start dev server: `npm run dev`
- Typecheck: `npm run typecheck`
- Run unit/component tests once: `npm test -- --run`
- Run unit tests in watch mode: `npm test`
- Run Vitest UI: `npm run test:ui`
- Run E2E BDD: `npm run test:e2e:bdd`

## 10. Git & Commit Guidelines

- Use Conventional Commits.
- Keep commit and PR titles concise and descriptive.

Examples:

- `fix: align auth flow with local API key contract`
- `refactor: tighten map export typing`
- `docs: sync architecture and testing guidance`

---
Verified for the current standalone architecture on 2026-04-04.
