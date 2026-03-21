import type { Task, WorkflowState } from "@tm/shared";

const TARGET_STATES: WorkflowState[] = ["inbox", "next", "waiting", "scheduled", "someday"];

export function InboxProjectAttachPanel({
  task,
  projects,
  selectedProjectId,
  targetState,
  pending,
  onClose,
  onProjectChange,
  onTargetStateChange,
  onSubmit,
}: {
  task: Task;
  projects: Task[];
  selectedProjectId: string;
  targetState: WorkflowState;
  pending: boolean;
  onClose: () => void;
  onProjectChange: (value: string) => void;
  onTargetStateChange: (value: WorkflowState) => void;
  onSubmit: () => void;
}) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e5e7eb" }}>
      <div className="row space-between" style={{ alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>File under project</div>
        <button className="btn btn-secondary" onClick={onClose} disabled={pending}>
          Close
        </button>
      </div>

      <div className="help" style={{ marginTop: 6 }}>
        Move this Inbox item into an existing project as a child action, and choose the state it should have there.
      </div>

      <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
        <label>
          <div className="help" style={{ marginBottom: 4 }}>Project</div>
          <select
            className="input"
            value={selectedProjectId}
            onChange={(event) => onProjectChange(event.target.value)}
            disabled={pending}
          >
            <option value="">Select project…</option>
            {projects.map((project) => (
              <option key={project.taskId} value={project.taskId}>
                {project.title}
              </option>
            ))}
          </select>
        </label>

        <label>
          <div className="help" style={{ marginBottom: 4 }}>Resulting state</div>
          <select
            className="input"
            value={targetState}
            onChange={(event) => onTargetStateChange(event.target.value as WorkflowState)}
            disabled={pending}
          >
            {TARGET_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </label>

        {targetState === "waiting" && !task.waitingFor?.trim() ? (
          <div className="help" style={{ color: "#92400e" }}>
            This task does not currently have a “Waiting for” value. It is better to edit that after filing it.
          </div>
        ) : null}

        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button className="btn btn-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button className="btn" onClick={onSubmit} disabled={pending || !selectedProjectId}>
            {pending ? "Filing…" : "File under project"}
          </button>
        </div>
      </div>
    </div>
  );
}
