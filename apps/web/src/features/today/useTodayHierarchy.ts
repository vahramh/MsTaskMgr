import { useEffect, useRef, useState } from "react";
import type { CognitoTokens } from "../../auth/tokenStore";
import { ApiError } from "../../api/http";
import { listSharedSubtasks, listSubtasks } from "../tasks/api";
import type { TodayTask } from "./scoring";

type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e && typeof e === "object") {
    const any = e as { name?: string; message?: string };
    if (any.name === "AbortError") return true;
    const msg = typeof any.message === "string" ? any.message.toLowerCase() : "";
    return msg.includes("aborted");
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
    const any = e as { message?: string };
    return { message: any.message ?? String(e) };
  }
  return { message: String(e) };
}

async function listAllOwnedSubtasks(
  tokens: CognitoTokens,
  parentTaskId: string,
  signal: AbortSignal
): Promise<TodayTask[]> {
  const collected: TodayTask[] = [];
  let nextToken: string | undefined;

  do {
    const r = await listSubtasks(tokens, parentTaskId, { limit: 100, nextToken }, signal);
    collected.push(...r.items.map((task) => ({ ...task, source: "owned" as const })));
    nextToken = r.nextToken;
  } while (nextToken);

  return collected;
}

async function listAllSharedSubtasks(
  tokens: CognitoTokens,
  task: TodayTask,
  signal: AbortSignal
): Promise<TodayTask[]> {
  if (!task.sharedMeta) return [];

  const collected: TodayTask[] = [];
  let nextToken: string | undefined;

  do {
    const r = await listSharedSubtasks(
      tokens,
      task.sharedMeta.ownerSub,
      task.sharedMeta.rootTaskId ?? task.taskId,
      task.taskId,
      { limit: 100, nextToken },
      signal
    );

    collected.push(
      ...r.items.map((child) => ({
        ...child,
        source: "shared" as const,
        sharedMeta: task.sharedMeta,
      }))
    );

    nextToken = r.nextToken;
  } while (nextToken);

  return collected;
}

async function expandNode(
  tokens: CognitoTokens,
  task: TodayTask,
  signal: AbortSignal
): Promise<TodayTask[]> {
  const children =
    task.source === "shared"
      ? await listAllSharedSubtasks(tokens, task, signal)
      : await listAllOwnedSubtasks(tokens, task.taskId, signal);

  const descendants: TodayTask[] = [...children];

  for (const child of children) {
    const nested = await expandNode(tokens, child, signal);
    descendants.push(...nested);
  }

  return descendants;
}

export function useTodayHierarchy(tokens: CognitoTokens | null, roots: TodayTask[]) {
  const [items, setItems] = useState<TodayTask[]>(roots);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!tokens) {
      setItems(roots);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    const rootsToExpand = roots.filter((task) => task.entityType === "project");

    if (!rootsToExpand.length) {
      setItems(roots);
      setLoading(false);
      setError(null);
      return;
    }

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        const descendants: TodayTask[] = [];

        for (const root of rootsToExpand) {
          const expanded = await expandNode(tokens, root, ac.signal);
          descendants.push(...expanded);
        }

        if (abortRef.current !== ac) return;

        const seen = new Set<string>();
        const merged: TodayTask[] = [];

        for (const task of [...roots, ...descendants]) {
          const key = `${task.source ?? "owned"}:${task.taskId}`;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(task);
        }

        setItems(merged);
      } catch (e) {
        if (isAbortError(e)) return;
        if (abortRef.current === ac) {
          setItems(roots);
          setError(toUiError(e));
        }
      } finally {
        if (abortRef.current === ac) setLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [tokens, roots]);

  return { items, loading, error };
}