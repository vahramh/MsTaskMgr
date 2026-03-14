import React from "react";
import type { EntityType, WorkflowState } from "@tm/shared";
import { useSpeechToText } from "../../../hooks/useSpeechToText";

type SpeechController = ReturnType<typeof useSpeechToText>;

export function TaskCreatePanel({
  visible,
  creating,
  title,
  description,
  dueDate,
  priority,
  effortValue,
  effortUnit,
  minimumDurationValue,
  minimumDurationUnit,
  attrsJson,
  createEntityType,
  createState,
  createContext,
  createWaitingFor,
  titleError,
  descriptionError,
  attrsError,
  gtdCreateError,
  canCreate,
  descTrimLength,
  speech,
  titleRef,
  onSubmit,
  onCancel,
  onTitleChange,
  onDescriptionChange,
  onDueDateChange,
  onPriorityChange,
  onEffortValueChange,
  onEffortUnitChange,
  onMinimumDurationValueChange,
  onMinimumDurationUnitChange,
  onAttrsJsonChange,
  onCreateEntityTypeChange,
  onCreateStateChange,
  onCreateContextChange,
  onCreateWaitingForChange,
  speechErrorLabel,
}: {
  visible: boolean;
  creating: boolean;
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  effortValue: string;
  effortUnit: "hours" | "days";
  minimumDurationValue: string;
  minimumDurationUnit: "minutes" | "hours";
  attrsJson: string;
  createEntityType: EntityType;
  createState: WorkflowState;
  createContext: string;
  createWaitingFor: string;
  titleError?: string | null;
  descriptionError?: string | null;
  attrsError?: string | null;
  gtdCreateError?: string | null;
  canCreate: boolean;
  descTrimLength?: number;
  speech: SpeechController;
  titleRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onTitleChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onDueDateChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onEffortValueChange: (value: string) => void;
  onEffortUnitChange: (value: "hours" | "days") => void;
  onMinimumDurationValueChange: (value: string) => void;
  onMinimumDurationUnitChange: (value: "minutes" | "hours") => void;
  onAttrsJsonChange: (value: string) => void;
  onCreateEntityTypeChange: (value: EntityType) => void;
  onCreateStateChange: (value: WorkflowState) => void;
  onCreateContextChange: (value: string) => void;
  onCreateWaitingForChange: (value: string) => void;
  speechErrorLabel: (error: string | null) => string;
}) {
  if (!visible) return null;

  return (
    <form className="card" style={{ marginTop: 12, padding: 14 }} onSubmit={onSubmit}>
      <div className="row space-between" style={{ alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontWeight: 800 }}>Create task</div>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Close
        </button>
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div className="help" style={{ marginBottom: 4 }}>Title</div>
          <div className="speech-input-row">
            <input ref={titleRef} className="input" value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder="What needs doing?" />
            {speech.supported ? (
              <button
                type="button"
                className={`btn btn-secondary speech-mic-btn${speech.state === "listening" ? " is-listening" : ""}`}
                onClick={() => (speech.state === "listening" ? speech.stop() : speech.start())}
                title={speech.state === "listening" ? "Stop voice input" : "Start voice input"}
              >
                {speech.state === "listening" ? "●" : "🎤"}
              </button>
            ) : null}
          </div>
          {titleError ? <div className="help" style={{ color: "#991b1b", marginTop: 4 }}>{titleError}</div> : null}
          {speech.error ? <div className="help" style={{ color: "#991b1b", marginTop: 4 }}>{speechErrorLabel(speech.error)}</div> : null}
        </div>

        <div>
          <div className="help" style={{ marginBottom: 4 }}>Description</div>
          <textarea className="input" rows={3} value={description} onChange={(event) => onDescriptionChange(event.target.value)} placeholder="Optional details" />
          <div className="help" style={{ marginTop: 4 }}>{descTrimLength ?? 0} characters</div>
          {descriptionError ? <div className="help" style={{ color: "#991b1b", marginTop: 4 }}>{descriptionError}</div> : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            <div className="help" style={{ marginBottom: 4 }}>Entity type</div>
            <select className="input" value={createEntityType} onChange={(event) => onCreateEntityTypeChange(event.target.value as EntityType)}>
              <option value="action">Action</option>
              <option value="project">Project</option>
            </select>
          </label>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>Workflow state</div>
            <select className="input" value={createState} onChange={(event) => onCreateStateChange(event.target.value as WorkflowState)}>
              <option value="inbox">Inbox</option>
              <option value="next">Next</option>
              <option value="waiting">Waiting</option>
              <option value="scheduled">Scheduled</option>
              <option value="someday">Someday</option>
              <option value="reference">Reference</option>
            </select>
          </label>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>Due date</div>
            <input className="input" type="date" value={dueDate} onChange={(event) => onDueDateChange(event.target.value)} />
          </label>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>Priority</div>
            <select className="input" value={priority} onChange={(event) => onPriorityChange(event.target.value)}>
              <option value="">None</option>
              <option value="1">1</option>
              <option value="2">2</option>
              <option value="3">3</option>
              <option value="4">4</option>
              <option value="5">5</option>
            </select>
          </label>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <label>
            <div className="help" style={{ marginBottom: 4 }}>Context</div>
            <input className="input" value={createContext} onChange={(event) => onCreateContextChange(event.target.value)} placeholder="@home, @calls…" />
          </label>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>Waiting for</div>
            <input className="input" value={createWaitingFor} onChange={(event) => onCreateWaitingForChange(event.target.value)} placeholder="Required when Waiting" />
          </label>

          <div className="row" style={{ gap: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="help" style={{ marginBottom: 4 }}>Effort</div>
              <input className="input" inputMode="decimal" value={effortValue} onChange={(event) => onEffortValueChange(event.target.value)} placeholder="e.g. 2" />
            </label>
            <label style={{ width: 110 }}>
              <div className="help" style={{ marginBottom: 4 }}>Unit</div>
              <select className="input" value={effortUnit} onChange={(event) => onEffortUnitChange(event.target.value as "hours" | "days")}>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </label>
          </div>

          <div className="row" style={{ gap: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="help" style={{ marginBottom: 4 }}>Minimum block</div>
              <input className="input" inputMode="decimal" value={minimumDurationValue} onChange={(event) => onMinimumDurationValueChange(event.target.value)} placeholder="e.g. 30" />
            </label>
            <label style={{ width: 110 }}>
              <div className="help" style={{ marginBottom: 4 }}>Unit</div>
              <select className="input" value={minimumDurationUnit} onChange={(event) => onMinimumDurationUnitChange(event.target.value as "minutes" | "hours")}>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </select>
            </label>
          </div>
        </div>

        <div>
          <div className="help" style={{ marginBottom: 4 }}>Attributes JSON</div>
          <textarea className="input" rows={5} value={attrsJson} onChange={(event) => onAttrsJsonChange(event.target.value)} />
          {attrsError ? <div className="help" style={{ color: "#991b1b", marginTop: 4 }}>{attrsError}</div> : null}
          {gtdCreateError ? <div className="help" style={{ color: "#991b1b", marginTop: 4 }}>{gtdCreateError}</div> : null}
        </div>

        <div className="row" style={{ gap: 8, justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>Cancel</button>
          <button type="submit" className="btn" disabled={!canCreate || creating}>{creating ? "Creating…" : "Create"}</button>
        </div>
      </div>
    </form>
  );
}
