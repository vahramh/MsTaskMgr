import type { EntityType, Task, WorkflowState } from "@tm/shared";
import type { HygieneSignalViewModel, TaskEditorModel } from "./taskNodeTypes";

export type TaskPresentationHelpers = {
  deriveState: (task: Task) => WorkflowState;
  deriveEntityType: (task: Task) => EntityType;
  dueTone: (dueDate?: string) => { label?: string; border?: string };
  fmtDue: (dueDate?: string) => string | null;
  renderTaskStateBadge: (state: WorkflowState) => React.ReactNode;
  formatTime?: (iso: string) => string;
  getHygieneSignals?: (task: Task, now: Date) => HygieneSignalViewModel[];
};

export type TaskSurfaceActions = {
  pendingFor: (task: Task) => boolean;
  editor: TaskEditorModel;
  setEditor: React.Dispatch<React.SetStateAction<TaskEditorModel>>;
  saveEditorForNode: (task: Task) => Promise<void>;
  startEdit: (task: Task) => void;
  quickTransition: (task: Task, state: WorkflowState) => Promise<void>;
  toggleCompleteNode: (task: Task) => Promise<void>;
  deleteNode: (task: Task) => Promise<void>;
};
