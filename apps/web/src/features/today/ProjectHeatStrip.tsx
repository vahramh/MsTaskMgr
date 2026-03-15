import type { TodayProjectHealthSummary, TodayTask } from "@tm/shared";
import { buildProjectHeat, type ProjectHeatItem, type ProjectHeatTone } from "./projectHeat";

function toneStyles(tone: ProjectHeatTone): React.CSSProperties {
  switch (tone) {
    case "atRisk":
      return {
        border: "1px solid #f59e0b",
        background: "#fff7ed",
      };
    case "blocked":
      return {
        border: "1px solid #fb923c",
        background: "#fffaf0",
      };
    case "cool":
      return {
        border: "1px solid #d1d5db",
        background: "#f9fafb",
      };
    case "warm":
      return {
        border: "1px solid #cbd5e1",
        background: "#f8fafc",
      };
    case "hot":
      return {
        border: "1px solid #bbf7d0",
        background: "#f0fdf4",
      };
    default:
      return {
        border: "1px solid #e5e7eb",
        background: "#ffffff",
      };
  }
}

function HeatPill({
  item,
  onOpenProject,
}: {
  item: ProjectHeatItem;
  onOpenProject: (task: TodayTask) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpenProject(item.item.project)}
      style={{
        ...toneStyles(item.tone),
        minWidth: 160,
        padding: "10px 12px",
        borderRadius: 12,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 700, lineHeight: 1.25 }}>{item.title}</div>
      <div style={{ marginTop: 4, fontSize: 12, fontWeight: 800 }}>{item.label}</div>
      {item.hint ? (
        <div className="help" style={{ marginTop: 4 }}>
          {item.hint}
        </div>
      ) : null}
    </button>
  );
}

export default function ProjectHeatStrip({
  summary,
  onOpenProject,
}: {
  summary: TodayProjectHealthSummary;
  onOpenProject: (task: TodayTask) => void;
}) {
  const items = buildProjectHeat(summary);

  if (!items.length) return null;

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Project Heat</div>
      <div className="help" style={{ marginBottom: 12 }}>
        A quick scan of projects needing attention.
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
        {items.map((item) => (
          <HeatPill key={item.projectId} item={item} onOpenProject={onOpenProject} />
        ))}
      </div>
    </div>
  );
}