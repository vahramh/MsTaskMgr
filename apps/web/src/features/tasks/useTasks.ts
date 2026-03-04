import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreateTaskRequest, Task, TaskStatus, UpdateTaskRequest } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { ApiError } from "../../api/http";
import { completeTask, createTask, deleteTask, listTasks, updateTask, reopenTask } from "./api";

type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

type PendingMap = Record<string, true>;

function isAbortError(e: unknown): boolean {
  // DOM AbortController abort
  if (e instanceof DOMException && e.name === "AbortError") return true;

  // Some environments throw plain objects/errors
  if (e && typeof e === "object") {
    const any = e as any;
    if (any.name === "AbortError") return true;

    const msg = typeof any.message === "string" ? any.message : "";
    // Covers the exact message you observed: "signal is aborted without reason"
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
) {
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

function makeTempTask(req: CreateTaskRequest): Task {
  const now = nowIso();
  return {
    taskId: `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    title: req.title,
    description: req.description,
    dueDate: req.dueDate,
    priority: req.priority,
    effort: req.effort,
    attrs: req.attrs,
    status: "OPEN",
    // Phase 4 (GTD)
    entityType: req.entityType,
    state: req.state,
    context: req.context,
    waitingFor: req.waitingFor,

    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}

/**
 * Update requests allow `null` to mean "clear this field".
 * The Task model uses `undefined` to represent "not set".
 * So we normalize `null` -> `undefined` in optimistic UI.
 */
function nullToUndefined<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

export function useTasks(tokens: CognitoTokens | null) {
  const [items, setItems] = useState<Task[]>([]);
  const [nextToken, setNextToken] = useState<string | undefined>();

  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [pendingById, setPendingById] = useState<PendingMap>({});

  const [error, setError] = useState<UiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const hasMore = useMemo(() => Boolean(nextToken), [nextToken]);

  const clearError = useCallback(() => setError(null), []);

  const reload = useCallback(async () => {
    if (!tokens) return;

    clearError();
    setInitialLoading(true);

    // Cancel any in-flight request.
    abortRef.current?.abort();

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const r = await listTasks(tokens, { limit: 20 }, ac.signal);

      // If this request is no longer the active one, ignore results (race safety).
      if (abortRef.current !== ac) return;

      setItems(r.items);
      setNextToken(r.nextToken);
    } catch (e) {
      // Aborts are expected (navigation, StrictMode dev, refresh). Do not show to users.
      if (isAbortError(e)) return;
      setError(toUiError(e));
    } finally {
      // Only clear loading state if this request is still current.
      if (abortRef.current === ac) setInitialLoading(false);
    }
  }, [tokens, clearError]);

  const loadMore = useCallback(async () => {
    if (!tokens || !nextToken) return;

    clearError();
    setLoadingMore(true);

    try {
      const r = await listTasks(tokens, { limit: 20, nextToken });
      setItems((prev) => [...prev, ...r.items]);
      setNextToken(r.nextToken);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(toUiError(e));
    } finally {
      setLoadingMore(false);
    }
  }, [tokens, nextToken, clearError]);

  const create = useCallback(
    async (req: CreateTaskRequest) => {
      if (!tokens) return;

      clearError();
      setCreating(true);

      const optimistic = makeTempTask(req);
      setItems((prev) => [optimistic, ...prev]);

      try {
        const r = await createTask(tokens, req);
        setItems((prev) =>
          prev.map((t) => (t.taskId === optimistic.taskId ? r.task : t))
        );
      } catch (e) {
        setItems((prev) => prev.filter((t) => t.taskId !== optimistic.taskId));
        if (isAbortError(e)) return;
        setError(toUiError(e));
      } finally {
        setCreating(false);
      }
    },
    [tokens, clearError]
  );

  const setPending = useCallback((taskId: string, on: boolean) => {
    setPendingById((prev) => {
      const next = { ...prev };
      if (on) next[taskId] = true;
      else delete next[taskId];
      return next;
    });
  }, []);

  const patch = useCallback(
    async (
      taskId: string,
      partial: Omit<UpdateTaskRequest, "expectedRev">,
      overrideStatus?: TaskStatus
    ) => {
      if (!tokens) return;

      clearError();

      const prev = items.find((t) => t.taskId === taskId);
      if (!prev) return;

      const optimistic: Task = {
        ...prev,

        // non-nullable / non-clearing fields (use undefined-as-no-change semantics)
        title: partial.title ?? prev.title,
        description: partial.description ?? prev.description,
        status: overrideStatus ?? partial.status ?? prev.status,

        // Phase 4 (GTD)
        schemaVersion: prev.schemaVersion,
        entityType: partial.entityType ?? prev.entityType,
        state: partial.state ?? prev.state,
        context: partial.context === undefined ? prev.context : nullToUndefined(partial.context),
        waitingFor: partial.waitingFor === undefined ? prev.waitingFor : nullToUndefined(partial.waitingFor),

        // Phase 1 fields: allow null in request to mean "clear", but Task uses undefined for "not set"
        dueDate:
          partial.dueDate === undefined ? prev.dueDate : nullToUndefined(partial.dueDate),
        priority:
          partial.priority === undefined ? prev.priority : nullToUndefined(partial.priority),
        effort:
          partial.effort === undefined ? prev.effort : nullToUndefined(partial.effort),
        attrs:
          partial.attrs === undefined ? prev.attrs : nullToUndefined(partial.attrs),

        updatedAt: nowIso(),
        // keep rev as-is until backend confirms
      };

      setPending(taskId, true);
      setItems((list) => list.map((t) => (t.taskId === taskId ? optimistic : t)));

      try {
        // Phase-1: send expectedRev to prepare for optimistic concurrency.
        const r = await updateTask(tokens, taskId, {
          ...partial,
          status: overrideStatus ?? partial.status,
          expectedRev: prev.rev,
        });
        setItems((list) => list.map((t) => (t.taskId === taskId ? r.task : t)));
      } catch (e) {
        // Roll back.
        setItems((list) => list.map((t) => (t.taskId === taskId ? prev : t)));
        if (isAbortError(e)) return;
        if (!(await handleConflict(e, reload, setError))) setError(toUiError(e));
      } finally {
        setPending(taskId, false);
      }
    },
    [tokens, items, clearError, setPending, reload]
  );

  const toggleComplete = useCallback(
  async (task: Task) => {
    if (!tokens) return;

    clearError();

    const prev = task;

    // Treat GTD 'completed' as the source of truth when present.
    const isCompleted = (task.state ?? (task.status === "COMPLETED" ? "completed" : "inbox")) === "completed";

    setPending(task.taskId, true);

    // Optimistic UI
    const optimistic: Task = {
      ...task,
      state: isCompleted ? (task.dueDate ? "scheduled" : "inbox") : "completed",
      status: isCompleted ? "OPEN" : "COMPLETED",
      updatedAt: nowIso(),
    };
    setItems((list) => list.map((t) => (t.taskId === task.taskId ? optimistic : t)));

    try {
      const r = isCompleted
        ? await reopenTask(tokens, task.taskId, task.rev)
        : await completeTask(tokens, task.taskId, task.rev);

      setItems((list) => list.map((t) => (t.taskId === task.taskId ? r.task : t)));
    } catch (e) {
      setItems((list) => list.map((t) => (t.taskId === task.taskId ? prev : t)));
      if (isAbortError(e)) return;
      if (!(await handleConflict(e, reload, setError))) setError(toUiError(e));
    } finally {
      setPending(task.taskId, false);
    }
  },
  [tokens, clearError, setPending, reload]
);

  const remove = useCallback(
    async (task: Task) => {
      if (!tokens) return;

      clearError();

      const snapshot = [...items];
      setPending(task.taskId, true);
      setItems((list) => list.filter((t) => t.taskId !== task.taskId));

      try {
        await deleteTask(tokens, task.taskId);
      } catch (e) {
        setItems(snapshot);
        if (isAbortError(e)) return;
        if (!(await handleConflict(e, reload, setError))) setError(toUiError(e));
      } finally {
        setPending(task.taskId, false);
      }
    },
    [tokens, items, clearError, setPending, reload]
  );

  useEffect(() => {
    if (!tokens) {
      setItems([]);
      setNextToken(undefined);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    reload();

    // Abort in-flight request on unmount or token change.
    return () => {
      abortRef.current?.abort();
    };
  }, [tokens, reload]);

  return {
    items,
    nextToken,
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
    patch,
    toggleComplete,
    remove,
  };
}