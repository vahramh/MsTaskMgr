Implementation summary

This bundle addresses the Today-screen trust gap where system stress could be driven by overdue or stale Waiting items that were not directly visible from Today, and where the top card could report that no strong execution recommendation existed even though a credible maintenance move did exist.

What changed

1. Today execution metrics are now computed from the whole actionable pool, not from only the currently visible recommendation list.
2. Waiting items that are overdue or stale are surfaced in a dedicated Needs Attention panel on Today.
3. When no credible Best Next Action exists, Today now promotes a Best Next Move fallback, prioritising:
   - overdue waiting attention item
   - stale waiting attention item
   - Follow Up Waiting guided action
   - Unblock Waiting Projects
   - Clarify Projects
   - Process Inbox
   - Prepare Next Actions
   - Restore Project Momentum
   - Break Down Large Tasks
4. The help file was updated to document Best Next Move, Needs Attention, and the principle that anything contributing to Today stress should be visible or actionable from Today.

Notes

- This bundle does not include the earlier local compile-only fixes for TaskContextSelector / voice capture unless they already exist in your codebase; it is focused on the Today-screen behaviour requested in this turn.
- I could not complete a local TypeScript build in the container because the uploaded workspace is missing some type-definition resolution needed by the build environment here (vite/client and node typings). The files were updated consistently, but you should run your normal local build after copying them over.
