import React from "react";
import { priorityLabel, type EntityType, type ExecutionContext, type WorkflowState } from "@tm/shared";
import { useSpeechToText } from "../../../hooks/useSpeechToText";
import { TaskContextSelector } from "./TaskContextSelector";

type SpeechController = ReturnType<typeof useSpeechToText>;

type BlockerOption = { taskId: string; title: string };

export function TaskCreatePanel({
  visible,
  creating,
  title,
  description,
  dueDate,
  priority,
  effortValue,
  effortUnit,
  estimatedMinutes,
  remainingMinutes,
  timeSpentMinutes,
  minimumDurationValue,
  minimumDurationUnit,
  attrsJson,
  captureSource,
  advancedOpen,
  createEntityType,
  createState,
  createContextIds,
  contexts,
  createWaitingFor,
  createWaitingForTaskId,
  createWaitingForTaskTitle,
  createResumeStateAfterWait,
  blockerOptions = [],
  titleError,
  descriptionError,
  attrsError,
  progressError,
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
  onEstimatedMinutesChange,
  onRemainingMinutesChange,
  onTimeSpentMinutesChange,
  onMinimumDurationValueChange,
  onMinimumDurationUnitChange,
  onAttrsJsonChange,
  onCaptureSourceChange,
  onAdvancedOpenChange,
  onCreateEntityTypeChange,
  onCreateStateChange,
  onToggleContextToken,
  onCreateWaitingForChange,
  onCreateWaitingForTaskIdChange,
  onCreateWaitingForTaskTitleChange,
  onCreateResumeStateAfterWaitChange,
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
  estimatedMinutes: string;
  remainingMinutes: string;
  timeSpentMinutes: string;
  minimumDurationValue: string;
  minimumDurationUnit: "minutes" | "hours";
  attrsJson: string;
  captureSource: string;
  advancedOpen: boolean;
  createEntityType: EntityType;
  createState: WorkflowState;
  createContextIds: string[];
  contexts: ExecutionContext[];
  createWaitingFor: string;
  createWaitingForTaskId: string;
  createWaitingForTaskTitle: string;
  createResumeStateAfterWait: "next" | "inbox";
  blockerOptions?: BlockerOption[];
  titleError?: string | null;
  descriptionError?: string | null;
  attrsError?: string | null;
  progressError?: string | null;
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
  onEstimatedMinutesChange: (value: string) => void;
  onRemainingMinutesChange: (value: string) => void;
  onTimeSpentMinutesChange: (value: string) => void;
  onMinimumDurationValueChange: (value: string) => void;
  onMinimumDurationUnitChange: (value: "minutes" | "hours") => void;
  onAttrsJsonChange: (value: string) => void;
  onCaptureSourceChange: (value: string) => void;
  onAdvancedOpenChange: (value: boolean) => void;
  onCreateEntityTypeChange: (value: EntityType) => void;
  onCreateStateChange: (value: WorkflowState) => void;
  onToggleContextToken: (value: string) => void;
  onCreateWaitingForChange: (value: string) => void;
  onCreateWaitingForTaskIdChange: (value: string) => void;
  onCreateWaitingForTaskTitleChange: (value: string) => void;
  onCreateResumeStateAfterWaitChange: (value: "next" | "inbox") => void;
  speechErrorLabel: (error: string | null) => string;
}) {
  if (!visible) return null;

  const handleBlockerChange = (taskId: string) => {
    onCreateWaitingForTaskIdChange(taskId);
    const option = blockerOptions.find((item) => item.taskId === taskId);
    onCreateWaitingForTaskTitleChange(option?.title ?? "");
  };

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
              {[1,2,3,4,5].map((value) => (
                <option key={value} value={String(value)}>{priorityLabel(value as 1|2|3|4|5)}</option>
              ))}
            </select>
          </label>
        </div>

        <TaskContextSelector contexts={contexts} selected={createContextIds} onToggle={onToggleContextToken} />

        {createState === "waiting" ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
            <label>
              <div className="help" style={{ marginBottom: 4 }}>Blocked by task</div>
              <select className="input" value={createWaitingForTaskId} onChange={(event) => handleBlockerChange(event.target.value)}>
                <option value="">No structured blocker</option>
                {blockerOptions.map((option) => <option key={option.taskId} value={option.taskId}>{option.title}</option>)}
              </select>
            </label>
            <label>
              <div className="help" style={{ marginBottom: 4 }}>When unblocked, move to</div>
              <select className="input" value={createResumeStateAfterWait} onChange={(event) => onCreateResumeStateAfterWaitChange(event.target.value as "next" | "inbox")}>
                <option value="next">Next</option>
                <option value="inbox">Inbox</option>
              </select>
            </label>
            <label style={{ gridColumn: "1 / -1" }}>
              <div className="help" style={{ marginBottom: 4 }}>Waiting note</div>
              <input className="input" value={createWaitingFor} onChange={(event) => onCreateWaitingForChange(event.target.value)} placeholder="Optional human context, e.g. awaiting client reply" />
            </label>
            {createWaitingForTaskId && createWaitingForTaskTitle ? <div className="help">Blocker: {createWaitingForTaskTitle}</div> : null}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div className="row" style={{ gap: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="help" style={{ marginBottom: 4 }}>Effort</div>
              <input className="input" inputMode="decimal" value={effortValue} onChange={(event) => onEffortValueChange(event.target.value)} placeholder="e.g. 2" />
            </label>
            <label style={{ width: 110 }}>
              <div className="help" style={{ marginBottom: 4 }}>Unit</div>
              <select className="input" value={effortUnit} onChange={(event) => onEffortUnitChange(event.target.value as "hours" | "days") }>
                <option value="hours">hours</option>
                <option value="days">days</option>
              </select>
            </label>
          </div>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>Estimated (min)</div>
            <input className="input" inputMode="numeric" value={estimatedMinutes} onChange={(event) => onEstimatedMinutesChange(event.target.value)} placeholder="e.g. 240" />
          </label>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>Remaining (min)</div>
            <input className="input" inputMode="numeric" value={remainingMinutes} onChange={(event) => onRemainingMinutesChange(event.target.value)} placeholder="defaults to estimated" />
          </label>

          <label>
            <div className="help" style={{ marginBottom: 4 }}>Spent (min)</div>
            <input className="input" inputMode="numeric" value={timeSpentMinutes} onChange={(event) => onTimeSpentMinutesChange(event.target.value)} placeholder="optional" />
          </label>

          <div className="row" style={{ gap: 8 }}>
            <label style={{ flex: 1 }}>
              <div className="help" style={{ marginBottom: 4 }}>Minimum session</div>
              <input className="input" inputMode="decimal" value={minimumDurationValue} onChange={(event) => onMinimumDurationValueChange(event.target.value)} placeholder="e.g. 30" />
            </label>
            <label style={{ width: 110 }}>
              <div className="help" style={{ marginBottom: 4 }}>Unit</div>
              <select className="input" value={minimumDurationUnit} onChange={(event) => onMinimumDurationUnitChange(event.target.value as "minutes" | "hours") }>
                <option value="minutes">minutes</option>
                <option value="hours">hours</option>
              </select>
            </label>
          </div>
        </div>

        <details open={advancedOpen} onToggle={(event) => onAdvancedOpenChange((event.currentTarget as HTMLDetailsElement).open)}>
          <summary className="btn btn-secondary btn-compact" style={{ display: "inline-flex" }}>Advanced</summary>
          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            <label>
              <div className="help" style={{ marginBottom: 4 }}>Capture source</div>
              <input className="input" value={captureSource} onChange={(event) => onCaptureSourceChange(event.target.value)} placeholder="Optional" />
            </label>
            <label>
              <div className="help" style={{ marginBottom: 4 }}>Attributes JSON</div>
              <textarea className="input" rows={5} value={attrsJson} onChange={(event) => onAttrsJsonChange(event.target.value)} placeholder="{}" />
            </label>
          </div>
        </details>

        {attrsError ? <div className="help" style={{ color: "#991b1b" }}>{attrsError}</div> : null}
        {progressError ? <div className="help" style={{ color: "#991b1b" }}>{progressError}</div> : null}
        {gtdCreateError ? <div className="help" style={{ color: "#991b1b" }}>{gtdCreateError}</div> : null}

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button type="submit" className="btn btn-primary" disabled={!canCreate || creating}>
            {creating ? "Creating…" : "Create task"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </form>
  );
}
