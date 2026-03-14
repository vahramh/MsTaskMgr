import React from "react";
import type { Task } from "@tm/shared";
import { TaskNodeEditor } from "./TaskNodeEditor";
import type { HygieneSignalViewModel, TaskEditorModel } from "./taskNodeTypes";
import type { TaskPresentationHelpers } from "./taskRenderModels";

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
      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" className="btn btn-secondary" onClick={() => onEdit(task)} disabled={pending}>
          Edit
        </button>
      </div>
    </>
  );
}
