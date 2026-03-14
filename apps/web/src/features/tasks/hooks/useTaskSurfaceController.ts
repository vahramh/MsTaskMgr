import { useCallback, useState } from "react";
import type { EntityType, Task, WorkflowState } from "@tm/shared";
import type { TaskStatus } from "@tm/shared";
import type { CognitoTokens } from "../../../auth/tokenStore";
import type { TaskEditorModel } from "../components/taskNodeTypes";

type EditorPatch = {
  title?: string;
  description?: string;
  dueDate?: string | null;
  priority?: any | null;
  effort?: any | null;
  minimumDuration?: any | null;
  attrs?: any | null;
  entityType?: EntityType;
  state?: WorkflowState;
  context?: string | null;
  waitingFor?: string | null;
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

function safeJsonStringify(v: any): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

export function useTaskSurfaceController({
  tokens,
  pendingById,
  patchTask,
  toggleCompleteTask,
  removeTask,
  refreshExecutionModel,
  deriveState,
  deriveEntityType,
  promptWaitingFor,
  promptDueDate,
  patchSubtreeNode,
  reopenSubtreeNode,
  deleteSubtreeNode,
  pendingForSubtask,
}: Options) {
  const [editor, setEditor] = useState<TaskEditorModel>(null);

  const startEdit = useCallback((t: Task) => {
    setEditor({
      taskId: t.taskId,
      parentTaskId: t.parentTaskId,
      title: t.title,
      description: t.description ?? "",
      dueDate: t.dueDate ?? "",
      priority: t.priority ? String(t.priority) : "",
      effortValue: t.effort ? String(t.effort.value) : "",
      effortUnit: (t.effort?.unit ?? "hours") as any,
      minimumDurationValue: t.minimumDuration ? String(t.minimumDuration.value) : "",
      minimumDurationUnit: (t.minimumDuration?.unit ?? "minutes") as any,
      attrsJson: safeJsonStringify(t.attrs),
      entityType: deriveEntityType(t),
      state: deriveState(t),
      context: t.context ?? "",
      waitingFor: t.waitingFor ?? "",
    });
  }, [deriveEntityType, deriveState]);

  const buildEditorPatch = useCallback((currentEditor: Exclude<TaskEditorModel, null>) => {
    const newTitle = currentEditor.title.trim();
    const newDesc = currentEditor.description.trim();
    let attrs: any = undefined;
    const attrsTrim = currentEditor.attrsJson.trim();

    if (attrsTrim) {
      try {
        attrs = JSON.parse(attrsTrim);
      } catch {
        alert("Attributes must be valid JSON");
        return null;
      }
    }

    const due = currentEditor.dueDate.trim();
    const pr = currentEditor.priority.trim();
    const ev = currentEditor.effortValue.trim();
    const md = currentEditor.minimumDurationValue.trim();

    return {
      title: newTitle,
      description: newDesc || undefined,
      entityType: currentEditor.parentTaskId ? "action" : currentEditor.entityType,
      state: currentEditor.state,
      context: currentEditor.context.trim() ? currentEditor.context.trim() : null,
      waitingFor:
        currentEditor.state === "waiting"
          ? currentEditor.waitingFor.trim()
            ? currentEditor.waitingFor.trim()
            : null
          : null,
      dueDate: due ? due : null,
      priority: pr ? (Number(pr) as any) : null,
      effort: ev ? { unit: currentEditor.effortUnit, value: Number(ev) } : null,
      minimumDuration: md ? { unit: currentEditor.minimumDurationUnit, value: Number(md) } : null,
      attrs: attrsTrim ? attrs : null,
    };
  }, []);

  const saveEditorForNode = useCallback(
    async (node: Task) => {
      if (!editor) return;
      const patch = buildEditorPatch(editor);
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
        const wf = await promptWaitingFor(node.waitingFor);
        if (!wf) return;
        await applyPatch({ state: "waiting", waitingFor: wf });
        return;
      }

      if (target === "scheduled") {
        const due = node.dueDate?.trim() ? node.dueDate.trim() : await promptDueDate("");
        if (!due) return;
        await applyPatch({ state: "scheduled", dueDate: due });
        return;
      }

      if (target === "inbox") {
        await applyPatch({ state: "inbox", dueDate: null, waitingFor: null });
        return;
      }

      await applyPatch({ state: target, waitingFor: null });
    },
    [deriveState, deriveEntityType, patchSubtreeNode, patchTask, promptDueDate, promptWaitingFor, refreshExecutionModel]
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
