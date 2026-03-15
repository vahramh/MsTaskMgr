import type { TodayProjectHealthProject, TodayProjectHealthSummary, TodayTask } from "@tm/shared";

function toneLabel(value: string): string {
  switch (value) {
    case "stalled":
      return "Stalled";
    case "cold":
      return "Low momentum";
    case "warm":
      return "Warm";
    case "strong":
      return "Strong";
    case "needsClarification":
      return "Needs clarification";
    case "needsNextAction":
      return "Missing next action";
    case "blocked":
      return "Blocked";
    case "parked":
      return "Parked";
    case "ready":
      return "Ready";
    case "weakReady":
      return "Weakly ready";
    case "notReady":
      return "Not ready";
    case "waitingRisk":
      return "Waiting risk";
    case "waiting":
      return "Waiting";
    default:
      return value;
  }
}

function Category({
  title,
  items,
  onOpenProject,
}: {
  title: string;
  items: TodayProjectHealthProject[];
  onOpenProject: (task: TodayTask) => void;
}) {
  if (!items.length) return null;
  return (
    <div style={{ display: "grid", gap: 8 }}>
      <div style={{ fontWeight: 800 }}>{title} ({items.length})</div>
      {items.slice(0, 3).map((item) => (
        <div key={`${item.project.source}-${item.project.taskId}`} className="today-project-health-row">
          <div style={{ fontWeight: 700 }}>{item.project.title}</div>
          <div className="help" style={{ marginTop: 4 }}>{item.diagnosis}</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <span className="pill">{toneLabel(item.momentum)}</span>
            <span className="pill">{toneLabel(item.clarity)}</span>
            <span className="pill">{toneLabel(item.readiness)}</span>
            {item.blockage !== "none" ? <span className="pill">{toneLabel(item.blockage)}</span> : null}
            {item.leadTask ? <span className="pill">Lead: {item.leadTask.title}</span> : null}
          </div>
          <div className="help" style={{ marginTop: 8 }}>
            {item.openActions} open · {item.nextCount} next · {item.waitingCount} waiting · {item.dueSoonCount} due soon · {item.recentCompletedCount} completed recently
          </div>
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenProject(item.project)}>
              Open project
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ProjectHealthPanel({
  summary,
  onOpenProject,
}: {
  summary: TodayProjectHealthSummary;
  onOpenProject: (task: TodayTask) => void;
}) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Project Health</div>
      <div className="help" style={{ marginBottom: 12 }}>
        Diagnostic project signals based on clarity, waiting blockage, deadline pressure, and momentum.
      </div>
      {summary.noClearNextStep.length || summary.blockedByWaiting.length || summary.deadlinePressure.length || summary.lowMomentum.length ? (
        <div style={{ display: "grid", gap: 14 }}>
          <Category title="No Clear Next Step" items={summary.noClearNextStep} onOpenProject={onOpenProject} />
          <Category title="Blocked by Waiting" items={summary.blockedByWaiting} onOpenProject={onOpenProject} />
          <Category title="Deadline Pressure" items={summary.deadlinePressure} onOpenProject={onOpenProject} />
          <Category title="Low Momentum" items={summary.lowMomentum} onOpenProject={onOpenProject} />
        </div>
      ) : (
        <div>
          <div style={{ fontWeight: 700 }}>No major project risks detected</div>
          <div className="help" style={{ marginTop: 4 }}>Your current projects have at least some viable forward motion.</div>
        </div>
      )}
    </div>
  );
}
