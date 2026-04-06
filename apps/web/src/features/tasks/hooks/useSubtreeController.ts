import { useCallback, useRef, useState } from "react";
import type { EntityType, Task, WorkflowState } from "@tm/shared";
import type { CognitoTokens } from "../../../auth/tokenStore";
import { createSubtask, deleteSubtask, listSubtasks, reopenSubtask, updateSubtask } from "../api";
import { handleConflict, isAbortError, toUiError, type UiError } from "../taskUi";

export type SubtreeState = {
  items: Task[];
  loaded: boolean;
  loading: boolean;
  loadingMore?: boolean;
  nextToken?: string;
};

type PatchInput = {
  title?: string;
  description?: string;
  dueDate?: string | null;
  priority?: any | null;
  effort?: any | null;
  minimumDuration?: any | null;
  attrs?: any | null;
  status?: any;
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
  clearAllErrors: () => void;
  refreshExecutionModel: () => Promise<void>;
};

function nowIso(): string {
  return new Date().toISOString();
}

function nullToUndefined<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

function makeTempSubtask(parentTaskId: string, title: string): Task {
  const now = nowIso();
  return {
    taskId: `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    parentTaskId,
    title,
    status: "OPEN",
    entityType: "action",
    state: "inbox",
    createdAt: now,
    updatedAt: now,
    rev: 0,
  } as Task;
}

export function useSubtreeController({ tokens, clearAllErrors, refreshExecutionModel }: Options) {
  const [subError, setSubError] = useState<UiError | null>(null);
  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const [subtrees, setSubtrees] = useState<Record<string, SubtreeState>>({});
  const subtreesRef = useRef<Record<string, SubtreeState>>({});
  subtreesRef.current = subtrees;

  const [subPendingByKey, setSubPendingByKey] = useState<Record<string, true>>({});
  const [newChildTitle, setNewChildTitle] = useState<Record<string, string>>({});
  const subAbortRef = useRef<Map<string, AbortController>>(new Map());

  const setSubtreesSync = useCallback(
    (updater: (prev: Record<string, SubtreeState>) => Record<string, SubtreeState>) => {
      setSubtrees((prev) => {
        const next = updater(prev);
        subtreesRef.current = next;
        return next;
      });
    },
    []
  );

  const isExpanded = useCallback((taskId: string) => Boolean(expanded[taskId]), [expanded]);

  const setExpandedOn = useCallback((taskId: string, on: boolean) => {
    setExpanded((prev) => {
      const next = { ...prev };
      if (on) next[taskId] = true;
      else delete next[taskId];
      return next;
    });
  }, []);

  const setSubPending = useCallback((parentTaskId: string, taskId: string, on: boolean) => {
    const key = `${parentTaskId}/${taskId}`;
    setSubPendingByKey((prev) => {
      const next = { ...prev };
      if (on) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const getSubtree = useCallback((parentTaskId: string): SubtreeState => {
    return subtreesRef.current[parentTaskId] ?? { items: [], loaded: false, loading: false };
  }, []);

  const pendingForSubtask = useCallback(
    (node: Task) => {
      if (!node.parentTaskId) return false;
      return Boolean(subPendingByKey[`${node.parentTaskId}/${node.taskId}`]);
    },
    [subPendingByKey]
  );

  const loadChildren = useCallback(
    async (parentTaskId: string, force: boolean = false) => {
      if (!tokens) return;

      clearAllErrors();
      const existing = getSubtree(parentTaskId);
      if (existing.loaded && !force) return;

      subAbortRef.current.get(parentTaskId)?.abort();
      const ac = new AbortController();
      subAbortRef.current.set(parentTaskId, ac);

      setSubtreesSync((prev) => ({
        ...prev,
        [parentTaskId]: { ...existing, loading: true },
      }));

      try {
        const r = await listSubtasks(tokens, parentTaskId, { limit: 50 }, ac.signal);
        if (subAbortRef.current.get(parentTaskId) !== ac) return;

        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { items: r.items, loaded: true, loading: false, nextToken: r.nextToken },
        }));
      } catch (e) {
        if (isAbortError(e)) return;
        setSubError(toUiError(e));
        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { ...existing, loaded: existing.loaded, loading: false },
        }));
      }
    },
    [tokens, clearAllErrors, getSubtree, setSubtreesSync]
  );

  const loadMoreChildren = useCallback(
    async (parentTaskId: string) => {
      if (!tokens) return;

      const st = getSubtree(parentTaskId);
      if (!st.loaded || !st.nextToken || st.loading || st.loadingMore) return;

      clearAllErrors();
      subAbortRef.current.get(parentTaskId)?.abort();
      const ac = new AbortController();
      subAbortRef.current.set(parentTaskId, ac);

      setSubtreesSync((prev) => ({
        ...prev,
        [parentTaskId]: { ...st, loadingMore: true },
      }));

      try {
        const r = await listSubtasks(tokens, parentTaskId, { limit: 50, nextToken: st.nextToken }, ac.signal);
        if (subAbortRef.current.get(parentTaskId) !== ac) return;

        setSubtreesSync((prev) => {
          const cur = prev[parentTaskId] ?? st;
          const merged = [...(cur.items ?? [])];
          const seen = new Set(merged.map((x) => x.taskId));
          for (const it of r.items) {
            if (!seen.has(it.taskId)) {
              merged.push(it);
              seen.add(it.taskId);
            }
          }
          return {
            ...prev,
            [parentTaskId]: {
              ...cur,
              items: merged,
              loaded: true,
              loading: false,
              loadingMore: false,
              nextToken: r.nextToken,
            },
          };
        });
      } catch (e) {
        if (isAbortError(e)) return;
        setSubError(toUiError(e));
        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { ...st, loadingMore: false },
        }));
      }
    },
    [tokens, getSubtree, clearAllErrors, setSubtreesSync]
  );

  const toggleExpand = useCallback(
    async (taskId: string) => {
      const on = !isExpanded(taskId);
      setExpandedOn(taskId, on);
      if (on) await loadChildren(taskId);
    },
    [isExpanded, setExpandedOn, loadChildren]
  );

  const createChild = useCallback(
    async (parentTaskId: string) => {
      if (!tokens) return;
      const title = (newChildTitle[parentTaskId] ?? "").trim();
      if (!title) return;

      clearAllErrors();
      const optimistic = makeTempSubtask(parentTaskId, title);
      setSubtreesSync((prev) => {
        const st = prev[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prev,
          [parentTaskId]: { ...st, loaded: true, items: [optimistic, ...st.items] },
        };
      });
      setNewChildTitle((prev) => ({ ...prev, [parentTaskId]: "" }));

      setSubPending(parentTaskId, optimistic.taskId, true);
      try {
        const r = await createSubtask(tokens, parentTaskId, { title, entityType: "action", state: "inbox" });
        await refreshExecutionModel();
        setSubtreesSync((prev) => {
          const st = prev[parentTaskId] ?? { items: [], loaded: true, loading: false };
          return {
            ...prev,
            [parentTaskId]: {
              ...st,
              items: st.items.map((t) => (t.taskId === optimistic.taskId ? r.task : t)),
            },
          };
        });
      } catch (e) {
        setSubtreesSync((prev) => {
          const st = prev[parentTaskId] ?? { items: [], loaded: true, loading: false };
          return {
            ...prev,
            [parentTaskId]: { ...st, items: st.items.filter((t) => t.taskId !== optimistic.taskId) },
          };
        });
        if (isAbortError(e)) return;
        setSubError(toUiError(e));
      } finally {
        setSubPending(parentTaskId, optimistic.taskId, false);
      }
    },
    [tokens, newChildTitle, clearAllErrors, setSubPending, refreshExecutionModel, setSubtreesSync]
  );

  const patchSubtreeNode = useCallback(
    async (node: Task, partial: PatchInput, overrideStatus?: any) => {
      if (!tokens || !node.parentTaskId) return;

      const parentTaskId = node.parentTaskId;
      clearAllErrors();

      const prev = node;
      const optimistic: Task = {
        ...prev,
        title: partial.title ?? prev.title,
        description: partial.description ?? prev.description,
        status: overrideStatus ?? partial.status ?? prev.status,
        schemaVersion: prev.schemaVersion,
        entityType: partial.entityType ?? prev.entityType,
        state: partial.state ?? prev.state,
        context: partial.context === undefined ? prev.context : nullToUndefined(partial.context as any),
        waitingFor: partial.waitingFor === undefined ? prev.waitingFor : nullToUndefined(partial.waitingFor as any),
        waitingForTaskId: partial.waitingForTaskId === undefined ? prev.waitingForTaskId : nullToUndefined(partial.waitingForTaskId as any),
        waitingForTaskTitle: partial.waitingForTaskTitle === undefined ? prev.waitingForTaskTitle : nullToUndefined(partial.waitingForTaskTitle as any),
        resumeStateAfterWait: partial.resumeStateAfterWait === undefined ? prev.resumeStateAfterWait : nullToUndefined(partial.resumeStateAfterWait as any),
        dueDate: partial.dueDate === undefined ? prev.dueDate : nullToUndefined(partial.dueDate),
        priority: partial.priority === undefined ? prev.priority : nullToUndefined(partial.priority),
        effort: partial.effort === undefined ? prev.effort : nullToUndefined(partial.effort),
        minimumDuration:
          partial.minimumDuration === undefined ? prev.minimumDuration : nullToUndefined(partial.minimumDuration),
        attrs: partial.attrs === undefined ? prev.attrs : nullToUndefined(partial.attrs),
        updatedAt: nowIso(),
      };

      setSubPending(parentTaskId, prev.taskId, true);
      setSubtreesSync((prevMap) => {
        const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prevMap,
          [parentTaskId]: {
            ...st,
            items: st.items.map((t) => (t.taskId === prev.taskId ? optimistic : t)),
          },
        };
      });

      try {
        const r = await updateSubtask(tokens, parentTaskId, prev.taskId, {
          ...(partial as any),
          status: overrideStatus ?? partial.status,
          expectedRev: prev.rev,
        });
        await refreshExecutionModel();
        setSubtreesSync((prevMap) => {
          const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
          return {
            ...prevMap,
            [parentTaskId]: {
              ...st,
              items: st.items.map((t) => (t.taskId === prev.taskId ? r.task : t)),
            },
          };
        });
      } catch (e) {
        setSubtreesSync((prevMap) => {
          const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
          return {
            ...prevMap,
            [parentTaskId]: {
              ...st,
              items: st.items.map((t) => (t.taskId === prev.taskId ? prev : t)),
            },
          };
        });
        if (isAbortError(e)) return;
        const reloaded = await handleConflict(e, () => loadChildren(parentTaskId, true), setSubError);
        if (!reloaded) setSubError(toUiError(e));
      } finally {
        setSubPending(parentTaskId, prev.taskId, false);
      }
    },
    [tokens, clearAllErrors, setSubPending, setSubtreesSync, refreshExecutionModel, loadChildren]
  );

  const reopenSubtreeNode = useCallback(
    async (node: Task) => {
      if (!tokens || !node.parentTaskId) return;

      const parentTaskId = node.parentTaskId;
      clearAllErrors();
      const prev = node;
      setSubPending(parentTaskId, prev.taskId, true);

      const optimistic: Task = {
        ...prev,
        state: prev.dueDate ? "scheduled" : "inbox",
        status: "OPEN",
        updatedAt: nowIso(),
      };

      setSubtreesSync((prevMap) => {
        const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prevMap,
          [parentTaskId]: {
            ...st,
            items: st.items.map((t) => (t.taskId === prev.taskId ? optimistic : t)),
          },
        };
      });

      try {
        const r = await reopenSubtask(tokens, parentTaskId, prev.taskId, prev.rev);
        await refreshExecutionModel();
        setSubtreesSync((prevMap) => {
          const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
          return {
            ...prevMap,
            [parentTaskId]: {
              ...st,
              items: st.items.map((t) => (t.taskId === prev.taskId ? r.task : t)),
            },
          };
        });
      } catch (e) {
        setSubtreesSync((prevMap) => {
          const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
          return {
            ...prevMap,
            [parentTaskId]: {
              ...st,
              items: st.items.map((t) => (t.taskId === prev.taskId ? prev : t)),
            },
          };
        });
        if (isAbortError(e)) return;
        const reloaded = await handleConflict(e, () => loadChildren(parentTaskId, true), setSubError);
        if (!reloaded) setSubError(toUiError(e));
      } finally {
        setSubPending(parentTaskId, prev.taskId, false);
      }
    },
    [tokens, clearAllErrors, setSubPending, setSubtreesSync, refreshExecutionModel, loadChildren]
  );

  const deleteSubtreeNode = useCallback(
    async (node: Task) => {
      if (!tokens || !node.parentTaskId) return;

      const parentTaskId = node.parentTaskId;
      clearAllErrors();
      const snapshot = getSubtree(parentTaskId).items;
      setSubPending(parentTaskId, node.taskId, true);

      setSubtreesSync((prevMap) => {
        const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prevMap,
          [parentTaskId]: { ...st, items: st.items.filter((t) => t.taskId !== node.taskId) },
        };
      });

      try {
        await deleteSubtask(tokens, parentTaskId, node.taskId);
        await refreshExecutionModel();
      } catch (e) {
        setSubtreesSync((prevMap) => {
          const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
          return {
            ...prevMap,
            [parentTaskId]: { ...st, items: snapshot },
          };
        });
        if (isAbortError(e)) return;
        const reloaded = await handleConflict(e, () => loadChildren(parentTaskId, true), setSubError);
        if (!reloaded) setSubError(toUiError(e));
      } finally {
        setSubPending(parentTaskId, node.taskId, false);
      }
    },
    [tokens, clearAllErrors, getSubtree, setSubPending, setSubtreesSync, refreshExecutionModel, loadChildren]
  );

  return {
    subError,
    setSubError,
    expanded,
    subtrees,
    newChildTitle,
    setNewChildTitle,
    getSubtree,
    isExpanded,
    setExpandedOn,
    loadChildren,
    loadMoreChildren,
    toggleExpand,
    createChild,
    patchSubtreeNode,
    reopenSubtreeNode,
    deleteSubtreeNode,
    pendingForSubtask,
  };
}
