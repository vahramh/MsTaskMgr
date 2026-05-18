import type React from "react";
import { priorityLabel } from "@tm/shared";
import type { TodayRecommendation, TodayTask } from "@tm/shared";
import { effortToMinutes, minimumDurationToMinutes } from "./scoring";

function formatDueDate(dueDate?: string): string | null {
  if (!dueDate) return null;
  try {
    return new Date(dueDate).toLocaleDateString();
  } catch {
    return dueDate;
  }
}

function formatMinutes(minutes: number | null): string | null {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const whole = Math.round(minutes);
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  if (hours && mins) return `${hours}h ${mins}m`;
  if (hours) return `${hours}h`;
  return `${mins}m`;
}

function commitmentMinutes(task: TodayTask): number | null {
  return minimumDurationToMinutes(task.minimumDuration) ?? effortToMinutes(task.effort) ?? task.remainingMinutes ?? task.estimatedMinutes ?? null;
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

function canEditTask(task: TodayTask): boolean {
  if (task.source !== "shared") return true;
  return task.sharedMeta?.mode === "EDIT";
}

function CommitmentCard({
  item,
  onOpenTask,
  onOpenProject,
  onQuickAction,
  pending,
}: {
  item: TodayRecommendation;
  onOpenTask: (task: TodayTask) => void;
  onOpenProject: (task: TodayTask) => void;
  onQuickAction: (task: TodayTask, action: "complete" | "tomorrow" | "plus3" | "waiting" | "reschedule") => void;
  pending: boolean;
}) {
  const task = item.task;
  const due = formatDueDate(task.dueDate);
  const minutes = commitmentMinutes(task);
  const duration = formatMinutes(minutes);
  const editable = canEditTask(task);

  return (
    <div className="card today-task-card" style={{ padding: 14, cursor: "pointer" }} {...cardClickProps(() => onOpenTask(task))}>
      <div className="row space-between" style={{ alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            {duration ? <span className="pill">{duration}</span> : null}
            <span>{task.title}</span>
            {task.source === "shared" ? <span className="pill">Shared</span> : null}
          </div>
          <div className="help" style={{ marginTop: 4 }}>
            {item.project ? `Project: ${item.project.title} · ` : ""}
            scheduled
            {typeof task.priority === "number" ? ` · ${priorityLabel(task.priority)}` : ""}
            {task.context ? ` · ${task.context}` : ""}
            {due ? ` · due ${due}` : ""}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            <span className="pill">Scheduled for today</span>
            {item.reasons.filter((reason) => reason !== "Scheduled for today").map((reason) => <span key={reason} className="pill">{reason}</span>)}
          </div>
          {item.explanation ? <div className="help" style={{ marginTop: 8 }}>{item.explanation}</div> : null}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" className="btn btn-compact" disabled={!editable || pending} onClick={(e) => { e.stopPropagation(); onQuickAction(task, "complete"); }}>
              {pending ? "Working…" : "Complete"}
            </button>
            <button type="button" className="btn btn-secondary btn-compact" disabled={!editable || pending} onClick={(e) => { e.stopPropagation(); onQuickAction(task, "reschedule"); }}>
              Reschedule
            </button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}>
              Open task
            </button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={(e) => { e.stopPropagation(); onOpenProject(task); }}>
              Open Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ScheduledCommitmentsSection({
  items,
  onOpenTask,
  onOpenProject,
  onQuickAction,
  pendingTaskId,
}: {
  items: TodayRecommendation[];
  onOpenTask: (task: TodayTask) => void;
  onOpenProject: (task: TodayTask) => void;
  onQuickAction: (task: TodayTask, action: "complete" | "tomorrow" | "plus3" | "waiting" | "reschedule") => void;
  pendingTaskId: string | null;
}) {
  if (!items.length) return null;

  const totalMinutes = items.reduce((sum, item) => sum + (commitmentMinutes(item.task) ?? 0), 0);
  const total = formatMinutes(totalMinutes);

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>Today's Commitments</div>
      <div className="help" style={{ marginTop: 4 }}>
        {total ? `${total} already scheduled for today. These are commitments, not discretionary recommendations.` : "Scheduled items that should be handled before discretionary recommendations."}
      </div>
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        {items.map((item) => (
          <CommitmentCard
            key={`${item.task.source}-${item.task.taskId}`}
            item={item}
            onOpenTask={onOpenTask}
            onOpenProject={onOpenProject}
            onQuickAction={onQuickAction}
            pending={pendingTaskId === `${item.task.source}:${item.task.taskId}`}
          />
        ))}
      </div>
    </div>
  );
}
