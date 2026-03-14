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
  minimumDurationValue: string;
  minimumDurationUnit: DurationUnit;
  attrsJson: string;
  entityType: EntityType;
  state: WorkflowState;
  context: string;
  waitingFor: string;
};

export type TaskEditorModel = TaskEditorValue | null;
export type HygieneSignalViewModel = HygieneSignal;
