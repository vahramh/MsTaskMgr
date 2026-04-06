import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreateTaskRequest, Task, TaskStatus, UpdateTaskRequest } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { ApiError } from "../../api/http";
import { completeTask, createTask, deleteTask, listTasks, reopenTask, updateTask } from "./api";

type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

type PendingMap = Record<string, true>;

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
    minimumDuration: req.minimumDuration,
    attrs: req.attrs,
    status: "OPEN",
    entityType: req.entityType,
    state: req.state,
    context: req.context,
    waitingFor: req.waitingFor,
    waitingForTaskId: req.waitingForTaskId,
    waitingForTaskTitle: req.waitingForTaskTitle,
    resumeStateAfterWait: req.resumeStateAfterWait,
    createdAt: now,
    updatedAt: now,
    rev: 0,
  };
}

function nullToUndefined<T>(v: T | null | undefined): T | undefined {
  return v === null ? undefined : v;
}

function upsertTask(list: Task[], task: Task): Task[] {
  const idx = list.findIndex((x) => x.taskId === task.taskId);
  if (idx < 0) return [task, ...list];
  const next = [...list];
  next[idx] = task;
  return next;
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
    abortRef.current?.abort();

    const ac = new AbortController();
    abortRef.current = ac;

    try {
      const r = await listTasks(tokens, { limit: 20 }, ac.signal);
      if (abortRef.current !== ac) return;
      setItems(r.items);
      setNextToken(r.nextToken);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(toUiError(e));
    } finally {
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

  const create = useCallback(async (req: CreateTaskRequest) => {
    if (!tokens) return;

    clearError();
    setCreating(true);

    const optimistic = makeTempTask(req);
    setItems((prev) => [optimistic, ...prev]);

    try {
      const r = await createTask(tokens, req);
      setItems((prev) => prev.map((t) => (t.taskId === optimistic.taskId ? r.task : t)));
    } catch (e) {
      setItems((prev) => prev.filter((t) => t.taskId !== optimistic.taskId));
      if (isAbortError(e)) return;
      setError(toUiError(e));
    } finally {
      setCreating(false);
    }
  }, [tokens, clearError]);

  const setPending = useCallback((taskId: string, on: boolean) => {
    setPendingById((prev) => {
      const next = { ...prev };
      if (on) next[taskId] = true;
      else delete next[taskId];
      return next;
    });
  }, []);

  const patchTask = useCallback(async (
    task: Task,
    partial: Omit<UpdateTaskRequest, "expectedRev">,
    overrideStatus?: TaskStatus
  ) => {
    if (!tokens) return;

    clearError();
    const prev = task;

    const optimistic: Task = {
      ...prev,
      title: partial.title ?? prev.title,
      description: partial.description ?? prev.description,
      status: overrideStatus ?? partial.status ?? prev.status,
      schemaVersion: prev.schemaVersion,
      entityType: partial.entityType ?? prev.entityType,
      state: partial.state ?? prev.state,
      context: partial.context === undefined ? prev.context : nullToUndefined(partial.context),
      waitingFor: partial.waitingFor === undefined ? prev.waitingFor : nullToUndefined(partial.waitingFor),
      waitingForTaskId: (partial as any).waitingForTaskId === undefined ? prev.waitingForTaskId : nullToUndefined((partial as any).waitingForTaskId),
      waitingForTaskTitle: (partial as any).waitingForTaskTitle === undefined ? prev.waitingForTaskTitle : nullToUndefined((partial as any).waitingForTaskTitle),
      resumeStateAfterWait: (partial as any).resumeStateAfterWait === undefined ? prev.resumeStateAfterWait : nullToUndefined((partial as any).resumeStateAfterWait),
      dueDate: partial.dueDate === undefined ? prev.dueDate : nullToUndefined(partial.dueDate),
      priority: partial.priority === undefined ? prev.priority : nullToUndefined(partial.priority),
      effort: partial.effort === undefined ? prev.effort : nullToUndefined(partial.effort),
      minimumDuration: partial.minimumDuration === undefined ? prev.minimumDuration : nullToUndefined(partial.minimumDuration),
      attrs: partial.attrs === undefined ? prev.attrs : nullToUndefined(partial.attrs),
      updatedAt: nowIso(),
    };

    setPending(task.taskId, true);
    setItems((list) => upsertTask(list, optimistic));

    try {
      const r = await updateTask(tokens, task.taskId, {
        ...partial,
        status: overrideStatus ?? partial.status,
        expectedRev: prev.rev,
      });
      setItems((list) => upsertTask(list, r.task));
    } catch (e) {
      setItems((list) => upsertTask(list, prev));
      if (isAbortError(e)) return;
      if (!(await handleConflict(e, reload, setError))) setError(toUiError(e));
    } finally {
      setPending(task.taskId, false);
    }
  }, [tokens, clearError, setPending, reload]);

  const patch = useCallback(async (
    taskId: string,
    partial: Omit<UpdateTaskRequest, "expectedRev">,
    overrideStatus?: TaskStatus
  ) => {
    const prev = items.find((t) => t.taskId === taskId);
    if (!prev) return;
    await patchTask(prev, partial, overrideStatus);
  }, [items, patchTask]);

  const toggleCompleteTask = useCallback(async (task: Task) => {
    if (!tokens) return;

    clearError();
    const prev = task;
    const isCompleted = (task.state ?? (task.status === "COMPLETED" ? "completed" : "inbox")) === "completed";

    setPending(task.taskId, true);
    const optimistic: Task = {
      ...task,
      state: isCompleted ? (task.dueDate ? "scheduled" : "inbox") : "completed",
      status: isCompleted ? "OPEN" : "COMPLETED",
      updatedAt: nowIso(),
    };
    setItems((list) => upsertTask(list, optimistic));

    try {
      const r = isCompleted
        ? await reopenTask(tokens, task.taskId, task.rev)
        : await completeTask(tokens, task.taskId, task.rev);
      setItems((list) => upsertTask(list, r.task));
    } catch (e) {
      setItems((list) => upsertTask(list, prev));
      if (isAbortError(e)) return;
      if (!(await handleConflict(e, reload, setError))) setError(toUiError(e));
    } finally {
      setPending(task.taskId, false);
    }
  }, [tokens, clearError, setPending, reload]);

  const toggleComplete = useCallback(async (task: Task) => {
    await toggleCompleteTask(task);
  }, [toggleCompleteTask]);

  const removeTask = useCallback(async (task: Task) => {
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
  }, [tokens, items, clearError, setPending, reload]);

  const remove = useCallback(async (task: Task) => {
    await removeTask(task);
  }, [removeTask]);

  useEffect(() => {
    if (!tokens) {
      setItems([]);
      setNextToken(undefined);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    void reload();
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
    patchTask,
    toggleComplete,
    toggleCompleteTask,
    remove,
    removeTask,
  };
}
