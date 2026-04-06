
import React from "react";
import type { TaskEditorModel } from "./taskNodeTypes";
import { TaskContextSelector } from "./TaskContextSelector";

export type TaskBlockerOption = {
  taskId: string;
  title: string;
};

function applyWorkLog(current: NonNullable<TaskEditorModel>, minutes: number) {
  const estimated = current.estimatedMinutes.trim() ? Number(current.estimatedMinutes) : undefined;
  const remaining = current.remainingMinutes.trim()
    ? Number(current.remainingMinutes)
    : estimated;
  const spent = current.timeSpentMinutes.trim() ? Number(current.timeSpentMinutes) : 0;

  const nextRemaining = Math.max(0, (remaining ?? 0) - minutes);
  return {
    ...current,
    remainingMinutes: String(nextRemaining),
    timeSpentMinutes: String(spent + minutes),
    estimatedMinutes: current.estimatedMinutes || (remaining !== undefined ? String(remaining + spent) : ""),
  };
}

export function TaskNodeEditor({
  editor,
  setEditor,
  pending,
  onCancel,
  onSave,
  requireWorkflowFields,
  blockerOptions = [],
}: {
  editor: TaskEditorModel;
  setEditor: React.Dispatch<React.SetStateAction<TaskEditorModel>>;
  pending: boolean;
  onCancel: () => void;
  onSave: () => void;
  requireWorkflowFields?: boolean;
  blockerOptions?: TaskBlockerOption[];
}) {
  if (!editor) return null;

  const update = <K extends keyof NonNullable<TaskEditorModel>>(key: K, value: NonNullable<TaskEditorModel>[K]) => {
    setEditor((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const logWork = (minutes: number) => {
    setEditor((prev) => (prev ? applyWorkLog(prev, minutes) : prev));
  };

  const onStateChange = (state: any) => {
    setEditor((prev) => {
      if (!prev) return prev;
      if (state !== "waiting") {
        return {
          ...prev,
          state,
          waitingFor: "",
          waitingForTaskId: "",
          waitingForTaskTitle: "",
          resumeStateAfterWait: "next",
        };
      }
      return { ...prev, state };
    });
  };

  const onBlockerChange = (taskId: string) => {
    const option = blockerOptions.find((item) => item.taskId === taskId);
    setEditor((prev) => prev ? {
      ...prev,
      waitingForTaskId: taskId,
      waitingForTaskTitle: option?.title ?? "",
      resumeStateAfterWait: prev.resumeStateAfterWait ?? "next",
    } : prev);
  };

  return (
    <div style={{ display: "grid", gap: 10 }}>
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
          <select className="input" value={editor.state} onChange={(e) => onStateChange(e.target.value as any)}>
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
            <option value="1">P1 · Critical</option>
            <option value="2">P2 · High</option>
            <option value="3">P3 · Normal</option>
            <option value="4">P4 · Low</option>
            <option value="5">P5 · Very low</option>
          </select>
        </label>
      </div>

      <TaskContextSelector
        selected={editor.contextTokens}
        onToggle={(token) =>
          setEditor((prev) =>
            prev
              ? {
                  ...prev,
                  contextTokens: prev.contextTokens.includes(token)
                    ? prev.contextTokens.filter((value) => value !== token)
                    : [...prev.contextTokens, token],
                }
              : prev
          )
        }
      />

      {editor.state === "waiting" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
          <label>
            <div className="help" style={{ marginBottom: 4 }}>Blocked by task</div>
            <select className="input" value={editor.waitingForTaskId} onChange={(e) => onBlockerChange(e.target.value)}>
              <option value="">No structured blocker</option>
              {blockerOptions.map((option) => (
                <option key={option.taskId} value={option.taskId}>{option.title}</option>
              ))}
            </select>
          </label>

          <label style={{ gridColumn: "1 / -1" }}>
            <div className="help" style={{ marginBottom: 4 }}>Waiting note</div>
            <input
              className="input"
              value={editor.waitingFor}
              onChange={(e) => update("waitingFor", e.target.value)}
              placeholder="Optional human context, e.g. awaiting client reply"
            />
          </label>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>When unblocked, move to</div>
            <select className="input" value={editor.resumeStateAfterWait} onChange={(e) => update("resumeStateAfterWait", e.target.value as "next" | "inbox")}>
              <option value="next">Next</option>
              <option value="inbox">Inbox</option>
            </select>
          </label>

          {editor.waitingForTaskId ? (
            <div className="help" style={{ alignSelf: "end" }}>Blocker: {editor.waitingForTaskTitle}</div>
          ) : blockerOptions.length === 0 ? (
            <div className="help" style={{ alignSelf: "end" }}>Load the project tree to choose a same-project blocker.</div>
          ) : null}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8 }}>
        <label>
          <div className="help" style={{ marginBottom: 4 }}>Effort</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input className="input" inputMode="decimal" value={editor.effortValue} onChange={(e) => update("effortValue", e.target.value)} />
            <select className="input" value={editor.effortUnit} onChange={(e) => update("effortUnit", e.target.value as any)}>
              <option value="hours">hours</option>
              <option value="days">days</option>
            </select>
          </div>
        </label>

        <label>
          <div className="help" style={{ marginBottom: 4 }}>Estimated (min)</div>
          <input className="input" inputMode="numeric" value={editor.estimatedMinutes} onChange={(e) => update("estimatedMinutes", e.target.value)} />
        </label>

        <label>
          <div className="help" style={{ marginBottom: 4 }}>Remaining (min)</div>
          <input className="input" inputMode="numeric" value={editor.remainingMinutes} onChange={(e) => update("remainingMinutes", e.target.value)} />
        </label>

        <label>
          <div className="help" style={{ marginBottom: 4 }}>Spent (min)</div>
          <input className="input" inputMode="numeric" value={editor.timeSpentMinutes} onChange={(e) => update("timeSpentMinutes", e.target.value)} />
        </label>

        <label>
          <div className="help" style={{ marginBottom: 4 }}>Minimum session</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8 }}>
            <input className="input" inputMode="decimal" value={editor.minimumDurationValue} onChange={(e) => update("minimumDurationValue", e.target.value)} />
            <select className="input" value={editor.minimumDurationUnit} onChange={(e) => update("minimumDurationUnit", e.target.value as any)}>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </label>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <span className="help">Log progress:</span>
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => logWork(30)}>Worked 30m</button>
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => logWork(60)}>Worked 1h</button>
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => logWork(120)}>Worked 2h</button>
      </div>

      <details open={editor.advancedOpen} onToggle={(e) => update("advancedOpen", (e.currentTarget as HTMLDetailsElement).open)}>
        <summary className="btn btn-secondary btn-compact" style={{ display: "inline-flex" }}>Advanced</summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <label>
            <div className="help" style={{ marginBottom: 4 }}>Capture source</div>
            <input className="input" value={editor.captureSource} onChange={(e) => update("captureSource", e.target.value)} />
          </label>
          <label>
            <div className="help" style={{ marginBottom: 4 }}>Attributes JSON</div>
            <textarea className="input" rows={6} value={editor.attrsJson} onChange={(e) => update("attrsJson", e.target.value)} />
          </label>
        </div>
      </details>

      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={pending}>Cancel</button>
        <button type="button" className="btn" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
