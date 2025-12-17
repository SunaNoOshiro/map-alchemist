# Current Architecture & Logic flow

## 1. Overview
The application is a **Client-Side SPA** built with React and Vite. It logic is centralized in `App.tsx`, which manages the global state and orchestrates `geminiService` (AI) and `maplibregl` (Map Rendering).

## 2. Component Logic

### 2.1 App.tsx (The Orchestrator)
Currently acts as a "God Component".
*   **State Management:** Holds `styles[]`, `activeStyleId`, `hasApiKey`, and UI toggles (`sidebarOpen`).
*   **Initialization:**
    1.  Checks for `window.aistudio` bridge (Google AI Studio context).
    2.  Loads styles from `IndexedDB` (via `storageService`).
    3.  If no styles, fetches `defaultThemes` from network.
*   **Business Logic:**
    *   `handleGenerateStyle`: Calls `geminiService.generateMapTheme(prompt)`.
    *   `handleRegenerateIcon`: Calls `geminiService.generateIconImage(category)`.
    *   `handleExport/Import`: Manages JSON serialization of style objects.

### 2.2 MapView.tsx (The Renderer)
A complex wrapper around `maplibregl`.
*   **Initialization:** Creates `maplibregl.Map` instance ref.
*   **Style Loading:**
    *   Fetches `DEFAULT_STYLE_URL` (Basic styling).
    *   **Style Sanitization:** `loadSafeStyle` helper recursively fixes relative URLs in the style JSON to be absolute (crucial for local/blob execution).
*   **Palette Application:**
    *   Watches `palette` prop.
    *   Iterates through **ALL** map layers.
    *   Regex matches layer IDs (`water`, `land`, `road`) and forcibly `setPaintProperty` with the new colors.
*   **Icon Management:**
    *   Watches `activeIcons` prop.
    *   Loads images via `createImageBitmap`.
    *   Calls `map.addImage` for every category in the active theme.
*   **Popups:**
    *   Intercepts `click` on "unclustered-point".
    *   Generates HTML string for the popup (including the "Remix" button).

## 3. Service Logic

### 3.1 GeminiService ("The Creative")
*   **Provider:** Hardcoded to Google GenAI (`@google/genai`).
*   **Flow:**
    1.  `generateMapTheme(prompt)` -> Calls LLM (Flash 2.5) with system prompt to output JSON (Colors, Popup Style).
    2.  `generateIconImage(prompt)` -> Calls Image Model (Flash 2.5 Image) -> Receives Base64 -> Calls `removeBackground` (Canvas pixel manipulation) -> Returns transparent PNG Data URL.

### 3.2 StorageService ("The Vault")
*   **Provider:** `IndexedDB` (Native Browser API).
*   **Schema:** Single object store `styles` containing the full array of presets.
*   **Migration:** Contains logic to auto-migrate from `localStorage` if found.

## 4. Why Refactor?
*   **Coupling:** `App.tsx` knows too much about *how* to call Gemini.
*   **Rigidity:** Changing the Map provider would require rewriting `MapView.tsx`.
*   **Complexity:** `MapView.tsx` is >700 lines, mixing network requests, canvas drawing, and map events.
