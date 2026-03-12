import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BucketTask, WorkflowState } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { ApiError } from "../../api/http";
import { getBucketCounts, listBucketTasks } from "./api";

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

const EMPTY_COUNTS: Record<WorkflowState, number> = {
  inbox: 0,
  next: 0,
  waiting: 0,
  scheduled: 0,
  someday: 0,
  reference: 0,
  completed: 0,
};

export function useBucketTasks(tokens: CognitoTokens | null, state: WorkflowState | null) {
  const [items, setItems] = useState<BucketTask[]>([]);
  const [counts, setCounts] = useState<Record<WorkflowState, number>>(EMPTY_COUNTS);
  const [nextToken, setNextToken] = useState<string | undefined>();
  const [initialLoading, setInitialLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<UiError | null>(null);

  const listAbortRef = useRef<AbortController | null>(null);
  const countsAbortRef = useRef<AbortController | null>(null);

  const hasMore = useMemo(() => Boolean(nextToken), [nextToken]);
  const clearError = useCallback(() => setError(null), []);

  const reloadCounts = useCallback(async () => {
    if (!tokens) {
      setCounts(EMPTY_COUNTS);
      return;
    }

    countsAbortRef.current?.abort();
    const ac = new AbortController();
    countsAbortRef.current = ac;

    try {
      const r = await getBucketCounts(tokens, ac.signal);
      if (countsAbortRef.current !== ac) return;
      setCounts({ ...EMPTY_COUNTS, ...r.counts });
    } catch (e) {
      if (isAbortError(e)) return;
      setError(toUiError(e));
    }
  }, [tokens]);

  const reload = useCallback(async () => {
    if (!tokens || !state) {
      setItems([]);
      setNextToken(undefined);
      return;
    }

    clearError();
    setInitialLoading(true);

    listAbortRef.current?.abort();
    const ac = new AbortController();
    listAbortRef.current = ac;

    try {
      const r = await listBucketTasks(tokens, state, { limit: 50 }, ac.signal);
      if (listAbortRef.current !== ac) return;
      setItems(r.items);
      setNextToken(r.nextToken);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(toUiError(e));
    } finally {
      if (listAbortRef.current === ac) setInitialLoading(false);
    }
  }, [tokens, state, clearError]);

  const loadMore = useCallback(async () => {
    if (!tokens || !state || !nextToken) return;

    clearError();
    setLoadingMore(true);
    try {
      const r = await listBucketTasks(tokens, state, { limit: 50, nextToken });
      setItems((prev) => [...prev, ...r.items]);
      setNextToken(r.nextToken);
    } catch (e) {
      if (isAbortError(e)) return;
      setError(toUiError(e));
    } finally {
      setLoadingMore(false);
    }
  }, [tokens, state, nextToken, clearError]);

  useEffect(() => {
    if (!tokens) {
      setItems([]);
      setCounts(EMPTY_COUNTS);
      setNextToken(undefined);
      setError(null);
      listAbortRef.current?.abort();
      countsAbortRef.current?.abort();
      return;
    }
    void reloadCounts();
  }, [tokens, reloadCounts]);

  useEffect(() => {
    if (!tokens || !state) {
      setItems([]);
      setNextToken(undefined);
      listAbortRef.current?.abort();
      return;
    }
    void reload();
    return () => listAbortRef.current?.abort();
  }, [tokens, state, reload]);

  return {
    items,
    counts,
    nextToken,
    hasMore,
    initialLoading,
    loadingMore,
    error,
    clearError,
    reload,
    reloadCounts,
    loadMore,
  };
}
