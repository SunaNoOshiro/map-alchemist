# Agent Operational Integration Protocol

This document establishes the binding rules of engagement for all AI Agents operating within the `map-alchemist` codebase.

## 0. Project Context ("The Mission")
**Map Alchemist** is a React-based web application allowing users to generate and style interactive maps using AI (Gemini) and MapLibre GL.
*   **Core Stack:** React, Vite, Tailwind CSS, MapLibre GL, IDB (IndexedDB).
*   **Key Features:** Smart map styling, AI-generated icons/themes, local style persistence.
*   **Goal:** Create a "magic" experience where map styles can be conjured from text prompts.


## 1. Testing Protocol ("The Safety Net")

**Rule:** Code is guilty until proven innocent by tests.

### 1.1 When to Run Tests
- **Pre-Flight Check:** Before requesting any user review, you MUST run the relevant test suite (Unit via `npm test` or E2E BDD via `npm run test:e2e:bdd`).
- **Regression Guard:** If you modify existing functionality, run the logic test mirroring that path (e.g., `npm test test/core/services/storage.test.ts`).
- **Sanity Check:** If the change is broad, run all tests.

### 1.2 When to Update Tests
- **Feature Evolution:** If you change the behavior of a feature (e.g., "Remix" button is now visible where it wasn't before), you MUST update the test expectation immediately. Do not leave broken tests for "later".
- **Selector Precision:** If you change DOM structure or IDs, update the test selectors. Prefer resilient selectors like `getByRole`, `getByLabel`, or `data-testid` over brittle XPath or CSS chains.

### 1.3 When to Add New Tests
- **New Frontiers:** Every new User Story or Feature Request (e.g., "Add User Login", "Create Export Feature") requires a corresponding test file or test case.
- **Bug Reports:** If a user reports a bug (e.g., "Icon missing on Pirates theme"), you MUST create a reproduction test case that fails before the fix and passes after the fix.

### 1.4 BDD Step Reuse
- **Check Before Creating:** Before implementing a new step definition, search existing `test/**/*.steps.ts` or `test/**/*.test.ts` files for similar logic.
- **Reuse Over Duplication:** Always reuse existing steps where possible. If a step is broadly applicable (e.g., 'Given I am on the home page'), ensure it is accessible to multiple features to maintain a clean and DRY test suite.

---

## 2. SOLID Principles ("The Foundation")

We adhere to SOLID to ensure scalable, maintainable, and understandable code.

### S - Single Responsibility Principle (SRP)
*   **Definition:** A module should have one, and only one, reason to change.
*   **Application:** 
    *   Don't put API fetching logic inside a UI component. Use a `service` (e.g., `src/features/ai/services/GeminiService.ts`).
    *   Don't put complex data transformation inside `MapView.tsx`. Extract it to a specialized hook (e.g., `src/features/map/hooks/useMapLogic.ts`).
    *   **Bad:** `MapComponent` that handles rendering, fetching styles, and authenticating users.
    *   **Good:** `MapComponent` renders map. `useMapStyles` hook manages data. `AuthService` handles login.

### O - Open/Closed Principle (OCP)
*   **Definition:** Software entities should be open for extension, but closed for modification.
*   **Application:**
    *   Use interfaces and props to allow components to handle new types of data without rewriting the component.
    *   **Example:** `IconItem` should accept an `IconDefinition` interface. If we add a new property to icons, we extend the interface, we don't rewrite the `IconItem` logic unless the display requirement changes.

### L - Liskov Substitution Principle (LSP)
*   **Definition:** Objects of a superclass shall be replaceable with objects of its subclasses without breaking the application.
*   **Application:**
    *   In TypeScript/React, this often applies to Props and Component composition. If a component accepts a `ReactNode` as a child, it should work with *any* valid `ReactNode`, not just specific div structures.
    *   If you have a `BaseMap` class/interface, any `GoogleMap` or `MapLibreMap` implementation must fulfill the contract without throwing "Not Implemented" errors unexpectedly.

### I - Interface Segregation Principle (ISP)
*   **Definition:** Many client-specific interfaces are better than one general-purpose interface.
*   **Application:**
    *   Don't force a component to take a massive `User` object if it only needs `avatarUrl`. Pass only `{ avatarUrl: string }`.
    *   **Bad:** `interface GodObject { map: any; user: any; settings: any; }` passed to a small button.
    *   **Good:** `interface ButtonProps { onClick: () => void; label: string; }`.

### D - Dependency Inversion Principle (DIP)
*   **Definition:** Depend upon abstractions, not concretions.
*   **Application:**
    *   Components should not import "real" services directly if possible; they should depend on hooks or contexts that *provide* the service. This makes testing easier (we can mock the hook).
    *   **Example:** Instead of `import { api } from './api'`, utilize a context or a hook that can be swapped out: `const api = useApi();`.

---

## 3. Design Patterns ("The Toolbox")

Use standard patterns to solve common problems. Do not reinvent the wheel.

### 3.1 Factory Pattern
*   **Use when:** Creating objects based on dynamic conditions.
*   **Example:** A `LayerFactory` that returns different MapLibre layer style objects based on a generic "theme" configuration (e.g., "Dark", "Retro", "Satellite").

### 3.2 Observer Pattern (Pub/Sub)
*   **Use when:** One part of the app needs to react to events in another without tight coupling.
*   **Example:** The Map emits 'moveend' events. The Sidebar listens to these events to update the list of visible places. In React, `useEffect` listening to state changes is a reactive form of this.

### 3.3 Strategy Pattern
*   **Use when:** You have multiple ways to do a task and want to swap them at runtime.
*   **Example:** `ExportService`. You might have `JsonExportStrategy`, `PngExportStrategy`, `GeoJsonExportStrategy`. The user selects "Export", and the app chooses the strategy based on the selection.

### 3.4 Adapter Pattern
*   **Use when:** You need to make incompatible interfaces work together.
*   **Example:** Adapting a Google Maps style definition object to a MapLibre style specification. You write an `adaptGoogleToLibre(gStyle)` function.

---

## 4. Coding Best Practices

### 4.1 Explicit Typing (TypeScript)
*   **Rule:** Avoid `any`. Use `unknown` if you must, but preferably define interfaces.
*   **Reason:** `any` defeats the purpose of TypeScript. Explicit types document the code and prevent runtime errors.

### 4.2 File Structure & Naming
*   **Components:** `PascalCase.tsx` (e.g., `MapView.tsx`).
*   **Data/Utils:** `camelCase.ts` (e.g., `defaultThemes.ts`).
*   **Colocation:** Keep related things together. If a component needs a specific helper function used *only* there, define it in the same file or a sibling file.

### 4.3 Clean Code
*   **Functions:** Should be small and do one thing. If a `useEffect` has 50 lines, it's doing too much. Break it down into named helper functions.
*   **Variables:** Use descriptive names. `const t` is bad. `const theme` is good. `const isThemeLoading` is better.
*   **Comments:** Comment *why*, not *what*. Code tells you what it does; comments tell you why you chose that approach (e.g., "// Using explicit worker URL to avoid CORS issues in strict environments").


---

## 5. Documentation Strategy ("The Memory")

Documentation is not an afterthought; it is the map that prevents us from getting lost in our own creation.

### 5.1 Documenting New Features
Every new feature (e.g., "Add 3D Terrain Mode") requires updates in three places:
1.  **Code Comments:** Explain complex logic inline.
    *   *Bad:* `// 3D mode`
    *   *Good:* `// Switches map pitch to 60 degrees to enable 3D terrain serialization.`
2.  **README / Knowledge Base:** Update the project's high-level documentation if the feature changes how the app is set up, run, or architected.
3.  **Pull Request / Commit Message:** Provide a "Why" and "How".

### 5.2 The "Feature Doc" Template (features/*.md)
For significant features, create a markdown file in `docs/features/` (or similar) following this structure:
*   **Title:** Clear and descriptive.
*   **Problem:** What user pain point are we solving?
*   **Solution:** High-level technical approach.
*   **Usage:** How to use it (code snippets or UI steps).
*   **Screenshots:** (CRITICAL) If it's a UI change, include Before/After screenshots.

### 5.3 Maintenance
*   **Stale Docs:** If you refactor code, you *must* grep for references in documentation and update them.
*   **Self-Documenting Code:** Clean code minimizes the need for external docs, but never eliminates the need for architectural context.


---

## 6. Security Protocol ("The Shield")

### 6.1 Secrets Management
*   **Rule:** **NEVER** commit API keys, tokens, or hardcoded passwords to git.
*   **Practice:** Use `.env` files (added to `.gitignore`) for local development. Use platform-specific secret management (e.g., Vercel Environment Variables) for production.
*   **Audit:** If a key is committed, consider it compromised. Revoke it immediately.

### 6.2 Input Validation
*   **Rule:** Trust no input.
*   **Practice:** API endpoints must validate all incoming data schemas (e.g., using `zod`). Frontend forms must validate types and formats before submission.

### 6.3 XSS & Injection Prevention
*   **React:** React protects against XSS by default. **Avoid** `dangerouslySetInnerHTML` unless absolutely necessary and sanitized (e.g., with `DOMPurify`).
*   **SQL/NoSQL:** Never concatenate strings into queries. Use parameterized queries or ORMs (e.g., Prisma, Drizzle) to prevent Injection attacks.

### 6.4 Dependency Safety
*   **Rule:** Supply chain attacks are real.
*   **Practice:** Review npm packages before adding. Check for maintenance status, download counts, and known vulnerabilities (`npm audit`).


---

## 7. Architecture & Code Organization ("The Blueprint")

### 7.1 Feature-Based Structure (Inside `src/`)
*   **Rule:** Organize code by **feature**, not just technical role.
*   **Structure:**
    ```
    src/
      core/          # App-wide logic (logger, storage, types)
      features/      # Feature-sliced folders
        auth/        # Component, hooks, services for Auth
        map/         # Component, hooks, services for Map rendering
        ai/          # AI generation logic
      shared/        # Reusable UI components, hooks, utils
      api/           # Base API client definitions
    ```
*   **Benefit:** Keeps related logic co-located. If you delete a feature, you delete the folder.

### 7.2 Separation of Concerns (UI vs. Logic)
*   **Rule:** Components should care about **how** things look. Hooks should care about **how** things work.
*   **Practice:**
    *   **Presentational Component:** Receives `data` and `onAction` props. Renders JSX.
    *   **Container/Smart Component:** Calls hooks, manages state, fetches data, passes props to Presentational Components.
    *   **Custom Hooks:** Extract complex `useEffect` or state logic into `useSomeFeature()`.

### 7.3 The "Shared" Directory
*   **Rule:** Only truly reusable utility code goes into root-level `shared/` or `utils/`.
*   **Practice:** If a helper is used only by *Map* features, keep it in `features/map/utils.ts`. Do not pollute the global namespace.

### 7.4 Java-Style Test Structure
*   **Rule:** Tests do NOT live next to code. They live in a mirrored `test/` directory at the project root.
*   **Unit Tests:** `test/core/logger.test.ts` mirrors `src/core/logger.ts`.
*   **BDD Tests:** Feature files and their step definitions live in `test/features/` or `test/e2e/`.


---

## 8. Planning Protocol ("The Map")

### 8.1 The Implementation Plan
*   **Rule:** **NO** code execution or file modification starts without a comprehensive, written plan.
*   **Practice:** Before writing a single line of code, you must create or update `implementation_plan.md` containing:
    1.  **Goal:** What are we achieving?
    2.  **User Review Required:** Any breaking changes or design decisions needing approval?
    3.  **Proposed Changes:** Detailed breakdown of files to create, modify, or delete.
    4.  **Verification Plan:** How will we prove it works? (Specific tests to run, manual steps).

### 8.2 The Approval Loop
*   **Rule:** Planning is a dialogue.
*   **Practice:**
    1.  Write the plan.
    2.  **STOP.** Notify the user and ask for review.
    3.  Incorporate feedback.
    4.  Only proceed to **EXECUTION** mode once the user is satisfied with the plan.


---

## 9. Developer Cheat Sheet ("The Shortcuts")
*   **Start Dev Server:** `npm run dev`
*   **Run Unit/Logic BDD:** `npm test`
*   **Run E2E BDD (Playwright):** `npm run test:e2e:bdd`
*   **Run Vitest UI:** `npm run test:ui`

## 10. Git & Commit Guidelines ("The History")
*   **Commit Style:** Use Conventional Commits.
    *   `feature: add 3D terrain support`
    *   `fix: resolve missing icon in Pirates theme`
    *   `docs: update agents.md with security rules`
    *   `refactor: split MapView into sub-components`
*   **PR Title:** Same as commit. Concise and descriptive.

---
*Verified by Agent Antigravity on 2025-12-16*
