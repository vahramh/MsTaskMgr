# Assumptions

1. This patch is intended to be applied on top of the previously delivered Phase 1 codebase.
2. The Review page should continue using the existing insights/guided-actions infrastructure, but with project-actionability logic aligned to Today.
3. A project should not be flagged as lacking direction if it already has open descendant tasks in `waiting` or `scheduled`; those count as an actionable path for Phase 1.
4. The existing `TodayProjectHealthIssue` type names (`noNext`, `onlySomeday`, `stalledWaiting`) were preserved to avoid unnecessary contract churn, but `noNext` is now interpreted in UI/help as "no actionable path".
5. The in-app Help tab under `/app/help` remains the canonical Help entry; only the redundant top header Help button was removed.
