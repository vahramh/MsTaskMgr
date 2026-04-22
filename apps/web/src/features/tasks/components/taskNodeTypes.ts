import type { DurationUnit, EffortUnit, EntityType, WorkflowState } from "@tm/shared";
import type { HygieneSignal } from "../hygiene";

export type TaskEditorValue = {
  taskId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  effortValue: string;
  effortUnit: EffortUnit;
  estimatedMinutes: string;
  remainingMinutes: string;
  timeSpentMinutes: string;
  minimumDurationValue: string;
  minimumDurationUnit: DurationUnit;
  attrsJson: string;
  captureSource: string;
  advancedOpen: boolean;
  entityType: EntityType;
  state: WorkflowState;
  contextIds: string[];
  waitingFor: string;
  waitingForTaskId: string;
  waitingForTaskTitle: string;
  resumeStateAfterWait: "next" | "inbox";
};

export type TaskEditorModel = TaskEditorValue | null;
export type HygieneSignalViewModel = HygieneSignal;
