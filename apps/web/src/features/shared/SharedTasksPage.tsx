import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Task, SharedTaskPointer, WorkflowState, EntityType } from "@tm/shared";
import { useAuth } from "../../auth/AuthContext";
import InlineAlert from "../../components/InlineAlert";
import { ApiError } from "../../api/http";
import {
  createSharedSubtask,
  deleteSharedSubtask,
  getSharedRoot,
  listSharedSubtasks,
  listSharedWithMe,
  updateSharedRoot,
  updateSharedSubtask,
  reopenSharedRoot,
  reopenSharedSubtask,
} from "../tasks/api";

function deriveState(t: Task): WorkflowState {
  if (t.state) return t.state;
  if (t.status === "COMPLETED") return "completed";
  return t.dueDate ? "scheduled" : "inbox";
}

function deriveEntityType(t: Task): EntityType {
  return t.entityType ?? "action";
}

function stateLabel(s: WorkflowState): string {
  switch (s) {
    case "inbox":
      return "Inbox";
    case "next":
      return "Next";
    case "waiting":
      return "Waiting";
    case "scheduled":
      return "Scheduled";
    case "someday":
      return "Someday";
    case "reference":
      return "Reference";
    case "completed":
      return "Completed";
  }
}

type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

type SubtreeState = {
  items: Task[];
  loaded: boolean;
  loading: boolean;
  loadingMore?: boolean;
  nextToken?: string;
};

type Editor = {
  taskId: string;
  parentTaskId?: string;
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  effortValue: string;
  effortUnit: "hours" | "days";
  attrsJson: string;
  entityType: EntityType;
  state: WorkflowState;
  context: string;
  waitingFor: string;
} | null;

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e && typeof e === "object") {
    const any = e as any;
    if (any.name === "AbortError") return true;
    const msg = typeof any.message === "string" ? any.message : "";
    if (msg.toLowerCase().includes("signal is aborted")) return true;
    if (msg.toLowerCase().includes("aborted")) return true;
  }
  return false;
}

function toUiError(e: unknown): UiError {
  if (e instanceof ApiError) {
    return { message: e.message, requestId: e.requestId, code: e.code, status: e.status };
  }
  if (e && typeof e === "object") {
    const any = e as any;
    return { message: any.message ?? String(e) };
  }
  return { message: String(e) };
}

async function tryCopy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

function safeJsonStringify(v: any): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function nullToUndefined<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

function nowIso(): string {
  return new Date().toISOString();
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function fmtDue(dueDate?: string): string | null {
  if (!dueDate) return null;
  try {
    const d = new Date(dueDate);
    if (Number.isNaN(d.getTime())) return dueDate;
    return d.toLocaleDateString();
  } catch {
    return dueDate;
  }
}

function dueTone(dueDate?: string): { label?: string; border?: string } {
  if (!dueDate) return {};
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return {};
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDue - startOfToday) / (1000 * 60 * 60 * 24));

  if (days < 0) return { label: "Overdue", border: "#dc2626" };
  if (days === 0) return { label: "Due today", border: "#f59e0b" };
  if (days <= 3) return { label: `Due in ${days}d`, border: "#fbbf24" };
  if (days <= 7) return { label: `Due in ${days}d`, border: "#22c55e" };
  return { label: `Due in ${days}d`, border: "#9ca3af" };
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

async function handleConflict(
  e: unknown,
  reloadFn: () => Promise<void>,
  setErr: (e: UiError) => void
): Promise<boolean> {
  if (e instanceof ApiError && e.status === 409 && typeof (e.details as any)?.expectedRev === "number") {
    setErr({
      message: "This task was updated elsewhere. Reloading…",
      requestId: e.requestId,
      code: e.code,
      status: e.status,
    });
    await reloadFn();
    return true;
  }
  return false;
}

function TaskCardSkeleton({ count = 3 }: { count?: number }) {
  const line: React.CSSProperties = { height: 12, borderRadius: 8, background: "#e5e7eb" };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 14 }}>
          <div style={{ ...line, width: "60%" }} />
          <div style={{ ...line, width: "35%", marginTop: 10, opacity: 0.8 }} />
          <div style={{ ...line, width: "75%", marginTop: 10, opacity: 0.6 }} />
        </div>
      ))}
    </div>
  );
}

export default function SharedTasksPage() {
  const { tokens } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = (searchParams.get("view") ?? "inbox") as string;
  const view: WorkflowState = (["inbox","next","waiting","scheduled","someday","reference","completed"].includes(viewParam) ? (viewParam as any) : "inbox");

  const listAbortRef = useRef<AbortController | null>(null);
  const rootAbortRef = useRef<AbortController | null>(null);
  const subtreeAbortRef = useRef<Map<string, AbortController>>(new Map());

  const [items, setItems] = useState<Array<SharedTaskPointer & { task?: Task }>>([]);
  const [nextToken, setNextToken] = useState<string | undefined>(undefined);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [error, setError] = useState<UiError | null>(null);

  const [selected, setSelected] = useState<(SharedTaskPointer & { task?: Task }) | null>(null);
  const [rootLoading, setRootLoading] = useState<boolean>(false);
  const [rootError, setRootError] = useState<UiError | null>(null);

  const [editor, setEditor] = useState<Editor>(null);

  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const [subtrees, setSubtrees] = useState<Record<string, SubtreeState>>({});
  const subtreesRef = useRef<Record<string, SubtreeState>>({});
  // Keep ref in sync during render so reads are never one-render behind.
  subtreesRef.current = subtrees;

  const setSubtreesSync = useCallback(
    (
      updater: (prev: Record<string, SubtreeState>) => Record<string, SubtreeState>
    ) => {
      setSubtrees((prev) => {
        const next = updater(prev);
        subtreesRef.current = next;
        return next;
      });
    },
    []
  );
  const [pendingByKey, setPendingByKey] = useState<Record<string, true>>({});
  const [newChildTitle, setNewChildTitle] = useState<Record<string, string>>({});

  const hasMore = !!nextToken;
  const canEdit = selected?.mode === "EDIT";

  const visibleShared = useMemo(() => {
    return items.filter((it) => {
      if (!it.task) return true;
      return deriveState(it.task) === view;
    });
  }, [items, view]);

  const selectedTitle = useMemo(() => {
    if (!selected) return "";
    const t = selected.task?.title?.trim();
    return t ? t : selected.rootTaskId;
  }, [selected]);

  const getSubtree = useCallback(
    (parentTaskId: string): SubtreeState => subtrees[parentTaskId] ?? { items: [], loaded: false, loading: false },
    [subtrees]
  );

  const setPending = useCallback((parentTaskId: string | "root", taskId: string, on: boolean) => {
    const key = `${parentTaskId}/${taskId}`;
    setPendingByKey((prev) => {
      const next = { ...prev };
      if (on) next[key] = true;
      else delete next[key];
      return next;
    });
  }, []);

  const pendingFor = useCallback(
    (node: Task) => Boolean(pendingByKey[`${node.parentTaskId ?? "root"}/${node.taskId}`]),
    [pendingByKey]
  );

  const clearSelectionState = useCallback(() => {
    rootAbortRef.current?.abort();
    for (const ac of subtreeAbortRef.current.values()) ac.abort();
    subtreeAbortRef.current.clear();
    setRootError(null);
    setRootLoading(false);
    setExpanded({});
    setSubtreesSync(() => ({}));
    setPendingByKey({});
    setNewChildTitle({});
    setEditor(null);
  }, []);

  const loadRoot = useCallback(
    async (ptr: SharedTaskPointer & { task?: Task }, force: boolean = false) => {
      if (!tokens) return;

      if (!force && ptr.task) return;

      rootAbortRef.current?.abort();
      const ac = new AbortController();
      rootAbortRef.current = ac;
      setRootLoading(true);
      setRootError(null);

      try {
        const resp = await getSharedRoot(tokens, ptr.ownerSub, ptr.rootTaskId, ac.signal);
        setSelected((prev) => {
          if (!prev) return prev;
          if (prev.ownerSub !== ptr.ownerSub || prev.rootTaskId !== ptr.rootTaskId) return prev;
          return { ...prev, task: resp.task };
        });
        setItems((prev) =>
          prev.map((it) =>
            it.ownerSub === ptr.ownerSub && it.rootTaskId === ptr.rootTaskId ? { ...it, task: resp.task } : it
          )
        );
      } catch (e) {
        if (isAbortError(e)) return;
        setRootError(toUiError(e));
      } finally {
        setRootLoading(false);
      }
    },
    [tokens]
  );

  const loadChildren = useCallback(
    async (ownerSub: string, rootTaskId: string, parentTaskId: string, force: boolean = false) => {
      if (!tokens) return;

      const existing = getSubtree(parentTaskId);
      if (existing.loaded && !force) return;

      const prevAc = subtreeAbortRef.current.get(parentTaskId);
      prevAc?.abort();
      const ac = new AbortController();
      subtreeAbortRef.current.set(parentTaskId, ac);

      setSubtreesSync((prev) => ({
        ...prev,
        [parentTaskId]: { ...existing, loading: true },
      }));

      try {
        const r = await listSharedSubtasks(tokens, ownerSub, rootTaskId, parentTaskId, { limit: 50 }, ac.signal);
        if (subtreeAbortRef.current.get(parentTaskId) !== ac) return;
        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { items: r.items, loaded: true, loading: false, nextToken: r.nextToken },
        }));
      } catch (e) {
        if (isAbortError(e)) return;
        setRootError(toUiError(e));
        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { ...existing, loading: false, loaded: existing.loaded },
        }));
      }
    },
    [tokens, getSubtree]
  );

  const loadMoreChildren = useCallback(
    async (ownerSub: string, rootTaskId: string, parentTaskId: string) => {
      if (!tokens) return;
      const st = getSubtree(parentTaskId);
      if (!st.loaded || !st.nextToken || st.loading || st.loadingMore) return;

      const prevAc = subtreeAbortRef.current.get(parentTaskId);
      prevAc?.abort();
      const ac = new AbortController();
      subtreeAbortRef.current.set(parentTaskId, ac);

      setSubtreesSync((prev) => ({
        ...prev,
        [parentTaskId]: { ...st, loadingMore: true },
      }));

      try {
        const r = await listSharedSubtasks(tokens, ownerSub, rootTaskId, parentTaskId, { limit: 50, nextToken: st.nextToken }, ac.signal);
        if (subtreeAbortRef.current.get(parentTaskId) !== ac) return;
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
        setRootError(toUiError(e));
        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { ...st, loadingMore: false },
        }));
      }
    },
    [tokens, getSubtree]
  );

  const toggleExpand = useCallback(
    async (ownerSub: string, rootTaskId: string, taskId: string) => {
      const on = !Boolean(expanded[taskId]);
      setExpanded((prev) => {
        const next = { ...prev };
        if (on) next[taskId] = true;
        else delete next[taskId];
        return next;
      });
      if (on) await loadChildren(ownerSub, rootTaskId, taskId);
    },
    [expanded, loadChildren]
  );

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
      attrsJson: safeJsonStringify(t.attrs),
      // Phase 5 (GTD UX)
      entityType: deriveEntityType(t),
      state: deriveState(t),
      context: t.context ?? "",
      waitingFor: t.waitingFor ?? "",
    });
  }, []);

  const patchNode = useCallback(
    async (
      ptr: SharedTaskPointer,
      node: Task,
      partial: {
        title?: string;
        description?: string;
        dueDate?: string | null;
        priority?: any | null;
        effort?: any | null;
        attrs?: any | null;
        status?: any;
        // Phase 5 (GTD UX)
        entityType?: EntityType;
        state?: WorkflowState;
        context?: string | null;
        waitingFor?: string | null;
      },
      overrideStatus?: any
    ) => {
      if (!tokens) return;
      if (ptr.mode !== "EDIT") return;

      const prev = node;
      const optimistic: Task = {
        ...prev,
        title: partial.title ?? prev.title,
        description: partial.description ?? prev.description,
        status: overrideStatus ?? partial.status ?? prev.status,

        // GTD fields
        schemaVersion: prev.schemaVersion,
        entityType: partial.entityType ?? prev.entityType,
        state: partial.state ?? prev.state,
        context: partial.context === undefined ? prev.context : nullToUndefined(partial.context as any),
        waitingFor: partial.waitingFor === undefined ? prev.waitingFor : nullToUndefined(partial.waitingFor as any),
        dueDate: partial.dueDate === undefined ? prev.dueDate : nullToUndefined(partial.dueDate),
        priority: partial.priority === undefined ? prev.priority : nullToUndefined(partial.priority),
        effort: partial.effort === undefined ? prev.effort : nullToUndefined(partial.effort),
        attrs: partial.attrs === undefined ? prev.attrs : nullToUndefined(partial.attrs),
        updatedAt: nowIso(),
      };

      // Root task
      if (!prev.parentTaskId) {
        setPending("root", prev.taskId, true);
        setSelected((cur) => (cur ? { ...cur, task: optimistic } : cur));
        setItems((list) =>
          list.map((it) =>
            it.ownerSub === ptr.ownerSub && it.rootTaskId === ptr.rootTaskId ? { ...it, task: optimistic } : it
          )
        );
        try {
          const r = await updateSharedRoot(tokens, ptr.ownerSub, ptr.rootTaskId, {
            ...(partial as any),
            status: overrideStatus ?? partial.status,
            expectedRev: prev.rev,
          });
          setSelected((cur) => (cur ? { ...cur, task: r.task } : cur));
          setItems((list) =>
            list.map((it) =>
              it.ownerSub === ptr.ownerSub && it.rootTaskId === ptr.rootTaskId ? { ...it, task: r.task } : it
            )
          );
        } catch (e) {
          setSelected((cur) => (cur ? { ...cur, task: prev } : cur));
          setItems((list) =>
            list.map((it) =>
              it.ownerSub === ptr.ownerSub && it.rootTaskId === ptr.rootTaskId ? { ...it, task: prev } : it
            )
          );
          if (isAbortError(e)) return;
          const reloaded = await handleConflict(e, () => loadRoot(ptr as any, true), setRootError);
          if (!reloaded) setRootError(toUiError(e));
        } finally {
          setPending("root", prev.taskId, false);
        }
        return;
      }

      // Subtask
      const parentTaskId = prev.parentTaskId;
      setPending(parentTaskId, prev.taskId, true);
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
        const r = await updateSharedSubtask(tokens, ptr.ownerSub, ptr.rootTaskId, parentTaskId, prev.taskId, {
          ...(partial as any),
          status: overrideStatus ?? partial.status,
          expectedRev: prev.rev,
        });
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
        const reloaded = await handleConflict(e, () => loadChildren(ptr.ownerSub, ptr.rootTaskId, parentTaskId, true), setRootError);
        if (!reloaded) setRootError(toUiError(e));
      } finally {
        setPending(parentTaskId, prev.taskId, false);
      }
    },
    [tokens, setPending, loadChildren, loadRoot]
  );

  

const toggleCompleteNode = useCallback(
  async (ptr: SharedTaskPointer, node: Task) => {
    if (!tokens) return;

    const ownerSub = ptr.ownerSub;
    const rootTaskId = ptr.rootTaskId;

    const prev = node;
    const state = deriveState(node);
    const isRoot = !node.parentTaskId;

    const optimisticReopened: Task = {
      ...node,
      state: node.dueDate ? "scheduled" : "inbox",
      status: "OPEN",
      updatedAt: nowIso(),
    };
    const optimisticCompleted: Task = { ...node, state: "completed", status: "COMPLETED", updatedAt: nowIso() };
    const optimistic = state === "completed" ? optimisticReopened : optimisticCompleted;

    if (isRoot) {
      setPending("root", prev.taskId, true);

      setSelected((cur) => (cur ? { ...cur, task: optimistic } : cur));
      setItems((list) =>
        list.map((it) =>
          it.ownerSub === ownerSub && it.rootTaskId === rootTaskId ? { ...it, task: optimistic } : it
        )
      );

      try {
        const r =
          state === "completed"
            ? await reopenSharedRoot(tokens, ownerSub, rootTaskId, prev.rev)
            : await updateSharedRoot(tokens, ownerSub, rootTaskId, { state: "completed", expectedRev: prev.rev } as any);

        setSelected((cur) => (cur ? { ...cur, task: r.task } : cur));
        setItems((list) =>
          list.map((it) =>
            it.ownerSub === ownerSub && it.rootTaskId === rootTaskId ? { ...it, task: r.task } : it
          )
        );
      } catch (e) {
        setSelected((cur) => (cur ? { ...cur, task: prev } : cur));
        setItems((list) =>
          list.map((it) =>
            it.ownerSub === ownerSub && it.rootTaskId === rootTaskId ? { ...it, task: prev } : it
          )
        );
        if (isAbortError(e)) return;
        const reloaded = await handleConflict(e, () => loadRoot(ptr as any, true), setRootError);
        if (!reloaded) setRootError(toUiError(e));
      } finally {
        setPending("root", prev.taskId, false);
      }

      return;
    }

    const parentTaskId = prev.parentTaskId;
    if (!parentTaskId) return; // defensive; satisfies strict typing

    setPending(parentTaskId, prev.taskId, true);
    setSubtreesSync((prevMap) => {
      const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
      return {
        ...prevMap,
        [parentTaskId]: {
          ...st,
          items: st.items.map((t: Task) => (t.taskId === prev.taskId ? optimistic : t)),
        },
      };
    });

    try {
      const r =
        state === "completed"
          ? await reopenSharedSubtask(tokens, ownerSub, rootTaskId, parentTaskId, prev.taskId, prev.rev)
          : await updateSharedSubtask(tokens, ownerSub, rootTaskId, parentTaskId, prev.taskId, {
              state: "completed",
              expectedRev: prev.rev,
            } as any);

      setSubtreesSync((prevMap) => {
        const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prevMap,
          [parentTaskId]: {
            ...st,
            items: st.items.map((t: Task) => (t.taskId === prev.taskId ? r.task : t)),
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
            items: st.items.map((t: Task) => (t.taskId === prev.taskId ? prev : t)),
          },
        };
      });
      if (isAbortError(e)) return;
      const reloaded = await handleConflict(e, () => loadChildren(ownerSub, rootTaskId, parentTaskId, true), setRootError);
      if (!reloaded) setRootError(toUiError(e));
    } finally {
      setPending(parentTaskId, prev.taskId, false);
    }
  },
  [tokens, setPending, loadChildren, loadRoot]
);

  const createChild = useCallback(
    async (ptr: SharedTaskPointer, parentTaskId: string) => {
      if (!tokens) return;
      if (ptr.mode !== "EDIT") return;
      const title = (newChildTitle[parentTaskId] ?? "").trim();
      if (!title) return;

      const optimistic = makeTempSubtask(parentTaskId, title);
      setSubtreesSync((prev) => {
        const st = prev[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prev,
          [parentTaskId]: { ...st, loaded: true, items: [optimistic, ...st.items] },
        };
      });
      setNewChildTitle((prev) => ({ ...prev, [parentTaskId]: "" }));
      setPending(parentTaskId, optimistic.taskId, true);
      try {
        const r = await createSharedSubtask(tokens, ptr.ownerSub, ptr.rootTaskId, parentTaskId, { title, entityType: "action", state: "inbox" });
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
        setRootError(toUiError(e));
      } finally {
        setPending(parentTaskId, optimistic.taskId, false);
      }
    },
    [tokens, newChildTitle, setPending]
  );

  const deleteNode = useCallback(
    async (ptr: SharedTaskPointer, node: Task) => {
      if (!tokens) return;
      if (ptr.mode !== "EDIT") return;
      if (!node.parentTaskId) return; // no root delete for shared

      const parentTaskId = node.parentTaskId;
      const snapshot = getSubtree(parentTaskId).items;
      setPending(parentTaskId, node.taskId, true);
      setSubtreesSync((prev) => {
        const st = prev[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prev,
          [parentTaskId]: { ...st, items: st.items.filter((t) => t.taskId !== node.taskId) },
        };
      });
      try {
        await deleteSharedSubtask(tokens, ptr.ownerSub, ptr.rootTaskId, parentTaskId, node.taskId);
      } catch (e) {
        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { ...prev[parentTaskId], items: snapshot },
        }));
        if (isAbortError(e)) return;
        const reloaded = await handleConflict(e, () => loadChildren(ptr.ownerSub, ptr.rootTaskId, parentTaskId, true), setRootError);
        if (!reloaded) setRootError(toUiError(e));
      } finally {
        setPending(parentTaskId, node.taskId, false);
      }
    },
    [tokens, getSubtree, setPending, loadChildren]
  );

  const renderChildren = useCallback(
    (ptr: SharedTaskPointer, parentTaskId: string, depth: number) => {
      const st = getSubtree(parentTaskId);
      const paddingLeft = Math.min(depth * 18, 72);

      return (
        <div style={{ marginTop: 10, marginLeft: paddingLeft }}>
          <div className="card" style={{ padding: 12, background: "#f9fafb" }}>
            <div className="row space-between" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Subtasks</div>
              <div className="help">
                {st.loading
                  ? "Loading…"
                  : st.loaded
                    ? `${st.items.length} item${st.items.length === 1 ? "" : "s"}${st.nextToken ? " (more)" : ""}`
                    : ""}
              </div>
            </div>

            <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ minWidth: 240 }}
                placeholder={ptr.mode === "EDIT" ? "Add a subtask…" : "View-only"}
                value={newChildTitle[parentTaskId] ?? ""}
                onChange={(e) => setNewChildTitle((prev) => ({ ...prev, [parentTaskId]: e.target.value }))}
                disabled={ptr.mode !== "EDIT"}
              />
              <button
                type="button"
                className="btn"
                onClick={() => void createChild(ptr, parentTaskId)}
                disabled={ptr.mode !== "EDIT" || !(newChildTitle[parentTaskId] ?? "").trim().length}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void loadChildren(ptr.ownerSub, ptr.rootTaskId, parentTaskId, true)}
                disabled={!tokens || st.loading}
              >
                Refresh
              </button>
              {st.nextToken ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => void loadMoreChildren(ptr.ownerSub, ptr.rootTaskId, parentTaskId)}
                  disabled={!tokens || st.loading || st.loadingMore}
                >
                  {st.loadingMore ? "Loading…" : "Load more"}
                </button>
              ) : null}
            </div>

            {st.loading && !st.loaded ? (
              <div className="help">Loading subtasks…</div>
            ) : st.loaded && st.items.length === 0 ? (
              <div className="help">No subtasks yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {st.items.map((c) => {
                  const pending = pendingFor(c);
                  const isEditing = editor?.taskId === c.taskId;
                  const expandedHere = Boolean(expanded[c.taskId]);

                  return (
                    <div
                      key={c.taskId}
                      className="card"
                      style={{
                        padding: 12,
                        marginLeft: 12,
                        borderLeft: dueTone(c.dueDate).border ? `4px solid ${dueTone(c.dueDate).border}` : undefined,
                        opacity: c.taskId.startsWith("temp-") ? 0.7 : 1,
                      }}
                    >
                      <div className="row space-between" style={{ alignItems: "flex-start" }}>
                        <div style={{ flex: 1 }}>
                          {isEditing ? (
                            <div style={{ display: "grid", gap: 8 }}>
                              <input className="input" value={editor.title} onChange={(e) => setEditor((p) => (p ? { ...p, title: e.target.value } : p))} />
                              <textarea className="input" rows={3} value={editor.description} onChange={(e) => setEditor((p) => (p ? { ...p, description: e.target.value } : p))} />
                              <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                                <div style={{ minWidth: 200 }}>
                                  <div className="label">Due date</div>
                                  <input className="input" type="date" value={editor.dueDate} onChange={(e) => setEditor((p) => (p ? { ...p, dueDate: e.target.value } : p))} />
                                </div>
                                <div style={{ minWidth: 160 }}>
                                  <div className="label">Priority</div>
                                  <select className="input" value={editor.priority} onChange={(e) => setEditor((p) => (p ? { ...p, priority: e.target.value } : p))}>
                                    <option value="">—</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                  </select>
                                </div>
                                <div style={{ minWidth: 240 }}>
                                  <div className="label">Effort</div>
                                  <div className="row" style={{ gap: 8 }}>
                                    <input className="input" style={{ width: 120 }} inputMode="decimal" value={editor.effortValue} onChange={(e) => setEditor((p) => (p ? { ...p, effortValue: e.target.value } : p))} />
                                    <select className="input" value={editor.effortUnit} onChange={(e) => setEditor((p) => (p ? { ...p, effortUnit: e.target.value as any } : p))}>
                                      <option value="hours">hours</option>
                                      <option value="days">days</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                              <div>
                                <div className="label">Attributes (JSON)</div>
                                <textarea className="input" rows={4} value={editor.attrsJson} onChange={(e) => setEditor((p) => (p ? { ...p, attrsJson: e.target.value } : p))} />
                              </div>
                              <div className="row" style={{ justifyContent: "flex-end" }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setEditor(null)} disabled={pending}>
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  className="btn"
                                  disabled={pending || editor.title.trim().length === 0 || editor.title.trim().length > 200}
                                  onClick={async () => {
                                    const newTitle = editor.title.trim();
                                    const newDesc = editor.description.trim();
                                    let attrs: any = undefined;
                                    const attrsTrim = editor.attrsJson.trim();
                                    if (attrsTrim) {
                                      try {
                                        attrs = JSON.parse(attrsTrim);
                                      } catch {
                                        alert("Attributes must be valid JSON");
                                        return;
                                      }
                                    }

                                    const due = editor.dueDate.trim();
                                    const pr = editor.priority.trim();
                                    const ev = editor.effortValue.trim();

                                    await patchNode(ptr, c, {
                                      title: newTitle,
                                      description: newDesc || undefined,
                                      entityType: editor.parentTaskId ? "action" : editor.entityType,
                                      state: editor.state,
                                      context: editor.context.trim() ? editor.context.trim() : null,
                                      waitingFor: editor.state === "waiting" ? (editor.waitingFor.trim() ? editor.waitingFor.trim() : null) : null,
                                      dueDate: due ? due : null,
                                      priority: pr ? (Number(pr) as any) : null,
                                      effort: ev ? { unit: editor.effortUnit, value: Number(ev) } : null,
                                      attrs: attrsTrim ? attrs : null,
                                    });
                                    setEditor(null);
                                  }}
                                >
                                  Save
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div style={{ fontWeight: 800, textDecoration: c.status === "COMPLETED" ? "line-through" : "none" }}>{c.title}</div>
                              {c.description ? <div style={{ marginTop: 6, color: "#374151" }}>{c.description}</div> : null}
                              <div className="help" style={{ marginTop: 8 }}>
                                {stateLabel(deriveState(c))} · {deriveEntityType(c)}
                                {c.dueDate ? ` · due ${fmtDue(c.dueDate)} (${dueTone(c.dueDate).label ?? ""})` : ""}
                                {c.priority ? ` · p${c.priority}` : ""}
                                {c.effort ? ` · effort ${c.effort.value} ${c.effort.unit}` : ""}
                                {c.taskId.startsWith("temp-") ? " · syncing…" : null}
                              </div>
                            </>
                          )}

                          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            <button type="button" className="btn btn-secondary" onClick={() => void toggleExpand(ptr.ownerSub, ptr.rootTaskId, c.taskId)} disabled={!tokens}>
                              {expandedHere ? "Hide subtasks" : "Show subtasks"}
                            </button>
                          </div>

                          {expandedHere ? renderChildren(ptr, c.taskId, depth + 1) : null}
                        </div>

                        <div className="row" style={{ alignItems: "stretch" }}>
                          <button className="btn btn-secondary" onClick={() => void toggleCompleteNode(ptr, c)} disabled={!canEdit || pending}>
                            {c.status === "COMPLETED" ? "Reopen" : "Complete"}
                          </button>
                          <button className="btn btn-secondary" onClick={() => startEdit(c)} disabled={!canEdit || pending}>
                            Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => {
                              if (!window.confirm("Delete this subtask?") ) return;
                              void deleteNode(ptr, c);
                            }}
                            title={
                              subtrees[c.taskId]?.loaded && (subtrees[c.taskId]?.items?.length ?? 0) > 0
                                ? "This subtask has subtasks. Delete subtasks first."
                                : undefined
                            }
                            disabled={!canEdit || pending || (subtrees[c.taskId]?.loaded && (subtrees[c.taskId]?.items?.length ?? 0) > 0)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      );
    },
    [
      getSubtree,
      newChildTitle,
      tokens,
      createChild,
      loadChildren,
      loadMoreChildren,
      pendingFor,
      editor,
      expanded,
      toggleExpand,
      patchNode,
      toggleCompleteNode,
      deleteNode,
      startEdit,
      subtrees,
      canEdit,
    ]
  );

  // Initial list
  useEffect(() => {
    if (!tokens) return;

    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;

    setInitialLoading(true);
    setError(null);
    setItems([]);
    setNextToken(undefined);
    setSelected(null);
    clearSelectionState();

    (async () => {
      try {
        const resp = await listSharedWithMe(tokens, { limit: 20 }, ac.signal);
        setItems(resp.items ?? []);
        setNextToken(resp.nextToken);
      } catch (e) {
        if (isAbortError(e)) return;
        setError(toUiError(e));
      } finally {
        setInitialLoading(false);
      }
    })();

    return () => ac.abort();
  }, [tokens, clearSelectionState]);

  async function loadMore() {
    if (!tokens || loadingMore || !nextToken) return;

    setLoadingMore(true);
    setError(null);
    const ac = new AbortController();
    listAbortRef.current?.abort();
    listAbortRef.current = ac;

    try {
      const resp = await listSharedWithMe(tokens, { limit: 20, nextToken }, ac.signal);
      setItems((prev) => [...prev, ...(resp.items ?? [])]);
      setNextToken(resp.nextToken);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(toUiError(e));
    } finally {
      setLoadingMore(false);
    }
  }

  // When selecting an item: clear local state, then load root.
  const onSelect = useCallback(
    async (ptr: SharedTaskPointer & { task?: Task }) => {
      setSelected(ptr);
      clearSelectionState();
      await loadRoot(ptr, true);
    },
    [clearSelectionState, loadRoot]
  );

  const selectedRoot = selected?.task;
  const rootPending = selectedRoot ? pendingFor(selectedRoot) : false;

  return (
    <div style={{ display: "grid", gap: 12 }}>
      
<div className="row space-between" style={{ alignItems: "center" }}>
  <div>
    <div style={{ fontSize: 18, fontWeight: 900 }}>Shared with me</div>
    <div className="help">Tasks other users have shared with you.</div>
  </div>
  <div className="row" style={{ gap: 8, alignItems: "center" }}>
    <span className="help">View:</span>
    <select
      className="input"
      style={{ height: 34, padding: "6px 10px" }}
      value={view}
      onChange={(e) => {
        const v = e.target.value;
        setSearchParams((prev) => {
          const next = new URLSearchParams(prev);
          next.set("view", v);
          return next;
        });
      }}
    >
      <option value="inbox">Inbox</option>
      <option value="next">Next</option>
      <option value="waiting">Waiting</option>
      <option value="scheduled">Scheduled</option>
      <option value="someday">Someday</option>
      <option value="reference">Reference</option>
      <option value="completed">Completed</option>
    </select>
  </div>
</div>

      {error ? (
        <InlineAlert
          tone="error"
          title="Error"
          message={error.requestId ? `${error.message} (requestId: ${error.requestId})` : error.message}
          actions={
            <button className="btn btn-secondary" onClick={() => setError(null)}>
              Dismiss
            </button>
          }
        />
      ) : null}

      {rootError ? (
        <InlineAlert
          tone="error"
          title="Shared task error"
          message={rootError.requestId ? `${rootError.message} (requestId: ${rootError.requestId})` : rootError.message}
          actions={
            <div className="row" style={{ flexWrap: "wrap" }}>
              {rootError.requestId ? (
                <>
                  <span className="help" style={{ alignSelf: "center" }}>
                    Request id: <code>{rootError.requestId}</code>
                  </span>
                  <button className="btn btn-secondary" type="button" onClick={() => void tryCopy(rootError.requestId!)}>
                    Copy
                  </button>
                </>
              ) : null}
              <button className="btn btn-secondary" onClick={() => setRootError(null)}>
                Dismiss
              </button>
            </div>
          }
        />
      ) : null}

      <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
        <div style={{ flex: 1, minWidth: 420 }}>
          {initialLoading ? (
            <TaskCardSkeleton count={3} />
          ) : visibleShared.length === 0 ? (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 800 }}>No shared tasks</div>
              <div className="help" style={{ marginTop: 6 }}>
                When someone shares a task with you, it will appear here.
              </div>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {visibleShared.map((it) => {
                const active = selected?.ownerSub === it.ownerSub && selected?.rootTaskId === it.rootTaskId;
                return (
                  <button
                    key={`${it.ownerSub}#${it.rootTaskId}`}
                    className="card"
                    style={{
                      padding: 14,
                      textAlign: "left",
                      cursor: "pointer",
                      borderColor: active ? "#111827" : undefined,
                    }}
                    onClick={() => void onSelect(it)}
                  >
                    <div className="row space-between" style={{ alignItems: "center" }}>
                      <div style={{ fontWeight: 900, fontSize: 16 }}>
                        {it.task?.title?.trim() ? it.task.title : it.rootTaskId}
                      </div>
                      <div className="pill">{it.mode}</div>
                    </div>
                    <div className="help" style={{ marginTop: 6 }}>
                      Owner: <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{it.ownerSub}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="row space-between" style={{ marginTop: 12 }}>
            <div className="help">{items.length ? `${items.length} item${items.length === 1 ? "" : "s"}` : ""}</div>
            <div>
              {hasMore ? (
                <button className="btn" onClick={loadMore} disabled={loadingMore || initialLoading}>
                  {loadingMore ? "Loading…" : "Load more"}
                </button>
              ) : (
                <span className="help">{items.length ? "End of list" : ""}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ width: 520, minWidth: 360 }}>
          {!selected ? (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 900 }}>Select a task</div>
              <div className="help" style={{ marginTop: 6 }}>Choose a shared task to view and (if allowed) edit its subtree.</div>
            </div>
          ) : rootLoading && !selectedRoot ? (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 900 }}>Loading…</div>
              <div className="help" style={{ marginTop: 6 }}>Fetching shared task details.</div>
            </div>
          ) : !selectedRoot ? (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 900 }}>Unavailable</div>
              <div className="help" style={{ marginTop: 6 }}>Could not load this shared task.</div>
              <div className="row" style={{ gap: 8, marginTop: 12 }}>
                <button className="btn btn-secondary" onClick={() => void loadRoot(selected as any, true)}>
                  Retry
                </button>
                <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: 14 }}>
              <div className="row space-between" style={{ alignItems: "center" }}>
                <div style={{ fontWeight: 900, fontSize: 16 }}>{selectedTitle}</div>
                <div className="pill">{selected.mode}</div>
              </div>

              <div className="help" style={{ marginTop: 10 }}>
                OwnerSub
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{selected.ownerSub}</div>
              </div>
              <div className="help" style={{ marginTop: 10 }}>
                RootTaskId
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>{selected.rootTaskId}</div>
              </div>

              <div className="row" style={{ gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                <button className="btn btn-secondary" onClick={() => void tryCopy(`${selected.ownerSub}:${selected.rootTaskId}`)} title="Copy ownerSub:rootTaskId">
                  Copy reference
                </button>
                <button className="btn btn-secondary" onClick={() => void loadRoot(selected as any, true)} disabled={rootLoading}>
                  {rootLoading ? "Refreshing…" : "Refresh"}
                </button>
                <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                  Clear
                </button>
              </div>

              <div style={{ marginTop: 14 }}>
                {editor?.taskId === selectedRoot.taskId ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <input className="input" value={editor.title} onChange={(e) => setEditor((p) => (p ? { ...p, title: e.target.value } : p))} disabled={!canEdit} />
                    <textarea className="input" rows={3} value={editor.description} onChange={(e) => setEditor((p) => (p ? { ...p, description: e.target.value } : p))} disabled={!canEdit} />
                    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
                      <div style={{ minWidth: 200 }}>
                        <div className="label">Due date</div>
                        <input className="input" type="date" value={editor.dueDate} onChange={(e) => setEditor((p) => (p ? { ...p, dueDate: e.target.value } : p))} disabled={!canEdit} />
                      </div>
                      <div style={{ minWidth: 160 }}>
                        <div className="label">Priority</div>
                        <select className="input" value={editor.priority} onChange={(e) => setEditor((p) => (p ? { ...p, priority: e.target.value } : p))} disabled={!canEdit}>
                          <option value="">—</option>
                          <option value="1">1</option>
                          <option value="2">2</option>
                          <option value="3">3</option>
                          <option value="4">4</option>
                          <option value="5">5</option>
                        </select>
                      </div>
                      <div style={{ minWidth: 240 }}>
                        <div className="label">Effort</div>
                        <div className="row" style={{ gap: 8 }}>
                          <input className="input" style={{ width: 120 }} inputMode="decimal" value={editor.effortValue} onChange={(e) => setEditor((p) => (p ? { ...p, effortValue: e.target.value } : p))} disabled={!canEdit} />
                          <select className="input" value={editor.effortUnit} onChange={(e) => setEditor((p) => (p ? { ...p, effortUnit: e.target.value as any } : p))} disabled={!canEdit}>
                            <option value="hours">hours</option>
                            <option value="days">days</option>
                          </select>
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="label">Attributes (JSON)</div>
                      <textarea className="input" rows={4} value={editor.attrsJson} onChange={(e) => setEditor((p) => (p ? { ...p, attrsJson: e.target.value } : p))} disabled={!canEdit} />
                    </div>

                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      <button className="btn btn-secondary" type="button" onClick={() => setEditor(null)} disabled={rootPending}>
                        Cancel
                      </button>
                      <button
                        className="btn"
                        type="button"
                        disabled={
                          !canEdit ||
                          rootPending ||
                          editor.title.trim().length === 0 ||
                          editor.title.trim().length > 200 ||
                          (editor.state === "waiting" && editor.waitingFor.trim().length === 0) ||
                          (editor.state === "scheduled" && editor.dueDate.trim().length === 0)
                        }
                        onClick={async () => {
                          const newTitle = editor.title.trim();
                          const newDesc = editor.description.trim();
                          let attrs: any = undefined;
                          const attrsTrim = editor.attrsJson.trim();
                          if (attrsTrim) {
                            try {
                              attrs = JSON.parse(attrsTrim);
                            } catch {
                              alert("Attributes must be valid JSON");
                              return;
                            }
                          }

                          const due = editor.dueDate.trim();
                          const pr = editor.priority.trim();
                          const ev = editor.effortValue.trim();

                          await patchNode(selected, selectedRoot, {
                            title: newTitle,
                            description: newDesc || undefined,
                            // Phase 5 (GTD UX)
                            entityType: editor.parentTaskId ? "action" : editor.entityType,
                            state: editor.state,
                            context: editor.context.trim() ? editor.context.trim() : null,
                            waitingFor:
                              editor.state === "waiting"
                                ? editor.waitingFor.trim()
                                  ? editor.waitingFor.trim()
                                  : null
                                : null,

                            // dueDate rules (backend authoritative; UI blocks obvious mistakes)
                            dueDate:
                              editor.state === "inbox"
                                ? null
                                : due
                                  ? due
                                  : editor.state === "scheduled"
                                    ? null
                                    : null,
                            priority: pr ? (Number(pr) as any) : null,
                            effort: ev ? { unit: editor.effortUnit, value: Number(ev) } : null,
                            attrs: attrsTrim ? attrs : null,
                          });
                          setEditor(null);
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div style={{ fontWeight: 900, marginTop: 8 }}>{selectedRoot.title}</div>
                    {selectedRoot.description ? <div style={{ marginTop: 6, color: "#374151" }}>{selectedRoot.description}</div> : null}
                    <div className="help" style={{ marginTop: 8 }}>
                      {stateLabel(deriveState(selectedRoot))} · {deriveEntityType(selectedRoot)}
                      {selectedRoot.dueDate ? ` · due ${fmtDue(selectedRoot.dueDate)} (${dueTone(selectedRoot.dueDate).label ?? ""})` : ""}
                      {selectedRoot.priority ? ` · p${selectedRoot.priority}` : ""}
                      {selectedRoot.effort ? ` · effort ${selectedRoot.effort.value} ${selectedRoot.effort.unit}` : ""}
                      · created {formatTime(selectedRoot.createdAt)} · updated {formatTime(selectedRoot.updatedAt)}
                    </div>

                    <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                      <button className="btn btn-secondary" onClick={() => void toggleCompleteNode(selected, selectedRoot)} disabled={!canEdit || rootPending}>
                        {selectedRoot.status === "COMPLETED" ? "Reopen" : "Complete"}
                      </button>
                      <button className="btn btn-secondary" onClick={() => startEdit(selectedRoot)} disabled={!canEdit || rootPending}>
                        Edit
                      </button>
                      <button
                        className="btn btn-secondary"
                        onClick={() => void toggleExpand(selected.ownerSub, selected.rootTaskId, selectedRoot.taskId)}
                        disabled={!tokens}
                      >
                        {expanded[selectedRoot.taskId] ? "Hide subtasks" : "Show subtasks"}
                        {getSubtree(selectedRoot.taskId).loaded ? ` (${getSubtree(selectedRoot.taskId).items.length})` : ""}
                      </button>
                    </div>

                    {expanded[selectedRoot.taskId] ? renderChildren(selected, selectedRoot.taskId, 1) : null}
                  </>
                )}
              </div>

              {!canEdit ? (
                <div className="help" style={{ marginTop: 12 }}>
                  This task is shared with you as <b>VIEW</b>. Editing is disabled.
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
