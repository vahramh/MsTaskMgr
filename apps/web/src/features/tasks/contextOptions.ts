import type { ExecutionContextOption } from "@tm/shared";

export const CONTEXT_OPTIONS: Array<{ value: ExecutionContextOption; label: string }> = [
  { value: "computer", label: "Computer" },
  { value: "phone", label: "Phone" },
  { value: "home", label: "Home" },
  { value: "office", label: "Office" },
  { value: "out-and-about", label: "Out and about" },
  { value: "deep-focus", label: "Deep focus" },
  { value: "light-admin", label: "Light admin" },
  { value: "low-energy", label: "Low energy" },
  { value: "calls", label: "Calls" },
  { value: "email", label: "Email" },
  { value: "agenda", label: "Agenda" },
  { value: "quick-win", label: "Quick win" },
];

const LEGACY_MAP: Record<string, ExecutionContextOption> = {
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
  admin: "light-admin",
  "light admin": "light-admin",
  "light-admin": "light-admin",
  "low energy": "low-energy",
  "low-energy": "low-energy",
  focus: "deep-focus",
  "deep focus": "deep-focus",
  "deep-focus": "deep-focus",
  quick: "quick-win",
  "quick win": "quick-win",
  "quick-win": "quick-win",
  errands: "out-and-about",
  outside: "out-and-about",
  "out-and-about": "out-and-about",
};

export function parseContextTokens(raw?: string | null): ExecutionContextOption[] {
  if (!raw) return [];
  const seen = new Set<ExecutionContextOption>();
  for (const part of raw.split(/[|,;]+/)) {
    const key = part.trim().toLowerCase();
    if (!key) continue;
    const mapped = LEGACY_MAP[key];
    if (mapped) seen.add(mapped);
  }
  return CONTEXT_OPTIONS.map((option) => option.value).filter((value) => seen.has(value));
}

export function serializeContextTokens(tokens: ExecutionContextOption[]): string | null {
  const clean = CONTEXT_OPTIONS.map((option) => option.value).filter((value) => tokens.includes(value));
  return clean.length ? clean.join(", ") : null;
}

export function formatContextSummary(raw?: string | null): string | null {
  const tokens = parseContextTokens(raw);
  if (!tokens.length) return raw?.trim() || null;
  return CONTEXT_OPTIONS.filter((option) => tokens.includes(option.value))
    .map((option) => option.label)
    .join(" · ");
}
