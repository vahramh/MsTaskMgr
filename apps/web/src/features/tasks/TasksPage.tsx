import React, { useCallback, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Task, WorkflowState, EntityType } from "@tm/shared";
import { useAuth } from "../../auth/AuthContext";
import InlineAlert from "../../components/InlineAlert";
import { useTasks } from "./useTasks";
import { ApiError } from "../../api/http";
import {
  createSubtask,
  deleteSubtask,
  listSubtasks,
  updateSubtask,
  reopenSubtask,
  createShare,
  listShares,
  revokeShare,
} from "./api";

function TaskListSkeleton({ count = 3 }: { count?: number }) {
  const line: React.CSSProperties = {
    height: 12,
    borderRadius: 8,
    background: "#e5e7eb",
  };
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card" style={{ padding: 14 }}>
          <div style={{ ...line, width: "55%" }} />
          <div style={{ ...line, width: "85%", marginTop: 10, opacity: 0.8 }} />
          <div style={{ ...line, width: "35%", marginTop: 10, opacity: 0.6 }} />
        </div>
      ))}
    </div>
  );
}

async function tryCopy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore (clipboard may be blocked)
  }
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function dueTone(dueDate?: string): { label?: string; border?: string } {
  if (!dueDate) return {};
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return {};
  const now = new Date();
  // compare by local date (ignore time)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDue = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDue - startOfToday) / (1000 * 60 * 60 * 24));

  if (days < 0) return { label: "Overdue", border: "#dc2626" };
  if (days === 0) return { label: "Due today", border: "#f59e0b" };
  if (days <= 3) return { label: `Due in ${days}d`, border: "#fbbf24" };
  if (days <= 7) return { label: `Due in ${days}d`, border: "#22c55e" };
  return { label: `Due in ${days}d`, border: "#9ca3af" };
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

function safeJsonStringify(v: any): string {
  try {
    return JSON.stringify(v ?? {}, null, 2);
  } catch {
    return "{}";
  }
}

function deriveState(t: Task): WorkflowState {
  if (t.state) return t.state;
  if (t.status === "COMPLETED") return "completed";
  // legacy heuristic: dueDate -> scheduled else inbox
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
  // Phase 5 (GTD UX)
  entityType: EntityType;
  state: WorkflowState;
  context: string;
  waitingFor: string;
} | null;

type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

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
    return {
      message: e.message,
      requestId: e.requestId,
      code: e.code,
      status: e.status,
    };
  }
  if (e && typeof e === "object") {
    const any = e as any;
    return { message: any.message ?? String(e) };
  }
  return { message: String(e) };
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

function nowIso(): string {
  return new Date().toISOString();
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

function nullToUndefined<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

type SubtreeState = {
  items: Task[];
  loaded: boolean;
  loading: boolean;
  loadingMore?: boolean;
  nextToken?: string;
};

export default function TasksPage() {
  const { tokens } = useAuth();
  const {
    items,
    hasMore,
    initialLoading,
    loadingMore,
    creating,
    pendingById,
    error,
    clearError,
    reload,
    loadMore,
    create,
    toggleComplete,
    remove,
    patch,
  } = useTasks(tokens);

  const [searchParams, setSearchParams] = useSearchParams();
  const viewParam = (searchParams.get("view") ?? "inbox") as string;
  const view: WorkflowState | "projects" = ([
    "inbox",
    "next",
    "waiting",
    "scheduled",
    "someday",
    "reference",
    "completed",
    "projects",
  ].includes(viewParam)
    ? (viewParam as any)
    : "inbox");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [effortValue, setEffortValue] = useState("");
  const [effortUnit, setEffortUnit] = useState<"hours" | "days">("hours");
  const [attrsJson, setAttrsJson] = useState("{}");
  const [createEntityType, setCreateEntityType] = useState<EntityType>("action");
  const [createState, setCreateState] = useState<WorkflowState>("inbox");
  const [createContext, setCreateContext] = useState<string>("");
  const [createWaitingFor, setCreateWaitingFor] = useState<string>("");
  const [editor, setEditor] = useState<Editor>(null);


const [shareFor, setShareFor] = useState<string | null>(null);
const [shareGranteeSub, setShareGranteeSub] = useState<string>("");
const [shareMode, setShareMode] = useState<"VIEW" | "EDIT">("VIEW");
const [shares, setShares] = useState<Array<{ granteeSub: string; mode: "VIEW" | "EDIT"; createdAt: string }>>([]);
const [sharesLoading, setSharesLoading] = useState<boolean>(false);
const [sharesError, setSharesError] = useState<UiError | null>(null);

const sharesAbortRef = useRef<AbortController | null>(null);

const openShares = useCallback(
  async (rootTaskId: string) => {
    if (!tokens) return;
    setShareFor(rootTaskId);
    setShares([]);
    setSharesError(null);
    setSharesLoading(true);

    sharesAbortRef.current?.abort();
    const ac = new AbortController();
    sharesAbortRef.current = ac;

    try {
      const resp = await listShares(tokens, rootTaskId, { limit: 50 }, ac.signal);
      setShares(resp.items.map((g) => ({ granteeSub: g.granteeSub, mode: g.mode, createdAt: g.createdAt })));
    } catch (e) {
      if (isAbortError(e)) return;
      setSharesError(toUiError(e));
    } finally {
      setSharesLoading(false);
    }
  },
  [tokens]
);

const closeShares = useCallback(() => {
  sharesAbortRef.current?.abort();
  setShareFor(null);
  setShares([]);
  setSharesError(null);
  setShareGranteeSub("");
  setShareMode("VIEW");
}, []);

const submitShare = useCallback(
  async (rootTaskId: string) => {
    if (!tokens) return;
    const sub = shareGranteeSub.trim();
    if (!sub) {
      setSharesError({ message: "Enter a grantee sub" });
      return;
    }
    setSharesError(null);
    setSharesLoading(true);
    try {
      await createShare(tokens, rootTaskId, { granteeSub: sub, mode: shareMode });
      await openShares(rootTaskId);
      setShareGranteeSub("");
    } catch (e) {
      if (isAbortError(e)) return;
      setSharesError(toUiError(e));
    } finally {
      setSharesLoading(false);
    }
  },
  [tokens, shareGranteeSub, shareMode, openShares]
);

const removeShare = useCallback(
  async (rootTaskId: string, granteeSub: string) => {
    if (!tokens) return;
    if (!confirm(`Revoke access for ${granteeSub}?`)) return;
    setSharesError(null);
    setSharesLoading(true);
    try {
      await revokeShare(tokens, rootTaskId, granteeSub);
      await openShares(rootTaskId);
    } catch (e) {
      if (isAbortError(e)) return;
      setSharesError(toUiError(e));
    } finally {
      setSharesLoading(false);
    }
  },
  [tokens, openShares]
);

  const [subError, setSubError] = useState<UiError | null>(null);
  const [expanded, setExpanded] = useState<Record<string, true>>({});
  const [subtrees, setSubtrees] = useState<Record<string, SubtreeState>>({});
  const [subPendingByKey, setSubPendingByKey] = useState<Record<string, true>>({});
  const [newChildTitle, setNewChildTitle] = useState<Record<string, string>>({});
  const subAbortRef = useRef<Map<string, AbortController>>(new Map());
  const titleRef = useRef<HTMLInputElement | null>(null);

  const titleTrim = title.trim();
  const descTrim = description.trim();
  const attrsJsonTrim = attrsJson.trim();

  const titleError = useMemo(() => {
    if (title.length === 0) return null;
    if (titleTrim.length === 0) return "Title cannot be blank";
    if (titleTrim.length > 200) return "Title is too long (max 200 characters)";
    return null;
  }, [title, titleTrim]);

  const descriptionError = useMemo(() => {
    if (descTrim.length > 2000) return "Description is too long (max 2000 characters)";
    return null;
  }, [descTrim]);

  const attrsError = useMemo(() => {
    if (!attrsJsonTrim) return null;
    try {
      const v = JSON.parse(attrsJsonTrim);
      if (v === null || typeof v !== "object" || Array.isArray(v)) return "Attributes must be a JSON object";
      return null;
    } catch {
      return "Attributes must be valid JSON";
    }
  }, [attrsJsonTrim]);


const gtdCreateError = useMemo(() => {
  const wf = createWaitingFor.trim();
  const ctx = createContext.trim();
  // Basic UX guards; backend remains authoritative.
  if (createEntityType === "project" && createState === "next") return "Projects cannot be in Next";
  if (createState === "next" && createEntityType !== "action") return "Only actions can be in Next";
  if (createState === "waiting" && !wf) return "Waiting requires 'Waiting for…'";
  if (createState === "scheduled" && !dueDate) return "Scheduled requires a due date";
  if (createState === "inbox" && dueDate) return "Inbox items cannot have a due date";
  // Keep context small; backend may enforce separately.
  if (ctx.length > 40) return "Context is too long (max 40 characters)";
  if (wf.length > 200) return "Waiting for is too long (max 200 characters)";
  return null;
}, [createEntityType, createState, createWaitingFor, createContext, dueDate]);

const canCreate =
  !titleError && !descriptionError && !attrsError && !gtdCreateError && titleTrim.length > 0 && !creating;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canCreate) return;
    const dueDateToSend = createState === "inbox" ? undefined : dueDate || undefined;
    const waitingToSend = createState === "waiting" ? createWaitingFor.trim() : undefined;
    await create({
      title: titleTrim,
      description: descTrim || undefined,
      entityType: createEntityType,
      state: createState,
      context: createContext.trim() || undefined,
      waitingFor: waitingToSend,
      dueDate: dueDateToSend,
      priority: priority ? (Number(priority) as any) : undefined,
      effort: effortValue ? { unit: effortUnit, value: Number(effortValue) } : undefined,
      attrs: attrsJsonTrim ? (JSON.parse(attrsJsonTrim) as any) : undefined,
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("");
    setEffortValue("");
    setEffortUnit("hours");
    setAttrsJson("{}");
    setCreateEntityType("action");
    setCreateState("inbox");
    setCreateContext("");
    setCreateWaitingFor("");
  }

  function startEdit(t: Task) {
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
      entityType: deriveEntityType(t),
      state: deriveState(t),
      context: t.context ?? "",
      waitingFor: t.waitingFor ?? "",
    });
  }

  const clearAllErrors = useCallback(() => {
    clearError();
    setSubError(null);
  }, [clearError]);

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

  const getSubtree = useCallback(
    (parentTaskId: string): SubtreeState => subtrees[parentTaskId] ?? { items: [], loaded: false, loading: false },
    [subtrees]
  );

  const loadChildren = useCallback(
    async (parentTaskId: string, force: boolean = false) => {
      if (!tokens) return;

      clearAllErrors();

      const existing = getSubtree(parentTaskId);
      if (existing.loaded && !force) return;

      // Abort any in-flight request for this parent.
      const prevAc = subAbortRef.current.get(parentTaskId);
      prevAc?.abort();

      const ac = new AbortController();
      subAbortRef.current.set(parentTaskId, ac);

      setSubtrees((prev) => ({
        ...prev,
        [parentTaskId]: { ...existing, loading: true },
      }));

      try {
        const r = await listSubtasks(tokens, parentTaskId, { limit: 50 }, ac.signal);
        // If replaced, ignore.
        if (subAbortRef.current.get(parentTaskId) !== ac) return;

        setSubtrees((prev) => ({
          ...prev,
          [parentTaskId]: { items: r.items, loaded: true, loading: false, nextToken: r.nextToken },
        }));
      } catch (e) {
        if (isAbortError(e)) return;
        setSubError(toUiError(e));
        setSubtrees((prev) => ({
          ...prev,
          [parentTaskId]: { ...existing, loaded: existing.loaded, loading: false },
        }));
      }
    },
    [tokens, clearAllErrors, getSubtree]
  );


  const loadMoreChildren = useCallback(
    async (parentTaskId: string) => {
      if (!tokens) return;

      const st = getSubtree(parentTaskId);
      if (!st.loaded || !st.nextToken || st.loading || st.loadingMore) return;

      clearAllErrors();

      // Abort any in-flight request for this parent.
      const prevAc = subAbortRef.current.get(parentTaskId);
      prevAc?.abort();

      const ac = new AbortController();
      subAbortRef.current.set(parentTaskId, ac);

      setSubtrees((prev) => ({
        ...prev,
        [parentTaskId]: { ...st, loadingMore: true },
      }));

      try {
        const r = await listSubtasks(tokens, parentTaskId, { limit: 50, nextToken: st.nextToken }, ac.signal);
        if (subAbortRef.current.get(parentTaskId) !== ac) return;

        setSubtrees((prev) => {
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
        setSubtrees((prev) => ({
          ...prev,
          [parentTaskId]: { ...st, loadingMore: false },
        }));
      }
    },
    [tokens, getSubtree, clearAllErrors]
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
      setSubtrees((prev) => {
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
        setSubtrees((prev) => {
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
        setSubtrees((prev) => {
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
    [tokens, newChildTitle, clearAllErrors, setSubPending]
  );

  const patchNode = useCallback(
    async (
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

      // Root task -> delegate to existing hook (preserves invariants).
      if (!node.parentTaskId) {
        await patch(node.taskId, partial as any, overrideStatus);
        return;
      }

      const parentTaskId = node.parentTaskId;
      clearAllErrors();

      const prev = node;
      const optimistic: Task = {
        ...prev,
        title: partial.title ?? prev.title,
        description: partial.description ?? prev.description,
        status: overrideStatus ?? partial.status ?? prev.status,

        // Phase 5 (GTD UX)
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

      setSubPending(parentTaskId, prev.taskId, true);
      setSubtrees((prevMap) => {
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
        setSubtrees((prevMap) => {
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
        // Rollback
        setSubtrees((prevMap) => {
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
    [tokens, patch, clearAllErrors, setSubPending, loadChildren]
  );

  
const toggleCompleteNode = useCallback(
  async (node: Task) => {
    if (!tokens) return;

    const state = deriveState(node);

    // Root task -> delegate to hook (complete/reopen endpoints).
    if (!node.parentTaskId) {
      await toggleComplete(node);
      return;
    }

    const parentTaskId = node.parentTaskId;

    // Subtasks: complete via state transition; reopen via dedicated endpoint.
    if (state === "completed") {
      clearAllErrors();

      const prev = node;
      setSubPending(parentTaskId, prev.taskId, true);

      // optimistic
      const optimistic: Task = {
        ...prev,
        state: prev.dueDate ? "scheduled" : "inbox",
        status: "OPEN",
        updatedAt: nowIso(),
      };

      setSubtrees((prevMap) => {
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
        setSubtrees((prevMap) => {
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
        // rollback
        setSubtrees((prevMap) => {
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

      return;
    }

    // complete subtask (state transition)
    await patchNode(node, { state: "completed" } as any);
  },
  [tokens, toggleComplete, clearAllErrors, setSubPending, setSubtrees, loadChildren, patchNode]
);

  const deleteNode = useCallback(
    async (node: Task) => {
      if (!tokens) return;
      if (!node.parentTaskId) {
        await remove(node);
        return;
      }

      const parentTaskId = node.parentTaskId;
      clearAllErrors();

      const snapshot = getSubtree(parentTaskId).items;
      setSubPending(parentTaskId, node.taskId, true);
      setSubtrees((prevMap) => {
        const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prevMap,
          [parentTaskId]: { ...st, items: st.items.filter((t) => t.taskId !== node.taskId) },
        };
      });
      try {
        await deleteSubtask(tokens, parentTaskId, node.taskId);
      } catch (e) {
        setSubtrees((prevMap) => {
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
    [tokens, remove, clearAllErrors, getSubtree, setSubPending, loadChildren]
  );

  const pendingFor = useCallback(
    (node: Task) => {
      if (!node.parentTaskId) return Boolean(pendingById[node.taskId]);
      return Boolean(subPendingByKey[`${node.parentTaskId}/${node.taskId}`]);
    },
    [pendingById, subPendingByKey]
  );

  const renderChildren = useCallback(
    (parentTaskId: string, depth: number) => {
      const st = getSubtree(parentTaskId);
      const paddingLeft = Math.min(depth * 18, 72);

      return (
        <div style={{ marginTop: 10, marginLeft: paddingLeft }}>
          <div className="card" style={{ padding: 12, background: "#f9fafb" }}>
            <div className="row space-between" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Subtasks</div>
              <div className="help">
                {st.loading ? "Loading…" : st.loaded ? `${st.items.length} item${st.items.length === 1 ? "" : "s"}${st.nextToken ? " (more)" : ""}` : ""}
              </div>
            </div>

            <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <input
                className="input"
                style={{ minWidth: 240 }}
                placeholder="Add a subtask…"
                value={newChildTitle[parentTaskId] ?? ""}
                onChange={(e) => setNewChildTitle((prev) => ({ ...prev, [parentTaskId]: e.target.value }))}
              />
              <button
                type="button"
                className="btn"
                onClick={() => {
                  void createChild(parentTaskId);
                }}
                disabled={!tokens || !(newChildTitle[parentTaskId] ?? "").trim().length}
              >
                Add
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  void loadChildren(parentTaskId, true);
                }}
                disabled={!tokens || st.loading}
              >
                Refresh
              </button>
              {st.nextToken ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    void loadMoreChildren(parentTaskId);
                  }}
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
                  const expandedHere = isExpanded(c.taskId);

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
  <div style={{ minWidth: 180 }}>
    <div className="label">Type</div>
    <select
      className="input"
      value={editor.entityType}
      onChange={(e) =>
        setEditor((p) => (p ? { ...p, entityType: e.target.value as any } : p))
      }
      disabled={Boolean(editor.parentTaskId)}
    >
      <option value="action">Action</option>
      <option value="project">Project</option>
    </select>
  </div>

  <div style={{ minWidth: 200 }}>
    <div className="label">State</div>
    <select
      className="input"
      value={editor.state}
      onChange={(e) => {
        const next = e.target.value as any;
        setEditor((p) => {
          if (!p) return p;
          const clearedDue = next === "inbox" ? "" : p.dueDate;
          const clearedWaiting = next === "waiting" ? p.waitingFor : "";
          return { ...p, state: next, dueDate: clearedDue, waitingFor: clearedWaiting };
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

  <div style={{ minWidth: 240, flex: 1 }}>
    <div className="label">Context</div>
    <input
      className="input"
      value={editor.context}
      onChange={(e) => setEditor((p) => (p ? { ...p, context: e.target.value } : p))}
      placeholder='e.g. "@home"'
    />
  </div>

  {editor.state === "waiting" ? (
    <div style={{ minWidth: 260, flex: 1 }}>
      <div className="label">Waiting for…</div>
      <input
        className="input"
        value={editor.waitingFor}
        onChange={(e) => setEditor((p) => (p ? { ...p, waitingFor: e.target.value } : p))}
      />
    </div>
  ) : null}
</div>

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

                                    await patchNode(c, {
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
                            <button type="button" className="btn btn-secondary" onClick={() => void toggleExpand(c.taskId)} disabled={!tokens}>
                              {expandedHere ? "Hide subtasks" : "Show subtasks"}
                            </button>
                          </div>

                          {expandedHere ? renderChildren(c.taskId, depth + 1) : null}
                        </div>

                        <div className="row" style={{ alignItems: "stretch" }}>
                          <button className="btn btn-secondary" onClick={() => void toggleCompleteNode(c)} disabled={pending}>
                            {c.status === "COMPLETED" ? "Reopen" : "Complete"}
                          </button>
                          <button className="btn btn-secondary" onClick={() => startEdit(c)} disabled={pending}>
                            Edit
                          </button>
                          <button
                            className="btn btn-danger"
                            onClick={() => {
                              if (!window.confirm("Delete this subtask?") ) return;
                              void deleteNode(c);
                            }}
                            title={(subtrees[c.taskId]?.loaded && (subtrees[c.taskId]?.items?.length ?? 0) > 0) ? "This subtask has subtasks. Delete subtasks first." : undefined}
                            disabled={pending || (subtrees[c.taskId]?.loaded && (subtrees[c.taskId]?.items?.length ?? 0) > 0)}
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
    [getSubtree,
      newChildTitle,
      tokens,
      createChild,
      loadChildren,
      pendingFor,
      editor,
      isExpanded,
      toggleExpand,
      patchNode,
      toggleCompleteNode,
      deleteNode,
      startEdit,
      loadMoreChildren]
  );


const visibleItems = useMemo(() => {
  if (view === "projects") return items.filter((t) => deriveEntityType(t) === "project");
  return items.filter((t) => deriveState(t) === view);
}, [items, view]);

const empty = !initialLoading && visibleItems.length === 0;


  return (
    <div className="card">
      <div className="row space-between" style={{ marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{view === "projects" ? "Projects" : stateLabel(view)}</div>
          <div style={{ fontSize: 13, color: "#6b7280" }}>Quick, pragmatic, and safe-by-default.</div>
        </div>
        
<div className="row" style={{ gap: 10, alignItems: "center" }}>
  <div className="row" style={{ gap: 6, alignItems: "center" }}>
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
      <option value="projects">Projects</option>
    </select>
  </div>
  <button className="btn btn-secondary" onClick={reload} disabled={initialLoading || loadingMore || creating}>
    Refresh
  </button>
</div>
      </div>

      {error ? (
        <InlineAlert
          tone="error"
          title={error.message}
          message={
            [
              typeof error.status === "number" ? `HTTP ${error.status}` : null,
              error.code ? error.code : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <div className="row" style={{ flexWrap: "wrap" }}>
              {error.requestId ? (
                <>
                  <span className="help" style={{ alignSelf: "center" }}>
                    Request id: <code>{error.requestId}</code>
                  </span>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      void tryCopy(error.requestId!);
                    }}
                  >
                    Copy
                  </button>
                </>
              ) : null}
              <button className="btn btn-secondary" type="button" onClick={clearError}>
                Dismiss
              </button>
              <button className="btn" type="button" onClick={reload}>
                Retry
              </button>
            </div>
          }
        />
      ) : null}

      {subError ? (
        <InlineAlert
          tone="error"
          title={subError.message}
          message={
            [
              typeof subError.status === "number" ? `HTTP ${subError.status}` : null,
              subError.code ? subError.code : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <div className="row" style={{ flexWrap: "wrap" }}>
              {subError.requestId ? (
                <>
                  <span className="help" style={{ alignSelf: "center" }}>
                    Request id: <code>{subError.requestId}</code>
                  </span>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      void tryCopy(subError.requestId!);
                    }}
                  >
                    Copy
                  </button>
                </>
              ) : null}
              <button className="btn btn-secondary" type="button" onClick={() => setSubError(null)}>
                Dismiss
              </button>
            </div>
          }
        />
      ) : null}

      <form onSubmit={onSubmit} className="card" style={{ marginTop: 12, padding: 14 }}>
  <div style={{ fontWeight: 700, marginBottom: 10 }}>Create task</div>

  <div style={{ display: "grid", gap: 10 }}>
    <div>
      <div className="label">Title</div>
      <input
        className="input"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="e.g. Call the accountant"
        ref={titleRef}
        aria-invalid={Boolean(titleError) || undefined}
      />
      {titleError ? <div className="help" style={{ color: "#991b1b" }}>{titleError}</div> : null}
    </div>

    <div>
      <div className="label">Description (optional)</div>
      <textarea
        className="input"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Add context, links, etc."
        rows={3}
        aria-invalid={Boolean(descriptionError) || undefined}
      />
      {descriptionError ? (
        <div className="help" style={{ color: "#991b1b" }}>{descriptionError}</div>
      ) : (
        <div className="help">{descTrim.length}/2000</div>
      )}
    </div>

    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <div style={{ minWidth: 180 }}>
        <div className="label">Type</div>
        <select className="input" value={createEntityType} onChange={(e) => setCreateEntityType(e.target.value as any)}>
          <option value="action">Action</option>
          <option value="project">Project</option>
        </select>
      </div>

      <div style={{ minWidth: 200 }}>
        <div className="label">State</div>
        <select
          className="input"
          value={createState}
          onChange={(e) => {
            const next = e.target.value as any;
            setCreateState(next);
            if (next === "inbox") setDueDate("");
            if (next !== "waiting") setCreateWaitingFor("");
          }}
        >
          <option value="inbox">Inbox</option>
          <option value="next">Next</option>
          <option value="waiting">Waiting</option>
          <option value="scheduled">Scheduled</option>
          <option value="someday">Someday</option>
          <option value="reference">Reference</option>
        </select>
      </div>

      <div style={{ minWidth: 240, flex: 1 }}>
        <div className="label">Context (optional)</div>
        <input
          className="input"
          value={createContext}
          onChange={(e) => setCreateContext(e.target.value)}
          placeholder='e.g. "@home"'
        />
      </div>

      {createState === "waiting" ? (
        <div style={{ minWidth: 260, flex: 1 }}>
          <div className="label">Waiting for…</div>
          <input
            className="input"
            value={createWaitingFor}
            onChange={(e) => setCreateWaitingFor(e.target.value)}
            placeholder="e.g. Reply from accountant"
          />
        </div>
      ) : null}
    </div>

    <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
      <div style={{ minWidth: 200 }}>
        <div className="label">Due date</div>
        <input
          className="input"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={createState === "inbox"}
        />
        {createState === "scheduled" ? <div className="help">Required for Scheduled</div> : null}
      </div>

      <div style={{ minWidth: 160 }}>
        <div className="label">Priority</div>
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
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
          <input
            className="input"
            style={{ width: 120 }}
            inputMode="decimal"
            value={effortValue}
            onChange={(e) => setEffortValue(e.target.value)}
            placeholder="e.g. 1.5"
          />
          <select className="input" value={effortUnit} onChange={(e) => setEffortUnit(e.target.value as any)}>
            <option value="hours">hours</option>
            <option value="days">days</option>
          </select>
        </div>
      </div>
    </div>

    <div>
      <div className="label">Attributes (JSON)</div>
      <textarea
        className="input"
        rows={3}
        value={attrsJson}
        onChange={(e) => setAttrsJson(e.target.value)}
        spellCheck={false}
        placeholder='e.g. {"area":"personal"}'
        aria-invalid={Boolean(attrsError) || undefined}
      />
      {attrsError ? <div className="help" style={{ color: "#991b1b" }}>{attrsError}</div> : <div className="help">Optional</div>}
    </div>

    {gtdCreateError ? <div className="help" style={{ color: "#991b1b" }}>{gtdCreateError}</div> : null}

    <div className="row" style={{ justifyContent: "flex-end" }}>
      <button className="btn btn-primary" type="submit" disabled={!canCreate}>
        {creating ? "Creating…" : "Add task"}
      </button>
    </div>
  </div>
</form>

      <div style={{ marginTop: 16 }}>
        {initialLoading ? (
          <TaskListSkeleton count={4} />
        ) : empty ? (
          <div className="card" style={{ padding: 18, textAlign: "left" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>No tasks yet</div>
            <div className="help" style={{ marginBottom: 10 }}>
              Add your first task above. Keep it short; you can edit later.
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                titleRef.current?.focus();
                titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Create your first task
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visibleItems.map((t) => {
              const pending = pendingFor(t);
              const isEditing = editor?.taskId === t.taskId;
              const expandedHere = isExpanded(t.taskId);
              const childrenState = getSubtree(t.taskId);

              return (
                <div key={t.taskId} className="card" style={{ padding: 14, borderLeft: dueTone(t.dueDate).border ? `4px solid ${dueTone(t.dueDate).border}` : undefined }}>
                  <div className="row space-between" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      {isEditing ? (
                        <div style={{ display: "grid", gap: 8 }}>
                          <input
                            className="input"
                            value={editor.title}
                            onChange={(e) => setEditor((p) => (p ? { ...p, title: e.target.value } : p))}
                          />
                          <textarea
                            className="input"
                            rows={3}
                            value={editor.description}
                            onChange={(e) => setEditor((p) => (p ? { ...p, description: e.target.value } : p))}
                          />
                          
<div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
  <div style={{ minWidth: 180 }}>
    <div className="label">Type</div>
    <select
      className="input"
      value={editor.entityType}
      onChange={(e) =>
        setEditor((p) => (p ? { ...p, entityType: e.target.value as any } : p))
      }
      disabled={Boolean(editor.parentTaskId)}
    >
      <option value="action">Action</option>
      <option value="project">Project</option>
    </select>
  </div>

  <div style={{ minWidth: 200 }}>
    <div className="label">State</div>
    <select
      className="input"
      value={editor.state}
      onChange={(e) => {
        const next = e.target.value as any;
        setEditor((p) => {
          if (!p) return p;
          const clearedDue = next === "inbox" ? "" : p.dueDate;
          const clearedWaiting = next === "waiting" ? p.waitingFor : "";
          return { ...p, state: next, dueDate: clearedDue, waitingFor: clearedWaiting };
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

  <div style={{ minWidth: 240, flex: 1 }}>
    <div className="label">Context</div>
    <input
      className="input"
      value={editor.context}
      onChange={(e) => setEditor((p) => (p ? { ...p, context: e.target.value } : p))}
      placeholder='e.g. "@home"'
    />
  </div>

  {editor.state === "waiting" ? (
    <div style={{ minWidth: 260, flex: 1 }}>
      <div className="label">Waiting for…</div>
      <input
        className="input"
        value={editor.waitingFor}
        onChange={(e) => setEditor((p) => (p ? { ...p, waitingFor: e.target.value } : p))}
      />
    </div>
  ) : null}
</div>

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
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => setEditor(null)}
                              disabled={pending}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="btn"
                              disabled={
                                pending ||
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

                                await patchNode(t, {
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
                          <div
                            style={{
                              fontWeight: 800,
                              textDecoration: t.status === "COMPLETED" ? "line-through" : "none",
                              opacity: t.taskId.startsWith("temp-") ? 0.7 : 1,
                            }}
                          >
                            {t.title}
                          </div>
                          {t.description ? <div style={{ marginTop: 6, color: "#374151" }}>{t.description}</div> : null}
                          <div className="help" style={{ marginTop: 8 }}>
                            {t.status}
                            {t.dueDate ? ` · due ${fmtDue(t.dueDate)} (${dueTone(t.dueDate).label ?? ""})` : ""}
                            {t.priority ? ` · p${t.priority}` : ""}
                            {t.effort ? ` · effort ${t.effort.value} ${t.effort.unit}` : ""}
                            · created {formatTime(t.createdAt)} · updated {formatTime(t.updatedAt)}
                            {t.taskId.startsWith("temp-") ? " · syncing…" : null}
                          </div>

                          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            <button
                              type="button"
                              className="btn btn-secondary"
                              onClick={() => {
                                void toggleExpand(t.taskId);
                              }}
                              disabled={!tokens}
                            >
                              {expandedHere ? "Hide subtasks" : "Show subtasks"}
                              {childrenState.loaded ? ` (${childrenState.items.length})` : ""}
                            </button>
                          </div>

                          {expandedHere ? renderChildren(t.taskId, 1) : null}
                        </>
                      )}
                    </div>

                    <div className="row" style={{ alignItems: "stretch" }}>
                      <button className="btn btn-secondary" onClick={() => void toggleCompleteNode(t)} disabled={pending}>
                        {t.status === "COMPLETED" ? "Reopen" : "Complete"}
                      </button>
                      <button className="btn btn-secondary" onClick={() => startEdit(t)} disabled={pending}>
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => {
                          if (!window.confirm("Delete this task?") ) return;
                          void deleteNode(t);
                        }}
                        title={(subtrees[t.taskId]?.loaded && (subtrees[t.taskId]?.items?.length ?? 0) > 0) ? "This task has subtasks. Delete subtasks first." : undefined}
                        disabled={pending || (subtrees[t.taskId]?.loaded && (subtrees[t.taskId]?.items?.length ?? 0) > 0)}
                      >
                        Delete
                      </button>
                    </div>

{shareFor === t.taskId ? (
  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e5e7eb" }}>
    <div className="row space-between" style={{ alignItems: "center" }}>
      <div style={{ fontWeight: 900 }}>Sharing</div>
      <button className="btn btn-secondary" onClick={closeShares}>
        Close
      </button>
    </div>

    {sharesError ? (
      <div style={{ marginTop: 10 }}>
        <InlineAlert
          tone="error"
          title="Share error"
          message={sharesError.requestId ? `${sharesError.message} (requestId: ${sharesError.requestId})` : sharesError.message}
          actions={
            <button className="btn btn-secondary" onClick={() => setSharesError(null)}>
              Dismiss
            </button>
          }
        />
      </div>
    ) : null}

    <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
      <input
        className="input"
        placeholder="Grantee sub (Cognito user sub)"
        value={shareGranteeSub}
        onChange={(e) => setShareGranteeSub(e.target.value)}
        style={{ flex: 1, minWidth: 240 }}
      />
      <select className="input" value={shareMode} onChange={(e) => setShareMode(e.target.value as any)} style={{ width: 120 }}>
        <option value="VIEW">VIEW</option>
        <option value="EDIT">EDIT</option>
      </select>
      <button className="btn" onClick={() => void submitShare(t.taskId)} disabled={sharesLoading || !shareGranteeSub.trim()}>
        {sharesLoading ? "Saving…" : "Grant"}
      </button>
    </div>

    <div style={{ marginTop: 10 }}>
      {sharesLoading && shares.length === 0 ? (
        <div className="help">Loading…</div>
      ) : shares.length === 0 ? (
        <div className="help">Not shared with anyone.</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {shares.map((g) => (
            <div key={g.granteeSub} className="row space-between" style={{ alignItems: "center" }}>
              <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                {g.granteeSub}
                <span className="pill" style={{ marginLeft: 8 }}>{g.mode}</span>
              </div>
              <button className="btn btn-danger" onClick={() => void removeShare(t.taskId, g.granteeSub)} disabled={sharesLoading}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  </div>
) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="row space-between" style={{ marginTop: 14 }}>
        <div className="help">
          {items.length ? `${items.length} task${items.length === 1 ? "" : "s"}` : ""}
        </div>
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
  );
}
