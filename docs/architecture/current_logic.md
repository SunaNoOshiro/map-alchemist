# Current Architecture & Logic flow

## 1. Overview
The application is a **Client-Side SPA** built with React and Vite. Logic is distributed using a **feature-based architecture** under `src/`. Components depend on specialized hooks and services, decoupled via an `AiFactory`.

## 2. Architecture Logic

### 2.1 App.tsx (The Orchestrator)
Now a thin entry point.
*   **State Management:** Delegates to specialized hooks (`useStyleManager`, `useAppAuth`, `useMapGeneration`).
*   **Modularity:** Uses path aliases (e.g., `@core`, `@features`) to maintain clean boundaries.

### 2.2 Feature: Map (`src/features/map`)
*   **MapView.tsx:** Focused strictly on MapLibre initialization and React rendering.
*   **useMapLogic.ts:** Handles complex map interactions, paint property updates, and image ingestion.
*   **Services:** `MapLibreAdapter.ts` encapsulates third-party interactions.

### 2.3 Feature: AI (`src/features/ai`)
*   **useMapGeneration.ts:** Manages the lifecycle of AI theme and icon generation.
*   **AiFactory.ts:** Implements Dependency Inversion, allowing the app to swap AI providers (Gemini, OpenAI) without changing UI components.
*   **GeminiService.ts:** Concrete implementation of the AI strategy.

### 2.4 Core Services (`src/core/services`)
*   **Logger:** Centralized namespaced logging in `logger.ts`.
*   **Storage:** IndexedDB persistence with automated migration in `storage.ts`.

## 3. Testing Logic
*   **BDD (Vitest + Gherkin):** Tests business logic and flows in `src/**/*.test.ts` (using `.feature` files).
*   **E2E (Playwright):** Tests visual correctness and real browser interactions in `e2e/*.spec.ts`.
*   **Unit Tests:** Verify individual logic units (e.g., `derivePalette`, `storage` migration).

## 4. Why this Architecture?
*   **Testability:** Decoupled logic is easily mocked for unit and BDD tests.
*   **Maintainability:** Feature-based folders make it obvious where code lives.
*   **Scalability:** Adding new AI providers or map renderers requires minimal modification to core logic.
