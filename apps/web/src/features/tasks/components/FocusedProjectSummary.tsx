import React from "react";
import type { ExecutionContext, Task } from "@tm/shared";
import { TaskNodeEditor } from "./TaskNodeEditor";
import type { HygieneSignalViewModel, TaskEditorModel } from "./taskNodeTypes";
import type { TaskPresentationHelpers } from "./taskRenderModels";
import type { FocusedProjectDiagnostics } from "../projectDiagnostics";

function prettyTier(value: string): string {
  switch (value) {
    case "needsClarification":
      return "Needs clarification";
    case "needsNextAction":
      return "Missing next action";
    case "weakReady":
      return "Weakly ready";
    case "notReady":
      return "Not ready";
    case "waitingRisk":
      return "Waiting risk";
    case "stalled":
      return "Stalled";
    case "cold":
      return "Low momentum";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

export function FocusedProjectSummary({
  task,
  pending,
  isEditing,
  editor,
  setEditor,
  saveEditorForNode,
  onEdit,
  helpers,
  hygieneSignals,
  diagnostics,
  getBlockerOptions,
  contexts,
}: {
  task: Task;
  pending: boolean;
  isEditing: boolean;
  editor: TaskEditorModel;
  setEditor: React.Dispatch<React.SetStateAction<TaskEditorModel>>;
  saveEditorForNode: (task: Task) => Promise<void>;
  onEdit: (task: Task) => void;
  helpers: TaskPresentationHelpers;
  hygieneSignals: HygieneSignalViewModel[];
  diagnostics?: FocusedProjectDiagnostics | null;
  getBlockerOptions: (task: Task) => Array<{ taskId: string; title: string }>;
  contexts: ExecutionContext[];
}) {
  if (isEditing) {
    return (
      <TaskNodeEditor
        editor={editor}
        setEditor={setEditor}
        pending={pending}
        onCancel={() => setEditor(null)}
        onSave={() => void saveEditorForNode(task)}
        requireWorkflowFields
        blockerOptions={getBlockerOptions(task)}
        contexts={contexts}
      />
    );
  }

  const state = helpers.deriveState(task);
  const entityType = helpers.deriveEntityType(task);
  const due = helpers.fmtDue(task.dueDate);

  return (
    <>
      <div style={{ fontWeight: 700 }}>{task.title}</div>
      <div className="help" style={{ marginTop: 4 }}>
        {state} · {entityType}
        {task.context ? ` · ${task.context}` : ""}
        {due ? ` · Due ${due}` : ""}
      </div>
      <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
        {hygieneSignals.map((signal) => (
          <span key={signal.key} className="pill" title={signal.label}>
            {signal.icon} {signal.label}
          </span>
        ))}
      </div>

      {diagnostics ? (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          <div style={{ fontWeight: 700 }}>Project diagnostics</div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
            <span className="pill">{prettyTier(diagnostics.momentum)}</span>
            <span className="pill">{prettyTier(diagnostics.clarity)}</span>
            <span className="pill">{prettyTier(diagnostics.readiness)}</span>
            {diagnostics.blockage !== "none" ? <span className="pill">{prettyTier(diagnostics.blockage)}</span> : null}
            {diagnostics.outcomePrompt ? <span className="pill">Outcome not defined</span> : null}
          </div>
          <div className="help">{diagnostics.summary}</div>
          <div className="help">
            {diagnostics.nextCount} next · {diagnostics.waitingCount} waiting · {diagnostics.dueSoonCount} due soon · {diagnostics.recentCompletedCount} completed recently
          </div>
          {diagnostics.leadTaskTitle ? (
            <div className="help">Nearest checkpoint: <strong>{diagnostics.leadTaskTitle}</strong></div>
          ) : null}
          {diagnostics.outcomePrompt ? (
            <div className="help">Prompt: use the description to capture what done looks like for this project.</div>
          ) : null}
        </div>
      ) : null}

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={() => onEdit(task)} disabled={pending}>
          Edit
        </button>
      </div>
    </>
  );
}
