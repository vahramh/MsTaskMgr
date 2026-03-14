import React from "react";
import type { TaskEditorModel } from "./taskNodeTypes";

export function TaskNodeEditor({
  editor,
  setEditor,
  pending,
  onCancel,
  onSave,
  requireWorkflowFields,
}: {
  editor: TaskEditorModel;
  setEditor: React.Dispatch<React.SetStateAction<TaskEditorModel>>;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
  requireWorkflowFields?: boolean;
}) {
  if (!editor) return null;

  const update = <K extends keyof NonNullable<TaskEditorModel>>(key: K, value: NonNullable<TaskEditorModel>[K]) => {
    setEditor((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  return (
    <div style={{ display: "grid", gap: 8 }}>
      <input className="input" value={editor.title} onChange={(e) => update("title", e.target.value)} placeholder="Title" />
      <textarea className="input" rows={3} value={editor.description} onChange={(e) => update("description", e.target.value)} placeholder="Description" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        {requireWorkflowFields && !editor.parentTaskId ? (
          <label>
            <div className="help" style={{ marginBottom: 4 }}>Entity type</div>
            <select className="input" value={editor.entityType} onChange={(e) => update("entityType", e.target.value as any)}>
              <option value="action">Action</option>
              <option value="project">Project</option>
            </select>
          </label>
        ) : null}

        <label>
          <div className="help" style={{ marginBottom: 4 }}>State</div>
          <select className="input" value={editor.state} onChange={(e) => update("state", e.target.value as any)}>
            <option value="inbox">Inbox</option>
            <option value="next">Next</option>
            <option value="waiting">Waiting</option>
            <option value="scheduled">Scheduled</option>
            <option value="someday">Someday</option>
            <option value="reference">Reference</option>
            <option value="completed">Completed</option>
          </select>
        </label>

        <label>
          <div className="help" style={{ marginBottom: 4 }}>Due date</div>
          <input className="input" type="date" value={editor.dueDate} onChange={(e) => update("dueDate", e.target.value)} />
        </label>

        <label>
          <div className="help" style={{ marginBottom: 4 }}>Priority</div>
          <select className="input" value={editor.priority} onChange={(e) => update("priority", e.target.value)}>
            <option value="">None</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <label>
          <div className="help" style={{ marginBottom: 4 }}>Context</div>
          <input className="input" value={editor.context} onChange={(e) => update("context", e.target.value)} />
        </label>
        <label>
          <div className="help" style={{ marginBottom: 4 }}>Waiting for</div>
          <input className="input" value={editor.waitingFor} onChange={(e) => update("waitingFor", e.target.value)} />
        </label>
        <label>
          <div className="help" style={{ marginBottom: 4 }}>Effort</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={editor.effortValue} onChange={(e) => update("effortValue", e.target.value)} />
            <select className="input" value={editor.effortUnit} onChange={(e) => update("effortUnit", e.target.value as any)} style={{ width: 120 }}>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        </label>
        <label>
          <div className="help" style={{ marginBottom: 4 }}>Minimum block</div>
          <div className="row" style={{ gap: 8 }}>
            <input className="input" value={editor.minimumDurationValue} onChange={(e) => update("minimumDurationValue", e.target.value)} />
            <select className="input" value={editor.minimumDurationUnit} onChange={(e) => update("minimumDurationUnit", e.target.value as any)} style={{ width: 120 }}>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </label>
      </div>

      <label>
        <div className="help" style={{ marginBottom: 4 }}>Attributes JSON</div>
        <textarea className="input" rows={4} value={editor.attrsJson} onChange={(e) => update("attrsJson", e.target.value)} />
      </label>

      <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
        <button type="button" className="btn" onClick={onSave} disabled={pending || !editor.title.trim()}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
