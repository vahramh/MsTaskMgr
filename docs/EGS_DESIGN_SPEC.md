# Execution Guidance System (EGS) — Full Design Specification

## 1. Product Positioning

EGS is a decision-support system for knowledge workers, entrepreneurs, and technical professionals who manage many simultaneous commitments. The product promise is narrower and stronger than a general task manager: it helps the user decide what deserves attention next.

The design language should feel calm, precise, and credible. It should avoid gamification, visual clutter, and corporate heaviness.

## 2. Brand Direction

EGS should feel like a navigation instrument for execution.

Core attributes:
- focused
- calm
- intelligent
- minimal
- deliberate
- professional

The product should visually suggest control, trust, and thinking quality rather than “busy productivity”.

## 3. Colour System

Primary colours:
- Primary blue: `#3B5CCC`
- Accent teal: `#2FA4A9`

Neutrals:
- Background: `#F6F7F9`
- Surface: `#FFFFFF`
- Border: `#E3E6EB`
- Divider: `#E8EBF0`
- Primary text: `#111318`
- Secondary text: `#5B6270`
- Tertiary text: `#737B8C`

Semantic states:
- Success: `#2F9E63`
- Warning: `#D98C2F`
- Danger: `#C94747`
- Blocked: `#7A6BB7`
- Momentum: `#2FA4A9`

Rule: the interface should stay mostly neutral. Colour is a signal, not decoration.

## 4. Typography

Primary stack:
- Inter
- system-ui
- -apple-system
- Segoe UI
- Roboto
- Helvetica Neue
- Arial
- sans-serif

Hierarchy:
- Marketing / landing hero: 36–56px
- Page title: 28–38px
- Section title: 24px
- Primary content: 16–18px
- Metadata / eyebrow labels: 12–14px

Type should carry hierarchy before colour does.

## 5. Layout and Spacing

Use a 4px spacing grid.

Common spacing:
- 8px
- 12px
- 16px
- 24px
- 32px
- 40px

Radius:
- controls: 10px
- cards/panels: 14–16px
- pills: 999px

EGS should be panel-first, not card-everywhere. A small number of clear surfaces is preferable to many competing boxes.

## 6. Logo and Favicon

Recommended symbol: simplified guidance arrow inside a rounded decision field.

Delivered assets:
- `apps/web/public/favicon.svg`
- `apps/web/public/branding/egs-logo-mark.svg`
- `apps/web/public/branding/egs-logo-lockup.svg`

The mark is designed to stay legible at small sizes and to work in browser tabs, navigation headers, and future product materials.

## 7. Landing Page Guidance

The signed-out landing page should feel like a real product entry surface, not a developer checkpoint.

Its job is to:
- explain what EGS is
- explain why it is different
- establish design credibility
- provide a clear sign-in path
- create room later for signup and billing without needing a full redesign

Recommended content blocks:
- hero statement
- execution guidance showcase
- differentiation section
- workflow section
- closing call to action

Tone:
- calm
- crisp
- professional
- not salesy or loud

## 8. Help Page Guidance

The help system should explain both the conceptual model and the way the application should be used.

Recommended structure:
- EGS Guide tab
- Using the App tab
- sticky contents navigation on desktop
- expandable contents navigation on mobile

The help page should avoid:
- repeated sections
- long duplicated explanations
- mixing product theory and app-specific instructions without structure

The revised help content should focus on:
- what EGS is
- the operating cycle
- meaning of states
- projects and next actions
- prioritisation logic
- review discipline
- practical app usage
- troubleshooting and data-quality issues

## 9. UI Tone

The application should feel like a calm briefing workspace.

That means:
- light backgrounds
- strong typography hierarchy
- limited saturated colour
- subtle elevation
- disciplined icon use
- no celebratory productivity theatre

Today should feel like a structured daily briefing, not a crowded dashboard.

## 10. Design Principles

1. Clarity over decoration
2. Signal over noise
3. Guidance over storage
4. Calm surfaces
5. Progressive disclosure
6. Hierarchy before colour
7. Trustworthy recommendations require trustworthy data

## 11. Included Changes in This Pack

This update specifically includes:
- a redesigned signed-out landing page
- a rewritten Help page with reduced redundancy
- refreshed global styling for landing/help surfaces
- favicon and logo assets
- updated browser metadata and page title

