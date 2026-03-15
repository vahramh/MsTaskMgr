import React from "react";
import type { TodayRecommendation, TodayTask } from "@tm/shared";
import { effortToMinutes, minimumDurationToMinutes, prioritySignal } from "./scoring";

function formatDueDate(dueDate?: string): string | null {
  if (!dueDate) return null;
  try {
    return new Date(dueDate).toLocaleDateString();
  } catch {
    return dueDate;
  }
}

function cardClickProps(onOpen: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

export default function BestNextActionCard({
  item,
  now,
  onOpenTask,
  onSeeAlternatives,
}: {
  item: TodayRecommendation | null;
  now: Date;
  onOpenTask: (task: TodayTask) => void;
  onSeeAlternatives: () => void;
}) {
  if (!item) {
    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Best Next Action</div>
        <div style={{ fontWeight: 700 }}>No strong execution recommendation right now</div>
        <div className="help" style={{ marginTop: 6 }}>
          The best next move may be to process inbox items, follow up waiting tasks, or clarify a project.
        </div>
      </div>
    );
  }

  const task = item.task;
  const due = formatDueDate(task.dueDate);
  const effortMinutes = effortToMinutes(task.effort);
  const minimumBlockMinutes = minimumDurationToMinutes(task.minimumDuration);
  const signal = prioritySignal(task, now);

  return (
    <div className="card" style={{ padding: 16, cursor: "pointer" }} {...cardClickProps(() => onOpenTask(task))}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Best Next Action</div>
      <div style={{ fontWeight: 800, fontSize: 20, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>{signal ? `${signal} ` : ""}{task.title}</span>
        {task.source === "shared" ? <span className="pill">Shared</span> : null}
      </div>
      {item.project ? <div className="help" style={{ marginTop: 6 }}>Project: {item.project.title}</div> : null}
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {item.reasons.map((reason) => <span key={reason} className="pill">{reason}</span>)}
      </div>
      <div className="help" style={{ marginTop: 10 }}>
        {task.state ? `${task.state}` : "action"}
        {typeof task.priority === "number" ? ` · P${task.priority}` : ""}
        {task.context ? ` · ${task.context}` : ""}
        {effortMinutes !== null ? ` · effort ${effortMinutes}m` : ""}
        {minimumBlockMinutes !== null ? ` · block ${minimumBlockMinutes}m` : ""}
        {due ? ` · due ${due}` : ""}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        <button className="btn btn-compact" type="button" onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}>
          Open task
        </button>
        <button className="btn btn-secondary btn-compact" type="button" onClick={(e) => { e.stopPropagation(); onSeeAlternatives(); }}>
          See alternatives
        </button>
      </div>
    </div>
  );
}
