import type { TodayGuidedActions } from "@tm/shared";

export default function GuidedActionsPanel({
  actions,
  onOpenInbox,
  onOpenWaiting,
  onOpenProjects,
  onOpenTasks,
}: {
  actions: TodayGuidedActions;
  onOpenInbox: () => void;
  onOpenWaiting: () => void;
  onOpenProjects: () => void;
  onOpenTasks: () => void;
}) {
  const rows = [
    actions.processInbox
      ? {
          key: "processInbox",
          title: "Process Inbox",
          description: `${actions.processInbox.count} inbox item${actions.processInbox.count === 1 ? "" : "s"} need clarification.`,
          samples: actions.processInbox.sampleTitles,
          onOpen: onOpenInbox,
        }
      : null,
    actions.followUpWaiting
      ? {
          key: "followUpWaiting",
          title: "Follow Up Waiting",
          description: `${actions.followUpWaiting.count} waiting item${actions.followUpWaiting.count === 1 ? "" : "s"} are stale enough to follow up.`,
          samples: actions.followUpWaiting.sampleTitles,
          onOpen: onOpenWaiting,
        }
      : null,
    actions.clarifyProjects
      ? {
          key: "clarifyProjects",
          title: "Clarify Projects",
          description: `${actions.clarifyProjects.count} project${actions.clarifyProjects.count === 1 ? "" : "s"} have work but no clean next action yet.`,
          samples: actions.clarifyProjects.sampleTitles,
          onOpen: onOpenProjects,
        }
      : null,
    actions.reviveProjects
      ? {
          key: "reviveProjects",
          title: "Restore Project Momentum",
          description: `${actions.reviveProjects.count} project${actions.reviveProjects.count === 1 ? "" : "s"} look cold and need a clear restart step.`,
          samples: actions.reviveProjects.sampleTitles,
          onOpen: onOpenProjects,
        }
      : null,
    actions.unblockProjects
      ? {
          key: "unblockProjects",
          title: "Unblock Waiting Projects",
          description: `${actions.unblockProjects.count} project${actions.unblockProjects.count === 1 ? "" : "s"} are mostly blocked by waiting work.`,
          samples: actions.unblockProjects.sampleTitles,
          onOpen: onOpenProjects,
        }
      : null,
    actions.breakLargeTasks
      ? {
          key: "breakLargeTasks",
          title: "Break Down Large Tasks",
          description: `${actions.breakLargeTasks.count} large task${actions.breakLargeTasks.count === 1 ? "" : "s"} keep getting deferred and need splitting.`,
          samples: actions.breakLargeTasks.sampleTitles,
          onOpen: onOpenTasks,
        }
      : null,
    actions.prepareNextActions
      ? {
          key: "prepareNextActions",
          title: "Prepare Next Actions",
          description: `${actions.prepareNextActions.count} Next or Scheduled item${actions.prepareNextActions.count === 1 ? " is" : "s are"} not fully execution-ready yet.`,
          samples: actions.prepareNextActions.sampleTitles,
          onOpen: onOpenTasks,
        }
      : null,
  ].filter(Boolean) as Array<{ key: string; title: string; description: string; samples?: string[]; onOpen: () => void }>;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Guided Actions</div>
      <div className="help" style={{ marginBottom: 12 }}>
        System maintenance actions to restore clarity, momentum, and flow.
      </div>
      {rows.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {rows.map((row) => (
            <div key={row.key} className="today-project-health-row">
              <div style={{ fontWeight: 700 }}>{row.title}</div>
              <div className="help" style={{ marginTop: 4 }}>{row.description}</div>
              {row.samples?.length ? (
                <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {row.samples.map((sample) => <span key={sample} className="pill">{sample}</span>)}
                </div>
              ) : null}
              <div style={{ marginTop: 10 }}>
                <button type="button" className="btn btn-secondary btn-compact" onClick={row.onOpen}>
                  Open
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 700 }}>Your system looks clear right now</div>
          <div className="help" style={{ marginTop: 4 }}>No guided cleanup actions are currently competing for attention.</div>
        </div>
      )}
    </div>
  );
}
