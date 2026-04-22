
import type { ExecutionContext } from "@tm/shared";

const LEGACY_MAP: Record<string, string> = {
  "@home": "home",
  home: "home",
  office: "office",
  work: "office",
  computer: "computer",
  laptop: "computer",
  desktop: "computer",
  phone: "phone",
  mobile: "phone",
  calls: "calls",
  call: "calls",
  email: "email",
  emails: "email",
  agenda: "agenda",
  meeting: "agenda",
  meetings: "agenda",
  admin: "light admin",
  "light admin": "light admin",
  "light-admin": "light admin",
  "low energy": "low energy",
  "low-energy": "low energy",
  focus: "deep focus",
  "deep focus": "deep focus",
  "deep-focus": "deep focus",
  quick: "quick win",
  "quick win": "quick win",
  "quick-win": "quick win",
  errands: "out and about",
  outside: "out and about",
  "out-and-about": "out and about",
};

export function parseLegacyContextNames(raw?: string | null): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(/[|,;]+/)) {
    const key = part.trim().toLowerCase();
    if (!key) continue;
    seen.add(LEGACY_MAP[key] ?? key);
  }
  return Array.from(seen);
}

export function formatContextSummary(raw?: string | null): string | null {
  const tokens = parseLegacyContextNames(raw);
  if (!tokens.length) return raw?.trim() || null;
  return tokens.map((token) => token.replace(/\w/g, (value) => value.toUpperCase())).join(" · ");
}

export function contextIdsFromTask(task: { contextIds?: string[]; context?: string | null }, contexts: ExecutionContext[]): string[] {
  if (Array.isArray(task.contextIds) && task.contextIds.length > 0) return task.contextIds;
  const names = parseLegacyContextNames(task.context);
  if (!names.length) return [];
  const byName = new Map(contexts.map((item) => [item.name.trim().toLowerCase(), item.contextId] as const));
  return names.map((name) => byName.get(name.trim().toLowerCase())).filter((value): value is string => Boolean(value));
}

export function summarizeContexts(contextIds: string[], contexts: ExecutionContext[], raw?: string | null): string | null {
  if (contextIds.length > 0) {
    const byId = new Map(contexts.map((item) => [item.contextId, item] as const));
    const names = contextIds.map((id) => byId.get(id)?.name).filter((value): value is string => Boolean(value));
    if (names.length > 0) return names.join(" · ");
  }
  return formatContextSummary(raw);
}

export function serializeContextSummary(contextIds: string[], contexts: ExecutionContext[]): string | null {
  const byId = new Map(contexts.map((item) => [item.contextId, item] as const));
  const names = contextIds.map((id) => byId.get(id)?.name?.trim()).filter((value): value is string => Boolean(value));
  return names.length ? names.join(", ") : null;
}
