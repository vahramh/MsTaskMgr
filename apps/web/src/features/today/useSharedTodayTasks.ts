import { useEffect, useRef, useState } from "react";
import type { SharedTaskPointer, Task } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { ApiError } from "../../api/http";
import { listSharedWithMe } from "../tasks/api";
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
    const any = e as any;
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
    const any = e as any;
    return { message: any.message ?? String(e) };
  }
  return { message: String(e) };
}

function normalize(pointer: SharedTaskPointer & { task?: Task }): TodayTask | null {
  if (!pointer.task) return null;
  return {
    ...pointer.task,
    source: "shared",
    sharedMeta: {
      ownerSub: pointer.ownerSub,
      rootTaskId: pointer.rootTaskId,
      mode: pointer.mode,
    },
  };
}

export function useSharedTodayTasks(tokens: CognitoTokens | null, enabled: boolean) {
  const [items, setItems] = useState<TodayTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!tokens || !enabled) {
      setItems([]);
      setLoading(false);
      setError(null);
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }

    const ac = new AbortController();
    abortRef.current?.abort();
    abortRef.current = ac;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        let nextToken: string | undefined;
        const collected: TodayTask[] = [];

        do {
          const response = await listSharedWithMe(tokens, { limit: 100, nextToken }, ac.signal);
          for (const item of response.items) {
            const task = normalize(item);
            if (task) collected.push(task);
          }
          nextToken = response.nextToken;
        } while (nextToken);

        if (abortRef.current === ac) {
          setItems(collected);
        }
      } catch (e) {
        if (isAbortError(e)) return;
        if (abortRef.current === ac) setError(toUiError(e));
      } finally {
        if (abortRef.current === ac) setLoading(false);
      }
    })();

    return () => {
      ac.abort();
    };
  }, [tokens, enabled]);

  return { items, loading, error };
}