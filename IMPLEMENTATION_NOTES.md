# EGS – Time-Window Aware Today Guidance

## Step 1 — Current Today recommendation model

Before this change, Today used a single ranking pipeline:

- only actionable items were considered (`next` and `scheduled` actions; not projects, inbox, waiting, someday, reference, completed)
- readiness was already central
- base score combined:
  - execution readiness
  - due pressure
  - duration / effort fit
  - metadata completeness
  - priority
  - momentum / staleness
  - project-context bonuses such as only-clear-next-step, restores momentum, clarifies project, reduces deadline risk
  - friction penalties such as repeated deferral, blocked ancestors/descendants, missing metadata, oversized work blocks
- Today returned:
  - one `bestNextAction`
  - one static ranked `recommended` list
  - guided actions
  - project health summary

## Best insertion points

The strongest pragmatic insertion point was the existing server-side Today ranking layer:

- `services/api/src/today/best-next-action.ts`
  - this already owned ranking, reasons, and best-next selection
  - it was the right place to add mode-aware overlays without rewriting the overall execution engine
- `services/api/src/today/overview.ts`
  - extended to return per-mode recommendation sets in one response
- `packages/shared/src/index.ts`
  - extended shared contracts for execution modes and richer recommendation metadata
- Today UI components
  - switched from client-side “filtering” of one static list to switching between server-computed execution modes

## Step 2 — Feature design

### New execution modes

Implemented:

- `all`
  - balanced default lens
- `quickWins`
  - favors short, low-friction, ready work
- `mediumBlock`
  - favors 30–60 minute bounded progress
- `deepWork`
  - favors substantial, high-leverage work suited to larger uninterrupted blocks
- `dueSoon`
  - favors time-sensitive work while still respecting readiness and structural trust

### Mode-specific weighting model

The implementation keeps the existing scoring model as the base, then applies a mode-specific overlay.

#### 1. Base score (preserved)

Still includes:

- readiness / execution credibility
- due pressure
- focus fit from duration / effort
- metadata completeness
- priority
- momentum
- project leverage / deadline bonuses
- friction penalties

#### 2. Mode overlay (new)

Each mode adds an extra contribution layer:

##### All / Default

- remains balanced
- small mode bonus for:
  - low activation friction
  - high leverage
  - time sensitivity

##### Quick Wins

Strongly favors:

- <= 15 min and <= 30 min work
- low activation friction
- ready-now tasks
- short executable moves with some urgency or leverage

Downranks:

- larger deep-work-sized tasks
- structurally awkward tasks

##### Medium Block

Strongly favors:

- ~25–75 minute work
- bounded but meaningful progress
- leverage and readiness
- moderate urgency when present

Downranks:

- trivially small tasks
- oversized deep-work tasks

##### Deep Work

Strongly favors:

- ~60–150 minute work
- substantial progress
- high leverage tasks
- momentum-restoring tasks

Downranks:

- quick-win style tasks
- poorly defined work that does not justify a deep block

##### Due Soon

Strongly favors:

- overdue
- due today
- due within 1–3 days
- scheduled-for-today items
- deadline-risk reduction

Still constrained by readiness:

- tasks that are structurally blocked or not credible do not suddenly become strong recommendations just because they are due

### Readiness interaction

Readiness remains upstream and central.

The mode system does **not** bypass the existing readiness model.

- blocked / not-ready items are still suppressed from Best Next Action credibility
- mode overlays can adjust ranking emphasis, but they do not override structural trust

### Due pressure interaction

Due pressure is still computed in the base score.

The new overlay amplifies due pressure differently by mode:

- strongest in `dueSoon`
- moderate in `all`
- secondary in `quickWins` and `mediumBlock`
- present but restrained in `deepWork`

### Effort and minimum duration interpretation

The mode system uses:

- `minimumDuration` first when available
- `effort` as fallback when minimum duration is absent

This supports realistic execution-window matching without requiring perfect metadata.

Derived fit categories:

- `quick`
- `medium`
- `deep`
- `unknown`

### Project leverage interaction

Project leverage is preserved and made more visible through mode scoring.

Leverage factors include:

- only actionable / only next task in project
- project lead task status
- low momentum recovery
- clarification value
- deadline pressure

This especially matters in:

- `mediumBlock`
- `deepWork`
- `dueSoon`

## Trust / explanation layer

Each recommendation now exposes:

- `reasons` (chips)
- `explanation` (concise sentence, mode-specific)
- `executionFit`
- `readiness`

This improves trust in two ways:

- explains *why this task is surfacing in this mode*
- makes it clearer why a different task may not be surfacing under the currently selected execution lens

The Today header also now explains that other tasks are not gone — they are simply deprioritized for the current working window.

## Step 3 — What was implemented

### Shared types / response contract

Added:

- `TodayExecutionMode`
- `TodayRecommendationFit`
- `TodayRecommendationReadiness`
- `TodayModeRecommendations`
- new recommendation fields:
  - `explanation`
  - `executionFit`
  - `readiness`
- `TodayOverviewResponse.defaultMode`
- `TodayOverviewResponse.recommendationModes`

Backward-compatible fields retained:

- `bestNextAction`
- `recommended`

These continue to mirror the default mode.

### Backend

Implemented server-side multi-mode recommendation generation in:

- `services/api/src/today/best-next-action.ts`

The backend now computes all mode views in one pass over the actionable pool and returns:

- `recommendationModes.all`
- `recommendationModes.quickWins`
- `recommendationModes.mediumBlock`
- `recommendationModes.deepWork`
- `recommendationModes.dueSoon`

### UI

Today UI now:

- replaces the old static recommendation filter concept with execution-mode switching
- updates both:
  - Best Next Action
  - Recommended Tasks
  from the selected mode
- shows mode label and description
- shows per-task explanation text
- shows task readiness and fit summaries

## Step 4 — Why this is a good pragmatic next step

This implementation is a strong next capability layer because it:

- preserves the existing architecture
- preserves the existing scoring model
- adds situational intelligence without introducing a complex rules engine
- keeps Today calm and professional
- materially improves real-world utility for short windows, medium windows, deep-work windows, and deadline situations
- improves recommendation trust without requiring a major data-model rewrite

It is also an extensible foundation for future layers such as:

- calendar-aware availability windows
- context-aware execution modes
- user-configurable work-window preferences
- explicit “why not now?” diagnostics for non-surfaced tasks

## Step 5 — Practical test plan

### A. Default Today regression

- load Today in default mode
- confirm Today still returns a Best Next Action when credible tasks exist
- confirm recommendations still appear when actionable tasks exist
- confirm guided actions and project health still render
- confirm no crash when `recommendationModes` is present

### B. Mode behaviour

#### Quick Wins

- create tasks with 10m, 20m, 30m, 90m minimum durations
- confirm short items rise above larger items
- confirm blocked / weak tasks do not dominate purely because they are short

#### Medium Block

- create tasks around 20m, 45m, 60m, 120m
- confirm ~30–60m tasks dominate
- confirm very small and very large tasks are generally pushed down

#### Deep Work

- create tasks around 15m, 45m, 90m, 150m
- confirm 60–150m tasks dominate
- confirm high-leverage project lead tasks rise appropriately
- confirm trivial quick wins are deprioritized

#### Due Soon

- create overdue, due-today, due-tomorrow, due-in-5-days, undated tasks
- confirm overdue / due-today / due-soon tasks dominate
- confirm non-ready structurally weak tasks still do not become Best Next Action if blocked

### C. Readiness trust

- test a due-today task blocked by ancestor state
- confirm it does not become Best Next Action
- test a short task with missing metadata and actionable children
- confirm a better defined ready task outranks it when appropriate

### D. Missing metadata edge cases

- task with only effort, no minimum duration
- task with only minimum duration, no effort
- task with neither
- confirm mode selection still works sensibly
- confirm no runtime/type errors

### E. Due-date edge cases

- no due date
- past due date
- today
- tomorrow
- within 3 days
- within 7 days
- confirm chip and ranking behaviour remains coherent

### F. UI behaviour

- switch modes repeatedly
- confirm Best Next Action changes with the mode when appropriate
- confirm Recommended list changes with the mode
- confirm explanation text updates with the mode
- confirm empty-state wording appears when a mode has no credible recommendations
- confirm Include shared tasks still refreshes all mode results

### G. Quick actions regression

- complete from a recommendation card
- move to tomorrow
- move +3 days
- set waiting
- reschedule
- confirm Today refreshes and rankings update correctly afterward

### H. Shared tasks regression

- include shared tasks with VIEW permission
- confirm quick actions are disabled
- include shared tasks with EDIT permission
- confirm quick actions still work
- confirm mode ranking includes shared tasks correctly
