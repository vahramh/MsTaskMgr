import { priorityLabel } from "@tm/shared";
import React from "react";
import type { TodayExecutionMode, TodayFallbackRecommendation, TodayRecommendation, TodayTask } from "@tm/shared";
import { effortToMinutes, executionModeLabel, minimumDurationToMinutes, prioritySignal } from "./scoring";

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

function readinessLabel(readiness?: TodayRecommendation["readiness"]): string | null {
  switch (readiness) {
    case "ready":
      return "ready now";
    case "weakReady":
      return "mostly ready";
    case "notReady":
      return "needs setup";
    case "blocked":
      return "blocked";
    default:
      return null;
  }
}

export default function BestNextActionCard({
  item,
  fallback,
  mode,
  modeDescription,
  now,
  onOpenTask,
  onSeeAlternatives,
  onOpenFallback,
}: {
  item: TodayRecommendation | null;
  fallback: TodayFallbackRecommendation | null;
  mode: TodayExecutionMode;
  modeDescription: string;
  now: Date;
  onOpenTask: (task: TodayTask) => void;
  onSeeAlternatives: () => void;
  onOpenFallback: (fallback: TodayFallbackRecommendation) => void;
}) {
  if (!item) {
    if (fallback) {
      return (
        <div className="card" style={{ padding: 16 }}>
          <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Best Next Move</div>
          <div className="help" style={{ marginBottom: 8 }}>{executionModeLabel(mode)} · {modeDescription}</div>
          <div style={{ fontWeight: 700 }}>{fallback.title}</div>
          <div className="help" style={{ marginTop: 6 }}>{fallback.description}</div>
          <div className="help" style={{ marginTop: 8 }}>
            No strong execution recommendation is available in this mode right now, so Today is elevating the strongest maintenance move instead.
          </div>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            <button className="btn btn-compact" type="button" onClick={() => onOpenFallback(fallback)}>
              {fallback.ctaLabel}
            </button>
            <button className="btn btn-secondary btn-compact" type="button" onClick={onSeeAlternatives}>
              See alternatives
            </button>
          </div>
        </div>
      );
    }

    return (
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Best Next Action</div>
        <div className="help" style={{ marginBottom: 8 }}>{executionModeLabel(mode)} · {modeDescription}</div>
        <div style={{ fontWeight: 700 }}>No strong execution recommendation in this mode right now</div>
        <div className="help" style={{ marginTop: 6 }}>
          This usually means the current lens does not have a credible ready task. Try another mode, process inbox, or clarify a project.
        </div>
      </div>
    );
  }

  const task = item.task;
  const due = formatDueDate(task.dueDate);
  const effortMinutes = effortToMinutes(task.effort);
  const minimumBlockMinutes = minimumDurationToMinutes(task.minimumDuration);
  const signal = prioritySignal(task, now);
  const readiness = readinessLabel(item.readiness);

  return (
    <div className="card" style={{ padding: 16, cursor: "pointer" }} {...cardClickProps(() => onOpenTask(task))}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6 }}>Best Next Action</div>
      <div className="help" style={{ marginBottom: 8 }}>{executionModeLabel(mode)} · {modeDescription}</div>
      <div style={{ fontWeight: 800, fontSize: 20, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>{signal ? `${signal} ` : ""}{task.title}</span>
        {task.source === "shared" ? <span className="pill">Shared</span> : null}
      </div>
      {item.project ? <div className="help" style={{ marginTop: 6 }}>Project: {item.project.title}</div> : null}
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
        {item.reasons.map((reason) => <span key={reason} className="pill">{reason}</span>)}
      </div>
      {item.explanation ? <div className="help" style={{ marginTop: 10 }}>{item.explanation}</div> : null}
      <div className="help" style={{ marginTop: 10 }}>
        {task.state ? `${task.state}` : "action"}
        {typeof task.priority === "number" ? ` · ${priorityLabel(task.priority)}` : ""}
        {task.context ? ` · ${task.context}` : ""}
        {effortMinutes !== null ? ` · effort ${effortMinutes}m` : ""}
        {minimumBlockMinutes !== null ? ` · block ${minimumBlockMinutes}m` : ""}
        {readiness ? ` · ${readiness}` : ""}
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
