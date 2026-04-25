import React from "react";
import type { EntityType, ExecutionContext, Task, WorkflowState } from "@tm/shared";
import type { HygieneSignalViewModel } from "./taskNodeTypes";
import { summarizeContexts } from "../contextOptions";

export function TaskNodeSummary({
  task,
  fmtDue,
  dueTone,
  deriveState,
  deriveEntityType,
  renderStateBadge,
  expanded,
  onToggleExpand,
  expandLabel,
  hygieneSignals,
  showUpdatedAt,
  formatTime,
  contexts = [],
  onOpenProject,
}: {
  task: Task;
  fmtDue: (dueDate?: string) => string | null;
  dueTone: (dueDate?: string) => { label?: string; border?: string };
  deriveState: (task: Task) => WorkflowState;
  deriveEntityType: (task: Task) => EntityType;
  renderStateBadge: (state: WorkflowState) => React.ReactNode;
  expanded?: boolean;
  onToggleExpand?: (() => void) | undefined;
  expandLabel?: string;
  hygieneSignals?: HygieneSignalViewModel[];
  showUpdatedAt?: boolean;
  formatTime?: (iso: string) => string;
  contexts?: ExecutionContext[];
  onOpenProject?: (projectId: string) => void;
}) {
  const state = deriveState(task);
  const entityType = deriveEntityType(task);
  const due = fmtDue(task.dueDate);
  const dueInfo = dueTone(task.dueDate);
  const project = (task as Task & { project?: { taskId: string; title: string } }).project;
  const context = summarizeContexts(task.contextIds ?? [], contexts, task.context);

  return (
    <div>
      <div className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 800, fontSize: 16 }}>{task.title}</div>
        {renderStateBadge(state)}
        <span className="pill">{entityType}</span>
        {task.priority ? <span className="pill">P{task.priority}</span> : null}
        {due && dueInfo.label ? <span className="pill">{dueInfo.label}</span> : null}
        {project ? (
          onOpenProject ? (
            <button
              type="button"
              className="pill pill-button"
              onClick={() => onOpenProject(project.taskId)}
              title={`Open project: ${project.title}`}
              aria-label={`Open project: ${project.title}`}
            >
              Project: {project.title}
            </button>
          ) : (
            <span className="pill">Project: {project.title}</span>
          )
        ) : null}
      </div>

      {task.description ? <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{task.description}</div> : null}

      <div className="help" style={{ marginTop: 8 }}>
        {context ? `Context: ${context}` : "No context"}
        {task.waitingForTaskTitle ? ` · Blocked by: ${task.waitingForTaskTitle}` : task.waitingFor ? ` · Waiting for: ${task.waitingFor}` : ""}
        {due ? ` · Due: ${due}` : ""}
        {typeof task.remainingMinutes === "number" ? ` · Remaining: ${task.remainingMinutes}m` : ""}
        {typeof task.timeSpentMinutes === "number" ? ` · Spent: ${task.timeSpentMinutes}m` : ""}
        {typeof task.estimatedMinutes === "number" ? ` · Estimate: ${task.estimatedMinutes}m` : ""}
        {task.minimumDuration ? ` · Minimum session: ${task.minimumDuration.value} ${task.minimumDuration.unit}` : ""}
        {showUpdatedAt && formatTime ? ` · Updated: ${formatTime(task.updatedAt)}` : ""}
      </div>

      {hygieneSignals && hygieneSignals.length ? (
        <div className="row" style={{ gap: 6, marginTop: 8, flexWrap: "wrap" }}>
          {hygieneSignals.map((signal) => (
            <span key={signal.key} className="pill" title={signal.label}>
              {signal.icon} {signal.label}
            </span>
          ))}
        </div>
      ) : null}

      {onToggleExpand ? (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-secondary btn-compact" onClick={onToggleExpand}>
            {expanded ? "Hide subtasks" : "Show subtasks"} {expandLabel ?? ""}
          </button>
        </div>
      ) : null}
    </div>
  );
}
