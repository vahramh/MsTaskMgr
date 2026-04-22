
import type { ExecutionContext, Task } from "@tm/shared";

function splitLegacyContext(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[|,;]+/)
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

export function isTaskEligibleByExecutionContext(
  task: Task,
  activeContextIds: string[] | undefined,
  includeNoContext: boolean,
  contextIndex: Map<string, ExecutionContext>
): boolean {
  if (!activeContextIds || activeContextIds.length === 0) return true;

  const canonicalIds = Array.isArray(task.contextIds)
    ? task.contextIds.filter((value) => typeof value === "string" && value.trim().length > 0)
    : [];

  if (canonicalIds.length > 0) {
    return canonicalIds.some((value) => activeContextIds.includes(value));
  }

  const legacyTokens = splitLegacyContext(task.context);
  if (legacyTokens.length === 0) return includeNoContext;

  const activeNames = new Set(
    activeContextIds
      .map((id) => contextIndex.get(id)?.name?.trim().toLowerCase())
      .filter((value): value is string => Boolean(value))
  );

  return legacyTokens.some((token) => activeNames.has(token));
}
