
import { useCallback, useEffect, useState } from "react";
import type { ExecutionContext, ExecutionContextKind } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { createExecutionContext, listExecutionContexts, updateExecutionContext } from "./api";

export function useExecutionContexts(tokens: CognitoTokens | null) {
  const [items, setItems] = useState<ExecutionContext[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async (signal?: AbortSignal) => {
    if (!tokens) {
      setItems([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await listExecutionContexts(tokens, signal);
      setItems(response.items);
    } catch (e: any) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError(e?.message ?? "Failed to load execution contexts");
    } finally {
      setLoading(false);
    }
  }, [tokens]);

  useEffect(() => {
    const ac = new AbortController();
    void reload(ac.signal);
    return () => ac.abort();
  }, [reload]);

  const create = useCallback(async (name: string, kind: ExecutionContextKind) => {
    if (!tokens) return;
    setSaving(true);
    setError(null);
    try {
      await createExecutionContext(tokens, { name, kind });
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create execution context");
    } finally {
      setSaving(false);
    }
  }, [reload, tokens]);

  const update = useCallback(async (contextId: string, patch: Partial<ExecutionContext>) => {
    if (!tokens) return;
    setSaving(true);
    setError(null);
    try {
      await updateExecutionContext(tokens, contextId, patch);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update execution context");
    } finally {
      setSaving(false);
    }
  }, [reload, tokens]);

  return { items, loading, saving, error, reload, create, update, setError };
}
