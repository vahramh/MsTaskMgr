
import { useCallback, useState } from "react";
import type { EntityType, Task, WorkflowState } from "@tm/shared";
import type { TaskStatus } from "@tm/shared";
import type { CognitoTokens } from "../../../auth/tokenStore";
import type { TaskEditorModel } from "../components/taskNodeTypes";
import { parseContextTokens, serializeContextTokens } from "../contextOptions";
import { buildTaskAttributes, safeAdvancedJson, splitTaskAttributes } from "../taskMetadata";

type EditorPatch = {
  title?: string;
  description?: string;
  dueDate?: string | null;
  priority?: any | null;
  effort?: any | null;
  estimatedMinutes?: number | null;
  remainingMinutes?: number | null;
  timeSpentMinutes?: number | null;
  minimumDuration?: any | null;
  attrs?: any | null;
  entityType?: EntityType;
  state?: WorkflowState;
  context?: string | null;
  waitingFor?: string | null;
  waitingForTaskId?: string | null;
  waitingForTaskTitle?: string | null;
  resumeStateAfterWait?: "next" | "inbox" | null;
};

type Options = {
  tokens: CognitoTokens | null;
  pendingById: Record<string, true>;
  patchTask: (task: Task, partial: any, overrideStatus?: TaskStatus) => Promise<void>;
  toggleCompleteTask: (task: Task) => Promise<void>;
  removeTask: (task: Task) => Promise<void>;
  refreshExecutionModel: () => Promise<void>;
  deriveState: (task: Task) => WorkflowState;
  deriveEntityType: (task: Task) => EntityType;
  promptWaitingFor: (current?: string) => Promise<string | null>;
  promptDueDate: (current?: string) => Promise<string | null>;
  patchSubtreeNode: (task: Task, partial: EditorPatch, overrideStatus?: TaskStatus) => Promise<void>;
  reopenSubtreeNode: (task: Task) => Promise<void>;
  deleteSubtreeNode: (task: Task) => Promise<void>;
  pendingForSubtask: (task: Task) => boolean;
};

export function useTaskSurfaceController({
  tokens,
  pendingById,
  patchTask,
  toggleCompleteTask,
  removeTask,
  refreshExecutionModel,
  deriveState,
  deriveEntityType,
  promptDueDate,
  patchSubtreeNode,
  reopenSubtreeNode,
  deleteSubtreeNode,
  pendingForSubtask,
}: Options) {
  const [editor, setEditor] = useState<TaskEditorModel>(null);

  const startEdit = useCallback((t: Task) => {
    const { source } = splitTaskAttributes(t.attrs);
    setEditor({
      taskId: t.taskId,
      parentTaskId: t.parentTaskId,
      title: t.title,
      description: t.description ?? "",
      dueDate: t.dueDate ?? "",
      priority: t.priority ? String(t.priority) : "",
      effortValue: t.effort ? String(t.effort.value) : "",
      effortUnit: (t.effort?.unit ?? "hours") as any,
      estimatedMinutes: typeof t.estimatedMinutes === "number" ? String(t.estimatedMinutes) : "",
      remainingMinutes: typeof t.remainingMinutes === "number" ? String(t.remainingMinutes) : "",
      timeSpentMinutes: typeof t.timeSpentMinutes === "number" ? String(t.timeSpentMinutes) : "",
      minimumDurationValue: t.minimumDuration ? String(t.minimumDuration.value) : "",
      minimumDurationUnit: (t.minimumDuration?.unit ?? "minutes") as any,
      attrsJson: safeAdvancedJson(t.attrs),
      captureSource: source,
      advancedOpen: false,
      entityType: deriveEntityType(t),
      state: deriveState(t),
      contextTokens: parseContextTokens(t.context),
      waitingFor: t.waitingFor ?? "",
      waitingForTaskId: t.waitingForTaskId ?? "",
      waitingForTaskTitle: t.waitingForTaskTitle ?? "",
      resumeStateAfterWait: t.resumeStateAfterWait ?? "next",
    });
  }, [deriveEntityType, deriveState]);

  const buildEditorPatch = useCallback((currentEditor: Exclude<TaskEditorModel, null>, currentTask: Task) => {
    const newTitle = currentEditor.title.trim();
    const newDesc = currentEditor.description.trim();
    let advancedAttrs: Record<string, unknown> | null = null;
    const attrsTrim = currentEditor.attrsJson.trim();

    if (attrsTrim) {
      try {
        advancedAttrs = JSON.parse(attrsTrim);
      } catch {
        alert("Advanced attributes must be valid JSON");
        return null;
      }
    }

    const due = currentEditor.dueDate.trim();
    const pr = currentEditor.priority.trim();
    const ev = currentEditor.effortValue.trim();
    const md = currentEditor.minimumDurationValue.trim();
    const est = currentEditor.estimatedMinutes.trim();
    const rem = currentEditor.remainingMinutes.trim();
    const spent = currentEditor.timeSpentMinutes.trim();
    const waitingNote = currentEditor.waitingFor.trim();
    const blockerId = currentEditor.waitingForTaskId.trim();
    const blockerTitle = currentEditor.waitingForTaskTitle.trim();

    const estimatedMinutes = est ? Number(est) : null;
    const remainingMinutes = rem ? Number(rem) : null;
    const timeSpentMinutes = spent ? Number(spent) : null;
    if (
      [estimatedMinutes, remainingMinutes, timeSpentMinutes]
        .filter((value) => value !== null)
        .some((value) => !Number.isFinite(value) || (value as number) < 0)
    ) {
      alert("Estimated, remaining, and spent minutes must be non-negative numbers.");
      return null;
    }
    if (estimatedMinutes !== null && remainingMinutes !== null && remainingMinutes > estimatedMinutes) {
      alert("Remaining minutes cannot exceed estimated minutes.");
      return null;
    }
    if (currentEditor.state === "waiting" && !waitingNote && !blockerId) {
      alert("Waiting requires either a waiting note or a blocker task.");
      return null;
    }

    return {
      title: newTitle,
      description: newDesc || undefined,
      entityType: currentEditor.parentTaskId ? "action" : currentEditor.entityType,
      state: currentEditor.state,
      context: serializeContextTokens(currentEditor.contextTokens),
      waitingFor: currentEditor.state === "waiting" ? (waitingNote || null) : null,
      waitingForTaskId: currentEditor.state === "waiting" ? (blockerId || null) : null,
      waitingForTaskTitle: currentEditor.state === "waiting" ? (blockerTitle || null) : null,
      resumeStateAfterWait: currentEditor.state === "waiting" && blockerId ? currentEditor.resumeStateAfterWait : null,
      dueDate: due ? due : null,
      priority: pr ? (Number(pr) as any) : null,
      effort: ev ? { unit: currentEditor.effortUnit, value: Number(ev) } : null,
      estimatedMinutes,
      remainingMinutes,
      timeSpentMinutes,
      minimumDuration: md ? { unit: currentEditor.minimumDurationUnit, value: Number(md) } : null,
      attrs: buildTaskAttributes({
        captureSource: currentEditor.captureSource,
        advanced: advancedAttrs,
        existing: currentTask.attrs,
      }),
    };
  }, []);

  const saveEditorForNode = useCallback(
    async (node: Task) => {
      if (!editor) return;
      const patch = buildEditorPatch(editor, node);
      if (!patch) return;
      if (node.parentTaskId) await patchSubtreeNode(node, patch);
      else await patchTask(node, patch);
      setEditor(null);
    },
    [editor, buildEditorPatch, patchSubtreeNode, patchTask]
  );

  const pendingFor = useCallback(
    (node: Task) => {
      if (!node.parentTaskId) return Boolean(pendingById[node.taskId]);
      return pendingForSubtask(node);
    },
    [pendingById, pendingForSubtask]
  );

  const quickTransition = useCallback(
    async (node: Task, target: WorkflowState) => {
      const cur = deriveState(node);
      const et = deriveEntityType(node);
      if (cur === target) return;

      if (target === "next" && et !== "action") {
        alert("Only actions can be moved to Next.");
        return;
      }
      if (et === "project" && target === "next") {
        alert("Projects cannot be in Next.");
        return;
      }

      const applyPatch = async (patch: EditorPatch) => {
        if (node.parentTaskId) await patchSubtreeNode(node, patch);
        else {
          await patchTask(node, patch as any);
          await refreshExecutionModel();
        }
      };

      if (target === "waiting") {
        startEdit({ ...node, state: "waiting" } as Task);
        setEditor((prev) => prev ? { ...prev, state: "waiting" } : prev);
        return;
      }

      if (target === "scheduled") {
        const due = node.dueDate?.trim() ? node.dueDate.trim() : await promptDueDate("");
        if (!due) return;
        await applyPatch({ state: "scheduled", dueDate: due, waitingFor: null, waitingForTaskId: null, waitingForTaskTitle: null, resumeStateAfterWait: null });
        return;
      }

      if (target === "inbox") {
        await applyPatch({ state: "inbox", dueDate: null, waitingFor: null, waitingForTaskId: null, waitingForTaskTitle: null, resumeStateAfterWait: null });
        return;
      }

      await applyPatch({ state: target, waitingFor: null, waitingForTaskId: null, waitingForTaskTitle: null, resumeStateAfterWait: null });
    },
    [deriveState, deriveEntityType, patchSubtreeNode, patchTask, promptDueDate, refreshExecutionModel, startEdit]
  );

  const toggleCompleteNode = useCallback(
    async (node: Task) => {
      if (!tokens) return;
      const state = deriveState(node);

      if (!node.parentTaskId) {
        await toggleCompleteTask(node);
        await refreshExecutionModel();
        return;
      }

      if (state === "completed") {
        await reopenSubtreeNode(node);
        return;
      }

      await patchSubtreeNode(node, { state: "completed" });
    },
    [tokens, deriveState, toggleCompleteTask, refreshExecutionModel, reopenSubtreeNode, patchSubtreeNode]
  );

  const deleteNode = useCallback(
    async (node: Task) => {
      if (!tokens) return;
      if (!node.parentTaskId) {
        await removeTask(node);
        await refreshExecutionModel();
        return;
      }
      await deleteSubtreeNode(node);
    },
    [tokens, removeTask, refreshExecutionModel, deleteSubtreeNode]
  );

  return {
    editor,
    setEditor,
    startEdit,
    saveEditorForNode,
    pendingFor,
    quickTransition,
    toggleCompleteNode,
    deleteNode,
  };
}
