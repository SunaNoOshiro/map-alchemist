# Implementation Plan

## Goal
Unify the UI styling across the app, remove unnecessary text (“Configure provider and key settings”), refresh mismatched icons and style selector UI, and improve the mobile layout/behavior.

## User Review Required
Yes. Visual/UI adjustments will change layout, dropdown styling, and icon usage. Please confirm the plan before implementation.

## Proposed Changes
1. **Audit UI layout/components** responsible for provider text, style selector, and edit icons to identify mismatched elements.
2. **Normalize style selector** to use the same dropdown pattern as the AI model selector on the left.
3. **Remove unnecessary text** (“Configure provider and key settings”) from the relevant UI section.
4. **Update icon set/styling** for edit-style controls to match the overall design system.
5. **Improve mobile responsiveness** in affected components with consistent spacing, layout, and dropdown behavior.
6. **Add/update tests** if UI behavior or selectors change (per project rules).

## Verification Plan
- Run `npm test` (required pre-flight).
- If needed, run targeted tests covering updated components.
- Manual visual check in the browser for desktop and mobile breakpoints.
