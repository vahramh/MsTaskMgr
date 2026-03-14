import React from "react";
import type { EntityType, Task, WorkflowState } from "@tm/shared";

export function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function dueTone(dueDate?: string): { label?: string; border?: string } {
  if (!dueDate) return {};
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return {};
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDue - startOfToday) / 86400000);

  if (days < 0) return { label: "Overdue", border: "#dc2626" };
  if (days === 0) return { label: "Due today", border: "#f59e0b" };
  if (days <= 3) return { label: `Due in ${days}d`, border: "#fbbf24" };
  if (days <= 7) return { label: `Due in ${days}d`, border: "#22c55e" };
  return { label: `Due in ${days}d`, border: "#9ca3af" };
}

export function fmtDue(dueDate?: string): string | null {
  if (!dueDate) return null;
  try {
    const d = new Date(dueDate);
    if (Number.isNaN(d.getTime())) return dueDate;
    return d.toLocaleDateString();
  } catch {
    return dueDate;
  }
}

export function deriveState(task: Task): WorkflowState {
  if (task.state) return task.state;
  if (task.status === "COMPLETED") return "completed";
  return task.dueDate ? "scheduled" : "inbox";
}

export function deriveEntityType(task: Task): EntityType {
  return task.entityType ?? "action";
}

export function stateLabel(state: WorkflowState): string {
  switch (state) {
    case "inbox":
      return "Inbox";
    case "next":
      return "Next";
    case "waiting":
      return "Waiting";
    case "scheduled":
      return "Scheduled";
    case "someday":
      return "Someday";
    case "reference":
      return "Reference";
    case "completed":
      return "Completed";
  }
}

export function stateTone(state: WorkflowState): { bg: string; fg: string; border: string } {
  switch (state) {
    case "inbox":
      return { bg: "#eef2ff", fg: "#1e3a8a", border: "#c7d2fe" };
    case "next":
      return { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" };
    case "waiting":
      return { bg: "#fffbeb", fg: "#92400e", border: "#fde68a" };
    case "scheduled":
      return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
    case "someday":
      return { bg: "#f5f3ff", fg: "#5b21b6", border: "#ddd6fe" };
    case "reference":
      return { bg: "#f3f4f6", fg: "#374151", border: "#e5e7eb" };
    case "completed":
      return { bg: "#f3f4f6", fg: "#6b7280", border: "#e5e7eb" };
  }
}

export function StateBadge({ state }: { state: WorkflowState }) {
  const tone = stateTone(state);
  return (
    <span
      className="state-badge"
      style={{
        background: tone.bg,
        color: tone.fg,
        border: `1px solid ${tone.border}`,
      }}
      title={stateLabel(state)}
    >
      {stateLabel(state).toUpperCase()}
    </span>
  );
}

export function renderTaskStateBadge(state: WorkflowState): React.ReactNode {
  return <StateBadge state={state} />;
}

export function TaskListSkeleton({ count = 3 }: { count?: number }) {
  const line: React.CSSProperties = {
    height: 12,
    borderRadius: 8,
    background: "#e5e7eb",
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="card" style={{ padding: 14 }}>
          <div style={{ ...line, width: "55%" }} />
          <div style={{ ...line, width: "85%", marginTop: 10, opacity: 0.8 }} />
          <div style={{ ...line, width: "35%", marginTop: 10, opacity: 0.6 }} />
        </div>
      ))}
    </div>
  );
}
