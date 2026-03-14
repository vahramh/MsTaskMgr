import React from "react";
import type { Task, WorkflowState } from "@tm/shared";

export function TaskQuickActions({
  task,
  pending,
  isAction,
  currentState,
  onTransition,
  onToggleComplete,
  onEdit,
  onDelete,
  deleteTitle,
  deleteDisabled,
  completePrimary,
  focusAction,
}: {
  task: Task;
  pending: boolean;
  isAction: boolean;
  currentState: WorkflowState;
  onTransition: (task: Task, state: WorkflowState) => void;
  onToggleComplete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  deleteTitle?: string;
  deleteDisabled?: boolean;
  completePrimary?: boolean;
  focusAction?: React.ReactNode;
}) {
  const transitions: WorkflowState[] = ["inbox", "next", "waiting", "scheduled", "someday", "reference"];

  return (
    <div style={{ display: "grid", gap: 8, alignContent: "start", minWidth: 210 }}>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {transitions.map((state) => {
          if (state === "next" && !isAction) return null;
          if (state === currentState) return null;
          return (
            <button
              key={state}
              type="button"
              className="btn btn-secondary btn-compact"
              disabled={pending}
              onClick={() => onTransition(task, state)}
            >
              {state}
            </button>
          );
        })}
      </div>

      <div className="row" style={{ gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        <button
          type="button"
          className={completePrimary ? "btn" : "btn btn-secondary btn-compact"}
          onClick={() => onToggleComplete(task)}
          disabled={pending}
        >
          {currentState === "completed" ? "Reopen" : "Complete"}
        </button>
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => onEdit(task)} disabled={pending}>
          Edit
        </button>
        {focusAction}
        <button
          type="button"
          className="btn btn-danger btn-compact"
          onClick={() => onDelete(task)}
          disabled={pending || deleteDisabled}
          title={deleteTitle}
        >
          Delete
        </button>
      </div>
    </div>
  );
}
