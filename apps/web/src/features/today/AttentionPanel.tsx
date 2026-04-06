import { priorityLabel } from "@tm/shared";
import type { TodayAttentionItem, TodayTask } from "@tm/shared";

function kindLabel(kind: TodayAttentionItem["kind"]): string {
  switch (kind) {
    case "overdueWaiting":
      return "Overdue waiting";
    case "staleWaiting":
      return "Stale waiting";
    default:
      return "Needs attention";
  }
}

export default function AttentionPanel({
  items,
  onOpenTask,
  onOpenWaiting,
}: {
  items: TodayAttentionItem[];
  onOpenTask: (task: TodayTask) => void;
  onOpenWaiting: () => void;
}) {
  if (!items.length) return null;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Needs Attention</div>
      <div className="help" style={{ marginBottom: 12 }}>
        These items are influencing system stress but are not being promoted as direct execution work. Today surfaces them here so the pressure is visible and actionable.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((item) => (
          <div key={`${item.kind}:${item.task.source}:${item.task.taskId}`} className="today-project-health-row">
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <div style={{ fontWeight: 700 }}>{item.title}</div>
              <span className="pill">{kindLabel(item.kind)}</span>
              {typeof item.task.priority === "number" ? <span className="pill">{priorityLabel(item.task.priority)}</span> : null}
            </div>
            <div className="help" style={{ marginTop: 4 }}>{item.explanation}</div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button type="button" className="btn btn-compact" onClick={() => onOpenTask(item.task)}>
                {item.suggestedActionLabel}
              </button>
              <button type="button" className="btn btn-secondary btn-compact" onClick={onOpenWaiting}>
                Open Waiting
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
