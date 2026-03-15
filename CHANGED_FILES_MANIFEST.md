# Phase 1 finishing patch — changed files

## Frontend
- `apps/web/src/pages/AppShell.tsx`
- `apps/web/src/features/review/ReviewPage.tsx`
- `apps/web/src/features/help/HelpPage.tsx`

## Backend
- `services/api/src/today/scoring.ts`
- `services/api/src/insights/scoring.ts`
- `services/api/src/review/scoring.ts`

## Summary of changes
- Removed the top header Help button from the app shell; kept the in-app Help tab next to Profile.
- Changed `/app` index and wildcard fallbacks to `/app/today`.
- Aligned Review-screen Guided Actions project logic with Today by treating `Next`, `Scheduled`, and `Waiting` as valid actionable paths.
- Updated Review wording from "Next action" to "actionable path" where appropriate.
- Updated Help content to reflect Phase 1 execution-surface design and prioritisation logic.
