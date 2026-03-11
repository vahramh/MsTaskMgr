import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSpeechToText } from "../../hooks/useSpeechToText";
import { useSearchParams } from "react-router-dom";
import { getHygieneSignals } from "./hygiene";
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

function speechErrorLabel(error: string | null): string {
  switch (error) {
    case "not-allowed":
      return "Microphone permission was denied.";
    case "audio-capture":
      return "No microphone was found.";
    case "no-speech":
      return "No speech was detected.";
    case "network":
      return "Speech recognition network error.";
    case "service-not-allowed":
      return "Speech recognition is not allowed on this device/browser.";
    case "language-not-supported":
      return "Speech language is not supported on this device/browser.";
    default:
      return error ? `Voice input failed: ${error}` : "";
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

function stateTone(s: WorkflowState): { bg: string; fg: string; border: string } {
  switch (s) {
    case "inbox":
      return { bg: "#eef2ff", fg: "#1e3a8a", border: "#c7d2fe" };
    case "next":
      return { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" };
    case "waiting":
      return { bg: "#fffbeb", fg: "#92400e", border: "#fde68a" };
    case "scheduled":
      return { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" };
    case "someday":
      return { bg: "#f5f3ff", fg: "#5b21b6", border: "#ddd6fe" };
    case "reference":
      return { bg: "#f3f4f6", fg: "#374151", border: "#e5e7eb" };
    case "completed":
      return { bg: "#f3f4f6", fg: "#6b7280", border: "#e5e7eb" };
  }
}

function StateBadge({ state }: { state: WorkflowState }) {
  const t = stateTone(state);
  return (
    <span
      className="state-badge"
      style={{
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
      }}
      title={stateLabel(state)}
    >
      {stateLabel(state).toUpperCase()}
    </span>
  );
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
  minimumDurationValue: string;
  minimumDurationUnit: "minutes" | "hours";
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

function isAction(t: Task): boolean {
  return deriveEntityType(t) === "action";
}

function isProject(t: Task): boolean {
  return deriveEntityType(t) === "project";
}

function isValidIsoDateOnly(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s);
  return !Number.isNaN(d.getTime());
}

async function promptWaitingFor(current?: string): Promise<string | null> {
  const v = window.prompt("Waiting for…", (current ?? "").trim());
  if (v === null) return null;
  const t = v.trim();
  return t.length ? t : null;
}

async function promptDueDate(current?: string): Promise<string | null> {
  const v = window.prompt("Due date (YYYY-MM-DD)", (current ?? "").trim());
  if (v === null) return null;
  const t = v.trim();
  if (!t) return null;
  if (!isValidIsoDateOnly(t)) {
    alert("Please enter a valid date in YYYY-MM-DD format.");
    return null;
  }
  return t;
}

function formatDateOnlyLocal(d: Date): string {
  const year = d.getFullYear();
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeLocal(d: Date): string {
  const hours = `${d.getHours()}`.padStart(2, "0");
  const minutes = `${d.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addDaysLocal(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

function startOfLocalDay(base: Date): Date {
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 0, 0, 0, 0);
}

function weekdayIndex(name: string): number | null {
  const map: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[name.toLowerCase()] ?? null;
}

function nextWeekday(base: Date, target: number, includeThisWeek = true): Date {
  const result = startOfLocalDay(base);
  const current = result.getDay();
  let delta = target - current;

  if (includeThisWeek) {
    if (delta < 0) delta += 7;
  } else {
    if (delta <= 0) delta += 7;
  }

  result.setDate(result.getDate() + delta);
  return result;
}

function parseSpokenTime(raw: string): { hours: number; minutes: number } | null {
  const text = raw.trim().toLowerCase();

  if (text === "noon") return { hours: 12, minutes: 0 };
  if (text === "midday") return { hours: 12, minutes: 0 };
  if (text === "midnight") return { hours: 0, minutes: 0 };

  let m = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (m) {
    let hours = parseInt(m[1], 10);
    const minutes = m[2] ? parseInt(m[2], 10) : 0;
    const meridiem = m[3].toLowerCase();

    if (hours === 12) hours = 0;
    if (meridiem === "pm") hours += 12;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  m = text.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const hours = parseInt(m[1], 10);
    const minutes = parseInt(m[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  m = text.match(/^(\d{1,2})\s*o'?clock$/i);
  if (m) {
    const hours = parseInt(m[1], 10);
    if (hours >= 0 && hours <= 23) {
      return { hours, minutes: 0 };
    }
  }

  return null;
}

function applyTimeToDate(base: Date, time: { hours: number; minutes: number }): Date {
  const d = new Date(base);
  d.setHours(time.hours, time.minutes, 0, 0);
  return d;
}

function normaliseWhitespace(text: string): string {
  return text
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

type ParsedVoiceCapture = {
  cleanTitle: string;
  dueDate?: string;
  dueTime?: string;
  priority?: 1 | 2 | 3 | 4;
  state?: "waiting" | "scheduled" | "next";
  waitingFor?: string;
};

function parseVoiceTaskCapture(raw: string, now = new Date()): ParsedVoiceCapture {
  let text = normaliseWhitespace(raw);
  const result: ParsedVoiceCapture = { cleanTitle: text };

  // --------------------
  // PRIORITY
  // --------------------
  const priorityPatterns: Array<[RegExp, 1 | 2 | 3 | 4]> = [
    [/\bpriority\s+1\b/gi, 1],
    [/\bpriority\s+one\b/gi, 1],
    [/\bp1\b/gi, 1],
    [/\burgent\b/gi, 1],
    [/\bhighest priority\b/gi, 1],
    [/\bhigh priority\b/gi, 1],

    [/\bpriority\s+2\b/gi, 2],
    [/\bpriority\s+two\b/gi, 2],
    [/\bp2\b/gi, 2],

    [/\bpriority\s+3\b/gi, 3],
    [/\bpriority\s+three\b/gi, 3],
    [/\bp3\b/gi, 3],
    [/\bmedium priority\b/gi, 3],

    [/\bpriority\s+4\b/gi, 4],
    [/\bpriority\s+four\b/gi, 4],
    [/\bp4\b/gi, 4],
    [/\blow priority\b/gi, 4],
  ];

  for (const [pattern, value] of priorityPatterns) {
    if (pattern.test(text)) {
      result.priority = value;
      text = text.replace(pattern, " ");
      break;
    }
  }

  // --------------------
  // DATE PHRASES
  // --------------------
  let resolvedDate: Date | null = null;

  const dateResolvers: Array<[RegExp, (m: RegExpMatchArray) => Date | null]> = [
    [/\bday after tomorrow\b/i, () => addDaysLocal(now, 2)],
    [/\btomorrow\b/i, () => addDaysLocal(now, 1)],
    [/\btoday\b/i, () => startOfLocalDay(now)],
    [/\bnext week\b/i, () => addDaysLocal(now, 7)],
    [/\bin\s+(\d+)\s+days?\b/i, (m) => addDaysLocal(now, parseInt(m[1], 10))],
    [/\bin\s+(\d+)\s+weeks?\b/i, (m) => addDaysLocal(now, parseInt(m[1], 10) * 7)],
    [
      /\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      (m) => {
        const idx = weekdayIndex(m[1]);
        return idx == null ? null : nextWeekday(now, idx, true);
      },
    ],
    [
      /\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      (m) => {
        const idx = weekdayIndex(m[1]);
        return idx == null ? null : nextWeekday(now, idx, false);
      },
    ],
    [
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      (m) => {
        const idx = weekdayIndex(m[1]);
        return idx == null ? null : nextWeekday(now, idx, true);
      },
    ],
  ];

  for (const [pattern, resolver] of dateResolvers) {
    const match = text.match(pattern);
    if (match) {
      const d = resolver(match);
      if (d) {
        resolvedDate = d;
        text = text.replace(match[0], " ");
        break;
      }
    }
  }

  // explicit ISO date
  const isoDateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (!resolvedDate && isoDateMatch && isValidIsoDateOnly(isoDateMatch[1])) {
    const [y, m, d] = isoDateMatch[1].split("-").map(Number);
    resolvedDate = new Date(y, m - 1, d, 0, 0, 0, 0);
    text = text.replace(isoDateMatch[0], " ");
  }

  // --------------------
  // TIME PHRASES
  // --------------------
  let resolvedTime: { hours: number; minutes: number } | null = null;

  const timePatterns = [
    /\bat\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    /\bat\s+(\d{1,2}:\d{2})\b/i,
    /\bat\s+(noon|midday|midnight)\b/i,
    /\b(\d{1,2}(?::\d{2})?\s*(?:am|pm))\b/i,
    /\b(\d{1,2}:\d{2})\b/i,
    /\b(noon|midday|midnight)\b/i,
  ];

  for (const pattern of timePatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = parseSpokenTime(match[1]);
      if (parsed) {
        resolvedTime = parsed;
        text = text.replace(match[0], " ");
        break;
      }
    }
  }

  if (resolvedDate) {
    result.dueDate = formatDateOnlyLocal(resolvedDate);
    result.state = "scheduled";
  }

  if (resolvedDate && resolvedTime) {
    const dateTime = applyTimeToDate(resolvedDate, resolvedTime);
    result.dueDate = formatDateOnlyLocal(dateTime);
    result.dueTime = formatTimeLocal(dateTime);
    result.state = "scheduled";
  }

  // --------------------
  // WAITING / STATE HINTS
  // --------------------
  const waitingMatch = text.match(/\bwaiting for\s+(.+)$/i);
  if (waitingMatch) {
    let who = waitingMatch[1].trim();

    // clean any trailing punctuation
    who = who.replace(/[.,;:!?]+$/g, "").trim();

    if (who) {
      result.state = "waiting";
      result.waitingFor = who;
      text = text.replace(waitingMatch[0], " ");
    }
  } else if (/\bnext action\b/i.test(text)) {
    result.state = "next";
    text = text.replace(/\bnext action\b/gi, " ");
  } else if (/\bscheduled\b/i.test(text)) {
    result.state = "scheduled";
    text = text.replace(/\bscheduled\b/gi, " ");
  }

  // --------------------
  // CLEAN TITLE
  // --------------------
  text = normaliseWhitespace(
    text
      .replace(/^[,.;:!?-]+/, "")
      .replace(/[,.;:!?-]+$/, "")
  );

  result.cleanTitle = text || raw.trim();

  // If waitingFor accidentally captured only noise, drop it
  if (result.state === "waiting" && (!result.waitingFor || result.waitingFor.length < 2)) {
    delete result.waitingFor;
  }

  return result;
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
  const focusId = searchParams.get("focus") ?? null;
  const focusViewParam = (searchParams.get("pview") ?? "next") as string;
  const scrollToId = searchParams.get("scrollTo") ?? null;
  const editId = searchParams.get("edit") ?? null;
  const focusView: WorkflowState | "all" = ([
    "all",
    "inbox",
    "next",
    "waiting",
    "scheduled",
    "someday",
    "reference",
    "completed",
  ].includes(focusViewParam)
    ? (focusViewParam as any)
    : "next");
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

  // ===== Phase 6 PR1: tabs + counts =====
  type ViewKey = WorkflowState | "projects";

  const VIEW_DEFS: Array<{ key: ViewKey; label: string }> = [
    { key: "inbox", label: "Inbox" },
    { key: "next", label: "Next" },
    { key: "waiting", label: "Waiting" },
    { key: "scheduled", label: "Scheduled" },
    { key: "someday", label: "Someday" },
    { key: "reference", label: "Reference" },
    { key: "completed", label: "Completed" },
    { key: "projects", label: "Projects" },
  ];

  const speech = useSpeechToText({
    lang: "en-AU",
    onResult: (text) => {
      const parsed = parseVoiceTaskCapture(text);

      setTitle((prev) => {
        const nextTitle = parsed.cleanTitle;
        return prev.trim() ? `${prev.trim()} ${nextTitle}`.trim() : nextTitle;
      });

      if (parsed.priority) {
        setPriority(String(parsed.priority));
      }

      if (parsed.state === "waiting") {
        setCreateState("waiting");
      } else if (parsed.state === "scheduled") {
        setCreateState((prev) => (prev === "inbox" ? "scheduled" : prev));
      } else if (parsed.state === "next") {
        setCreateState((prev) => (prev === "inbox" ? "next" : prev));
      }

      if (parsed.waitingFor) {
        setCreateWaitingFor(parsed.waitingFor);
      }

      if (parsed.dueDate) {
        setDueDate(parsed.dueDate);
      }

      window.setTimeout(() => titleRef.current?.focus(), 0);
    },
  });

  const [subtaskSpeechParentId, setSubtaskSpeechParentId] = useState<string | null>(null);
  const subtaskSpeechParentIdRef = useRef<string | null>(null);
  const subtaskSpeech = useSpeechToText({
    lang: "en-AU",
    onResult: (text) => {
      const parsed = parseVoiceTaskCapture(text);
      const nextTitle = parsed.cleanTitle.trim();
      const parentId = subtaskSpeechParentIdRef.current;
      if (!parentId || !nextTitle) return;

      setNewChildTitle((prev) => ({
        ...prev,
        [parentId]: prev[parentId]?.trim()
          ? `${prev[parentId].trim()} ${nextTitle}`.trim()
          : nextTitle,
      }));
    },
  });

  // ===== Phase 6 PR4.3: focused project workspace =====
  type FocusViewKey = WorkflowState | "all";
  const FOCUS_VIEW_DEFS: Array<{ key: FocusViewKey; label: string }> = [
    { key: "all", label: "All" },
    { key: "next", label: "Next" },
    { key: "waiting", label: "Waiting" },
    { key: "scheduled", label: "Scheduled" },
    { key: "inbox", label: "Inbox" },
    { key: "someday", label: "Someday" },
    { key: "reference", label: "Reference" },
    { key: "completed", label: "Completed" },
  ];
  // =====================================

  // ===== Phase 6 PR4.2: Project focus lookup =====
  const focused = useMemo(() => {
    if (!focusId) return null;
    return items.find((t) => t.taskId === focusId) ?? null;
  }, [items, focusId]);
  // ==============================================

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [effortValue, setEffortValue] = useState("");
  const [effortUnit, setEffortUnit] = useState<"hours" | "days">("hours");
  const [minimumDurationValue, setMinimumDurationValue] = useState("");
  const [minimumDurationUnit, setMinimumDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [attrsJson, setAttrsJson] = useState("{}");
  const [showCreate, setShowCreate] = useState(false);
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

  const setFocus = useCallback(
    (taskId: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "projects");
        next.set("focus", taskId);
        next.set("pview", "next");
        return next;
      });
    },
    [setSearchParams]
  );

  const clearFocus = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("focus");
      next.delete("pview");
      next.set("view", "projects");
      return next;
    });
  }, [setSearchParams]);

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
  const subtreesRef = useRef<Record<string, SubtreeState>>({});
  // Keep ref in sync during render so reads are never one-render behind.
  subtreesRef.current = subtrees;

  const setSubtreesSync = useCallback(
    (
      updater: (prev: Record<string, SubtreeState>) => Record<string, SubtreeState>
    ) => {
      setSubtrees((prev) => {
        const next = updater(prev);
        subtreesRef.current = next;
        return next;
      });
    },
    []
  );
  const focusedProject = useMemo(() => {
    if (!focusId) return null;
    return items.find((t) => t.taskId === focusId) ?? null;
  }, [items, focusId]);

  const focusCounts = useMemo(() => {
    const counts: Record<FocusViewKey, number> = {
      all: 0,
      inbox: 0,
      next: 0,
      waiting: 0,
      scheduled: 0,
      someday: 0,
      reference: 0,
      completed: 0,
    };
    if (!focusId) return counts;
    const st = subtrees[focusId];
    const list = st?.items ?? [];
    counts.all = list.length;
    for (const t of list) {
      const s = deriveState(t);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [focusId, subtrees]);

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

  useEffect(() => {
    if (showCreate) {
      titleRef.current?.focus();
    }
  }, [showCreate]);

  useEffect(() => {
    if (subtaskSpeech.state !== "listening" && subtaskSpeechParentIdRef.current) {
      subtaskSpeechParentIdRef.current = null;
      setSubtaskSpeechParentId(null);
    }
  }, [subtaskSpeech.state]);

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
      minimumDuration: minimumDurationValue ? { unit: minimumDurationUnit, value: Number(minimumDurationValue) } : undefined,
      attrs: attrsJsonTrim ? (JSON.parse(attrsJsonTrim) as any) : undefined,
    });
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("");
    setEffortValue("");
    setEffortUnit("hours");
    setMinimumDurationValue("");
    setMinimumDurationUnit("minutes");
    setAttrsJson("{}");
    setCreateEntityType("action");
    setCreateState("inbox");
    setCreateContext("");
    setCreateWaitingFor("");
    setShowCreate(false);
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
      minimumDurationValue: t.minimumDuration ? String(t.minimumDuration.value) : "",
      minimumDurationUnit: (t.minimumDuration?.unit ?? "minutes") as any,
      attrsJson: safeJsonStringify(t.attrs),
      entityType: deriveEntityType(t),
      state: deriveState(t),
      context: t.context ?? "",
      waitingFor: t.waitingFor ?? "",
    });
  }

  const clearDeepLinkEdit = useCallback(() => {
    setSearchParams((prev) => {
      if (!prev.get("edit")) return prev;
      const next = new URLSearchParams(prev);
      next.delete("edit");
      return next;
    });
  }, [setSearchParams]);

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

  const getSubtree = useCallback((parentTaskId: string): SubtreeState => {
    return subtreesRef.current[parentTaskId] ?? { items: [], loaded: false, loading: false };
  }, []);

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

      setSubtreesSync((prev) => ({
        ...prev,
        [parentTaskId]: { ...existing, loading: true },
      }));

      try {
        const r = await listSubtasks(tokens, parentTaskId, { limit: 50 }, ac.signal);
        // If replaced, ignore.
        if (subAbortRef.current.get(parentTaskId) !== ac) return;

        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { items: r.items, loaded: true, loading: false, nextToken: r.nextToken },
        }));
      } catch (e) {
        if (isAbortError(e)) return;
        setSubError(toUiError(e));
        setSubtreesSync((prev) => ({
          ...prev,
          [parentTaskId]: { ...existing, loaded: existing.loaded, loading: false },
        }));
      }
    },
    [tokens, clearAllErrors, getSubtree]
  );

  React.useEffect(() => {
    if (!focusId) return;
    if (view !== "projects") return;
    void loadChildren(focusId);
    setExpandedOn(focusId, true);
  }, [focusId, view, loadChildren, setExpandedOn]);

  useEffect(() => {
    if (!tokens) return;
    if (view === "projects") return;

    const rootProjects = items.filter(
      (t) => deriveEntityType(t) === "project" && !t.parentTaskId
    );

    for (const project of rootProjects) {
      const st = getSubtree(project.taskId);

      if (!st.loaded && !st.loading) {
        void loadChildren(project.taskId);
      }
    }
  }, [tokens, view, items, getSubtree, loadChildren]);  

  React.useEffect(() => {
    if (!editId) return;

    const direct = items.find((t) => t.taskId === editId);
    if (direct) {
      if (editor?.taskId !== direct.taskId) startEdit(direct);
      clearDeepLinkEdit();
      return;
    }

    for (const st of Object.values(subtrees)) {
      const nested = st.items.find((t) => t.taskId === editId);
      if (nested) {
        if (editor?.taskId !== nested.taskId) startEdit(nested);
        clearDeepLinkEdit();
        return;
      }
    }
  }, [editId, items, subtrees, editor?.taskId, clearDeepLinkEdit]);

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

      setSubtreesSync((prev) => ({
        ...prev,
        [parentTaskId]: { ...st, loadingMore: true },
      }));

      try {
        const r = await listSubtasks(tokens, parentTaskId, { limit: 50, nextToken: st.nextToken }, ac.signal);
        if (subAbortRef.current.get(parentTaskId) !== ac) return;

        setSubtreesSync((prev) => {
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
        setSubtreesSync((prev) => ({
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
      setSubtreesSync((prev) => {
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
        setSubtreesSync((prev) => {
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
        setSubtreesSync((prev) => {
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

  const toggleSubtaskSpeech = useCallback((parentTaskId: string) => {
    if (!subtaskSpeech.supported) return;

    const isThisParentListening =
      subtaskSpeech.state === "listening" && subtaskSpeechParentIdRef.current === parentTaskId;

    if (isThisParentListening) {
      subtaskSpeech.stop();
      subtaskSpeechParentIdRef.current = null;
      setSubtaskSpeechParentId(null);
      return;
    }

    subtaskSpeechParentIdRef.current = parentTaskId;
    setSubtaskSpeechParentId(parentTaskId);
    subtaskSpeech.reset();
    subtaskSpeech.start();
  }, [subtaskSpeech]);

  const patchNode = useCallback(
    async (
      node: Task,
      partial: {
        title?: string;
        description?: string;
        dueDate?: string | null;
        priority?: any | null;
        effort?: any | null;
        minimumDuration?: any | null;
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
        minimumDuration: partial.minimumDuration === undefined ? prev.minimumDuration : nullToUndefined(partial.minimumDuration),
        attrs: partial.attrs === undefined ? prev.attrs : nullToUndefined(partial.attrs),
        updatedAt: nowIso(),
      };

      setSubPending(parentTaskId, prev.taskId, true);
      setSubtreesSync((prevMap) => {
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
        setSubtreesSync((prevMap) => {
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
        setSubtreesSync((prevMap) => {
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

  const quickTransition = useCallback(
    async (node: Task, target: WorkflowState) => {
      const cur = deriveState(node);
      const et = deriveEntityType(node);

      if (cur === target) return;

      // GTD UX guards (backend remains authoritative)
      if (target === "next" && et !== "action") {
        alert("Only actions can be moved to Next.");
        return;
      }
      if (et === "project" && target === "next") {
        alert("Projects cannot be in Next.");
        return;
      }

      // Handle required fields by state
      if (target === "waiting") {
        const wf = await promptWaitingFor(node.waitingFor);
        if (!wf) return;
        await patchNode(node, {
          state: "waiting",
          waitingFor: wf,
        } as any);
        return;
      }

      if (target === "scheduled") {
        const due = node.dueDate?.trim() ? node.dueDate.trim() : await promptDueDate("");
        if (!due) return;
        await patchNode(node, {
          state: "scheduled",
          dueDate: due,
        } as any);
        return;
      }

      // Inbox must not have due date; waitingFor only relevant for Waiting
      if (target === "inbox") {
        await patchNode(node, {
          state: "inbox",
          dueDate: null,
          waitingFor: null,
        } as any);
        return;
      }

      // Other states: we've already handled "waiting" above, so here target can never be "waiting".
      // Clear waitingFor when moving out of waiting.
      await patchNode(node, {
        state: target,
        waitingFor: null,
      } as any);
    },
    [patchNode]
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

        setSubtreesSync((prevMap) => {
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
          setSubtreesSync((prevMap) => {
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
          setSubtreesSync((prevMap) => {
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
      setSubtreesSync((prevMap) => {
        const st = prevMap[parentTaskId] ?? { items: [], loaded: true, loading: false };
        return {
          ...prevMap,
          [parentTaskId]: { ...st, items: st.items.filter((t) => t.taskId !== node.taskId) },
        };
      });
      try {
        await deleteSubtask(tokens, parentTaskId, node.taskId);
      } catch (e) {
        setSubtreesSync((prevMap) => {
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
    (
      parentTaskId: string,
      depth: number,
      opts?: { filterState?: WorkflowState | "all" }
    ) => {
      const st = getSubtree(parentTaskId);
      const paddingLeft = Math.min(depth * 18, 72);

      const filterState = opts?.filterState ?? "all";
      const filteredItems =
        filterState === "all" ? st.items : st.items.filter((x) => deriveState(x) === filterState);

      return (
        <div className="tree-wrap" style={{ marginTop: 10, paddingLeft }}>
          <div className="card subtasks-card" style={{ padding: 12, background: "#f9fafb" }}>
            <div className="row space-between" style={{ marginBottom: 8 }}>
              <div style={{ fontWeight: 700 }}>Subtasks</div>
              <div className="help">
                {st.loading
                  ? "Loading…"
                  : st.loaded
                    ? `${filteredItems.length} shown / ${st.items.length} total${st.nextToken ? " (more)" : ""}`
                    : ""}
              </div>
            </div>

            <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
              <div className="speech-input-row" style={{ minWidth: 240, flex: "1 1 320px" }}>
                <input
                  className="input"
                  style={{ minWidth: 240 }}
                  placeholder="Add a subtask…"
                  value={newChildTitle[parentTaskId] ?? ""}
                  onChange={(e) => setNewChildTitle((prev) => ({ ...prev, [parentTaskId]: e.target.value }))}
                />

                {subtaskSpeech.supported ? (
                  <button
                    type="button"
                    className={`btn btn-secondary speech-mic-btn${
                      subtaskSpeech.state === "listening" && subtaskSpeechParentId === parentTaskId
                        ? " is-listening"
                        : ""
                    }`}
                    onClick={() => {
                      toggleSubtaskSpeech(parentTaskId);
                    }}
                    aria-label={
                      subtaskSpeech.state === "listening" && subtaskSpeechParentId === parentTaskId
                        ? "Stop voice input"
                        : "Start voice input"
                    }
                    title={
                      subtaskSpeech.state === "listening" && subtaskSpeechParentId === parentTaskId
                        ? "Stop voice input"
                        : "Speak subtask title"
                    }
                  >
                    {subtaskSpeech.state === "listening" && subtaskSpeechParentId === parentTaskId ? "●" : "🎤"}
                  </button>
                ) : null}
              </div>

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

            {subtaskSpeech.supported &&
            subtaskSpeech.state === "listening" &&
            subtaskSpeechParentId === parentTaskId ? (
              <div className="help" style={{ marginBottom: 8 }}>
                Listening… speak the subtask title.
              </div>
            ) : null}

            {subtaskSpeech.supported &&
            subtaskSpeech.error &&
            subtaskSpeechParentId === parentTaskId ? (
              <div className="help" style={{ marginBottom: 8, color: "#991b1b" }}>
                {speechErrorLabel(subtaskSpeech.error)}
              </div>
            ) : null}

            {st.loading && !st.loaded ? (
              <div className="help">Loading subtasks…</div>
            ) : st.loaded && st.items.length === 0 ? (
              <div className="help">No subtasks yet.</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {filteredItems.map((c) => {
                  const pending = pendingFor(c);
                  const isEditing = editor?.taskId === c.taskId;
                  const expandedHere = isExpanded(c.taskId);

                  return (
                    <div key={c.taskId} className="tree-wrap" style={{ paddingLeft: 14 }}>
                      <div
                        className="card task-card"
                        data-state={deriveState(c)}
                        data-entity={deriveEntityType(c)}
                        style={{
                          padding: 12,
                        borderLeft: dueTone(c.dueDate).border ? `4px solid ${dueTone(c.dueDate).border}` : undefined,
                        opacity: c.taskId.startsWith("temp-") ? 0.7 : 1,
                      }}
                    >
                      <div className="content-actions-row">
                        <div className="content-actions-main text-wrap">
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
                                <div style={{ minWidth: 260 }}>
                                  <div className="label">Minimum focus block</div>
                                  <div className="row" style={{ gap: 8 }}>
                                    <input
                                      className="input"
                                      style={{ width: 120 }}
                                      inputMode="decimal"
                                      value={editor.minimumDurationValue}
                                      onChange={(e) => setEditor((p) => (p ? { ...p, minimumDurationValue: e.target.value } : p))}
                                    />
                                    <select
                                      className="input"
                                      value={editor.minimumDurationUnit}
                                      onChange={(e) => setEditor((p) => (p ? { ...p, minimumDurationUnit: e.target.value as any } : p))}
                                    >
                                      <option value="minutes">minutes</option>
                                      <option value="hours">hours</option>
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
                                    const md = editor.minimumDurationValue.trim();

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
                                      dueDate: due ? due : null,

                                      priority: pr ? (Number(pr) as any) : null,
                                      effort: ev ? { unit: editor.effortUnit, value: Number(ev) } : null,
                                      minimumDuration: md ? { unit: editor.minimumDurationUnit, value: Number(md) } : null,
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
                              {(() => {
                                const s = deriveState(c);
                                const et = deriveEntityType(c);
                                const due = c.dueDate ? fmtDue(c.dueDate) : null;
                                const dueLabel = c.dueDate ? dueTone(c.dueDate).label : null;

                                return (
                                  <div className="meta-row" style={{ marginTop: 8 }}>
                                    <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                      <StateBadge state={s} />
                                      <span className="pill">{et === "project" ? "PROJECT" : "ACTION"}</span>

                                      {s === "waiting" && (c.waitingFor ?? "").trim() ? (
                                        <span className="meta-strong">Waiting for: {(c.waitingFor ?? "").trim()}</span>
                                      ) : null}

                                      {s === "scheduled" && due ? (
                                        <span className="meta-strong">Scheduled: {due}</span>
                                      ) : null}

                                      {s !== "scheduled" && due ? (
                                        <span className="meta-muted">
                                          Due: {due}
                                          {dueLabel ? ` (${dueLabel})` : ""}
                                        </span>
                                      ) : null}

                                      {c.priority ? <span className="meta-muted">P{c.priority}</span> : null}
                                      {c.effort ? <span className="meta-muted">Effort {c.effort.value} {c.effort.unit}</span> : null}
                                      {c.minimumDuration ? <span className="meta-muted">Min block {c.minimumDuration.value} {c.minimumDuration.unit}</span> : null}
                                      {c.taskId.startsWith("temp-") ? <span className="meta-muted">Syncing…</span> : null}
                                    </div>
                                  </div>
                                );
                              })()}
                            </>
                          )}

                          <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                            <button type="button" className="btn btn-secondary" onClick={() => void toggleExpand(c.taskId)} disabled={!tokens}>
                              {expandedHere ? "Hide subtasks" : "Show subtasks"}
                            </button>
                          </div>
                        </div>

                        <div className="content-actions-side">
                          {/* Quick GTD actions (always visible, compact) */}
                          {c.status !== "COMPLETED" ? (
                            <>
                              {/* Inbox triage: same buttons as root to keep muscle memory consistent */}
                              {view === "inbox" ? (
                                <>
                                  {isAction(c) ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-compact"
                                      onClick={() => void quickTransition(c, "next")}
                                      disabled={pending}
                                      title="Move to Next"
                                    >
                                      Next
                                    </button>
                                  ) : null}

                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-compact"
                                    onClick={() => void quickTransition(c, "waiting")}
                                    disabled={pending}
                                    title="Send to Waiting"
                                  >
                                    Waiting
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-compact"
                                    onClick={() => void quickTransition(c, "scheduled")}
                                    disabled={pending}
                                    title="Schedule (requires due date)"
                                  >
                                    Schedule
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-compact"
                                    onClick={() => void quickTransition(c, "someday")}
                                    disabled={pending}
                                    title="Move to Someday"
                                  >
                                    Someday
                                  </button>

                                  <button
                                    type="button"
                                    className="btn btn-secondary btn-compact"
                                    onClick={() => void quickTransition(c, "reference")}
                                    disabled={pending}
                                    title="Move to Reference"
                                  >
                                    Reference
                                  </button>
                                </>
                              ) : (
                                <>
                                  {isAction(c) && deriveState(c) !== "next" ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-compact"
                                      onClick={() => void quickTransition(c, "next")}
                                      disabled={pending}
                                      title="Move to Next"
                                    >
                                      Next
                                    </button>
                                  ) : null}

                                  {deriveState(c) !== "waiting" ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-compact"
                                      onClick={() => void quickTransition(c, "waiting")}
                                      disabled={pending}
                                      title="Send to Waiting"
                                    >
                                      Waiting
                                    </button>
                                  ) : null}

                                  {deriveState(c) !== "scheduled" ? (
                                    <button
                                      type="button"
                                      className="btn btn-secondary btn-compact"
                                      onClick={() => void quickTransition(c, "scheduled")}
                                      disabled={pending}
                                      title="Schedule (requires due date)"
                                    >
                                      Schedule
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </>
                          ) : null}

                          {/* Existing actions */}
                          <button
                            className={view === "next" && c.status !== "COMPLETED" ? "btn btn-primary" : "btn btn-secondary"}
                            onClick={() => void toggleCompleteNode(c)}
                            disabled={pending}
                          >
                            {c.status === "COMPLETED" ? "Reopen" : "Complete"}
                          </button>

                          <button className="btn btn-secondary" onClick={() => startEdit(c)} disabled={pending}>
                            Edit
                          </button>

                          <button
                            className="btn btn-danger"
                            onClick={() => {
                              if (!window.confirm("Delete this subtask?")) return;
                              void deleteNode(c);
                            }}
                            title={
                              subtrees[c.taskId]?.loaded && (subtrees[c.taskId]?.items?.length ?? 0) > 0
                                ? "This subtask has subtasks. Delete subtasks first."
                                : undefined
                            }
                            disabled={pending || (subtrees[c.taskId]?.loaded && (subtrees[c.taskId]?.items?.length ?? 0) > 0)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {expandedHere ? renderChildren(c.taskId, depth + 1) : null}
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
    [
      getSubtree,
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
      loadMoreChildren,
      quickTransition,
      view,
      subtrees,
      subtaskSpeech,
      subtaskSpeechParentId,
      toggleSubtaskSpeech,
    ]
  );

  const loadedSubtaskItems = useMemo(() => {
    const flat: Task[] = [];
    const seen = new Set<string>();

    for (const st of Object.values(subtrees)) {
      for (const t of st.items ?? []) {
        if (seen.has(t.taskId)) continue;
        seen.add(t.taskId);
        flat.push(t);
      }
    }

    return flat;
  }, [subtrees]);

  const bucketSourceItems = useMemo(() => {
    const combined: Task[] = [];
    const seen = new Set<string>();

    for (const t of items) {
      if (seen.has(t.taskId)) continue;
      seen.add(t.taskId);
      combined.push(t);
    }

    for (const t of loadedSubtaskItems) {
      if (seen.has(t.taskId)) continue;
      seen.add(t.taskId);
      combined.push(t);
    }

    return combined;
  }, [items, loadedSubtaskItems]);

  const viewCounts = useMemo(() => {
    const counts: Record<ViewKey, number> = {
      inbox: 0,
      next: 0,
      waiting: 0,
      scheduled: 0,
      someday: 0,
      reference: 0,
      completed: 0,
      projects: 0,
    };

    for (const t of bucketSourceItems) {
      if (deriveEntityType(t) === "project") {
        if (!t.parentTaskId) counts.projects += 1;
        continue;
      }
      const s = deriveState(t);
      counts[s] = (counts[s] ?? 0) + 1;
    }
    return counts;
  }, [bucketSourceItems]);

  // ===== Phase 6 PR4.2: focus filtering in Projects view =====
  const visibleItems = useMemo(() => {
    if (view === "projects") {
      const projects = items.filter((t) => deriveEntityType(t) === "project" && !t.parentTaskId);
      if (focusId) return projects.filter((p) => p.taskId === focusId);
      return projects;
    }

    return bucketSourceItems.filter(
      (t) => deriveEntityType(t) !== "project" && deriveState(t) === view
    );
  }, [items, bucketSourceItems, view, focusId]);
  // ===========================================================

  const empty = !initialLoading && visibleItems.length === 0;

  useEffect(() => {
    if (!scrollToId) return;
    const el = document.querySelector(`[data-task-id="${CSS.escape(scrollToId)}"]`) as HTMLElement | null;
    if (!el) return;
    window.requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [scrollToId, visibleItems.length, subtrees]);

  return (
    <div className="card">
      <div
        className="row space-between sticky-bar"
        style={{ marginBottom: 12, minWidth: 0 }}
      >
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800 }}>
            {view === "projects" ? (focusId && focusedProject ? `Project: ${focusedProject.title}` : "Projects") : stateLabel(view)}
          </div>
        {view === "projects" && focusId ? (
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn btn-secondary btn-compact" onClick={clearFocus}>
              Back to projects
            </button>
          </div>
        ) : null}
          <div style={{ fontSize: 13, color: "#6b7280" }}>
            Quick, pragmatic, and safe-by-default.
          </div>

          {/* ===== Phase 6 PR4.2: Focus indicator + back control ===== */}
          {view === "projects" && focusId ? (
            <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <span className="pill">
                Focused: {focused?.title ?? focusId}
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-compact"
                onClick={clearFocus}
              >
                Back to all projects
              </button>
            </div>
          ) : null}
          {/* ========================================================= */}
        </div>

        <div
          className="row"
          style={{
            gap: 10,
            alignItems: "center",
            minWidth: 0,
            flexShrink: 1,
          }}
        >
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="tabs" role="tablist" aria-label="GTD views">
              {VIEW_DEFS.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  role="tab"
                  aria-selected={view === d.key}
                  className={`tab ${view === d.key ? "tab-active" : ""}`}
                  onClick={() => {
                    setSearchParams((prev) => {
                      const next = new URLSearchParams(prev);
                      next.set("view", d.key);
                      // if switching away from Projects, drop focus to avoid confusing deep links
                      if (d.key !== "projects") next.delete("focus");
                      return next;
                    });
                  }}
                >
                  <span className="tab-label">{d.label}</span>
                  <span className="tab-count">
                    {viewCounts[d.key] ?? 0}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <button
            className="btn btn-secondary"
            onClick={reload}
            disabled={initialLoading || loadingMore || creating}
          >
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
      {!(view === "projects" && focusId) ? (
        <div style={{ marginTop: 12 }}>
          {!showCreate ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setShowCreate(true)}
            >
              New task
            </button>
          ) : null}
        </div>
      ) : null}      
      {!(view === "projects" && focusId) && showCreate ? (
      <form onSubmit={onSubmit} className="card" style={{ marginTop: 12, padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Create task</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div className="label">Title</div>

            <div className="speech-input-row">
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Call the accountant"
                ref={titleRef}
                aria-invalid={Boolean(titleError) || undefined}
              />

              {speech.supported ? (
                <button
                  type="button"
                  className={`btn btn-secondary speech-mic-btn${
                    speech.state === "listening" ? " is-listening" : ""
                  }`}
                  onClick={() => {
                    if (speech.state === "listening") {
                      speech.stop();
                    } else {
                      speech.reset();
                      speech.start();
                    }
                  }}
                  aria-label={speech.state === "listening" ? "Stop voice input" : "Start voice input"}
                  title={speech.state === "listening" ? "Stop voice input" : "Speak task title"}
                >
                  {speech.state === "listening" ? "●" : "🎤"}
                </button>
              ) : null}
            </div>

            {speech.supported && speech.state === "listening" ? (
              <div className="help">Listening… speak the task title.</div>
            ) : null}

            {speech.supported && speech.error ? (
              <div className="help" style={{ color: "#991b1b" }}>
                {speechErrorLabel(speech.error)}
              </div>
            ) : null}

            {titleError ? (
              <div className="help" style={{ color: "#991b1b" }}>
                {titleError}
              </div>
            ) : null}
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

            <div style={{ minWidth: 260 }}>
              <div className="label">Minimum focus block</div>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  style={{ width: 120 }}
                  inputMode="decimal"
                  value={minimumDurationValue}
                  onChange={(e) => setMinimumDurationValue(e.target.value)}
                  placeholder="e.g. 30"
                />
                <select className="input" value={minimumDurationUnit} onChange={(e) => setMinimumDurationUnit(e.target.value as any)}>
                  <option value="minutes">minutes</option>
                  <option value="hours">hours</option>
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

        <div className="row" style={{ justifyContent: "flex-end", gap: 8 }}>
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => setShowCreate(false)}
            disabled={creating}
          >
            Cancel
          </button>

          <button className="btn btn-primary" type="submit" disabled={!canCreate}>
            {creating ? "Creating…" : "Add task"}
          </button>
        </div>
        </div>
      </form>
      ) : null}

      <div style={{ marginTop: 16 }}>
        {initialLoading ? (
          <TaskListSkeleton count={4} />
        ) : view === "projects" && focusId ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="card" style={{ padding: 14 }} data-task-id={focusId ?? undefined}>
              <div className="row space-between" style={{ alignItems: "center" }}>
                <div style={{ fontWeight: 900 }}>Project workspace</div>
                <div className="help">{focusCounts.all} item{focusCounts.all === 1 ? "" : "s"} loaded</div>
              </div>
              {focusedProject ? (() => {
                const focusedPending = pendingFor(focusedProject);
                const isFocusedEditing = editor?.taskId === focusedProject.taskId;
                return (
                  <div style={{ marginTop: 10 }}>
                    {isFocusedEditing ? (
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
                            <input
                              className="input"
                              type="date"
                              value={editor.dueDate}
                              onChange={(e) => setEditor((p) => (p ? { ...p, dueDate: e.target.value } : p))}
                            />
                          </div>

                          <div style={{ minWidth: 160 }}>
                            <div className="label">Priority</div>
                            <select
                              className="input"
                              value={editor.priority}
                              onChange={(e) => setEditor((p) => (p ? { ...p, priority: e.target.value } : p))}
                            >
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
                                value={editor.effortValue}
                                onChange={(e) => setEditor((p) => (p ? { ...p, effortValue: e.target.value } : p))}
                              />
                              <select
                                className="input"
                                value={editor.effortUnit}
                                onChange={(e) => setEditor((p) => (p ? { ...p, effortUnit: e.target.value as any } : p))}
                              >
                                <option value="hours">hours</option>
                                <option value="days">days</option>
                              </select>
                            </div>
                          </div>

                          <div style={{ minWidth: 260 }}>
                            <div className="label">Minimum focus block</div>
                            <div className="row" style={{ gap: 8 }}>
                              <input
                                className="input"
                                style={{ width: 120 }}
                                inputMode="decimal"
                                value={editor.minimumDurationValue}
                                onChange={(e) => setEditor((p) => (p ? { ...p, minimumDurationValue: e.target.value } : p))}
                              />
                              <select
                                className="input"
                                value={editor.minimumDurationUnit}
                                onChange={(e) => setEditor((p) => (p ? { ...p, minimumDurationUnit: e.target.value as any } : p))}
                              >
                                <option value="minutes">minutes</option>
                                <option value="hours">hours</option>
                              </select>
                            </div>
                          </div>
                        </div>

                        <div>
                          <div className="label">Attributes (JSON)</div>
                          <textarea
                            className="input"
                            rows={4}
                            value={editor.attrsJson}
                            onChange={(e) => setEditor((p) => (p ? { ...p, attrsJson: e.target.value } : p))}
                          />
                        </div>

                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => setEditor(null)}
                            disabled={focusedPending}
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            className="btn"
                            disabled={
                              focusedPending ||
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
                              const md = editor.minimumDurationValue.trim();

                              await patchNode(focusedProject, {
                                title: newTitle,
                                description: newDesc || undefined,
                                entityType: editor.entityType,
                                state: editor.state,
                                context: editor.context.trim() ? editor.context.trim() : null,
                                waitingFor:
                                  editor.state === "waiting"
                                    ? editor.waitingFor.trim()
                                      ? editor.waitingFor.trim()
                                      : null
                                    : null,
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
                                minimumDuration: md ? { unit: editor.minimumDurationUnit, value: Number(md) } : null,
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
                        <div style={{ fontWeight: 700 }}>{focusedProject.title}</div>
                        <div className="help" style={{ marginTop: 4 }}>
                          {deriveState(focusedProject)} · {deriveEntityType(focusedProject)}
                          {focusedProject.context ? ` · ${focusedProject.context}` : ""}
                          {fmtDue(focusedProject.dueDate) ? ` · Due ${fmtDue(focusedProject.dueDate)}` : ""}
                        </div>
                        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                          {getHygieneSignals(focusedProject, new Date()).map((signal) => <span key={signal.key} className="pill" title={signal.label}>{signal.icon} {signal.label}</span>)}
                        </div>
                        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => startEdit(focusedProject)}
                            disabled={focusedPending}
                          >
                            Edit
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })() : null}

              <div style={{ marginTop: 10 }}>
                <div className="tabs" role="tablist" aria-label="Project view">
                  {FOCUS_VIEW_DEFS.map((d) => (
                    <button
                      key={d.key}
                      type="button"
                      role="tab"
                      aria-selected={focusView === d.key}
                      className={`tab ${focusView === d.key ? "tab-active" : ""}`}
                      onClick={() => {
                        setSearchParams((prev) => {
                          const next = new URLSearchParams(prev);
                          next.set("view", "projects");
                          next.set("focus", focusId!);
                          next.set("pview", d.key);
                          return next;
                        });
                      }}
                    >
                      <span className="tab-label">{d.label}</span>
                      <span className="tab-count">{focusCounts[d.key] ?? 0}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="row" style={{ justifyContent: "flex-end", marginTop: 10 }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (focusId) void loadChildren(focusId, true);
                  }}
                  disabled={!tokens}
                >
                  Refresh project
                </button>
              </div>
            </div>

            {focusId ? renderChildren(focusId, 1, { filterState: focusView }) : null}
          </div>
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
              const hygieneSignals = getHygieneSignals(t, new Date());

              return (
                <div
                  key={t.taskId}
                  data-task-id={t.taskId}
                  className="card task-card"
                  data-state={deriveState(t)}
                  data-entity={deriveEntityType(t)}
                  style={{ padding: 14, borderLeft: dueTone(t.dueDate).border ? `4px solid ${dueTone(t.dueDate).border}` : undefined }}
                >
                  <div className="content-actions-row">
                    <div className="content-actions-main text-wrap">
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
                              <input
                                className="input"
                                type="date"
                                value={editor.dueDate}
                                onChange={(e) => setEditor((p) => (p ? { ...p, dueDate: e.target.value } : p))}
                              />
                            </div>

                            <div style={{ minWidth: 160 }}>
                              <div className="label">Priority</div>
                              <select
                                className="input"
                                value={editor.priority}
                                onChange={(e) => setEditor((p) => (p ? { ...p, priority: e.target.value } : p))}
                              >
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
                                  value={editor.effortValue}
                                  onChange={(e) => setEditor((p) => (p ? { ...p, effortValue: e.target.value } : p))}
                                />
                                <select
                                  className="input"
                                  value={editor.effortUnit}
                                  onChange={(e) => setEditor((p) => (p ? { ...p, effortUnit: e.target.value as any } : p))}
                                >
                                  <option value="hours">hours</option>
                                  <option value="days">days</option>
                                </select>
                              </div>
                            </div>
                            <div style={{ minWidth: 260 }}>
                              <div className="label">Minimum focus block</div>
                              <div className="row" style={{ gap: 8 }}>
                                <input
                                  className="input"
                                  style={{ width: 120 }}
                                  inputMode="decimal"
                                  value={editor.minimumDurationValue}
                                  onChange={(e) => setEditor((p) => (p ? { ...p, minimumDurationValue: e.target.value } : p))}
                                />
                                <select
                                  className="input"
                                  value={editor.minimumDurationUnit}
                                  onChange={(e) => setEditor((p) => (p ? { ...p, minimumDurationUnit: e.target.value as any } : p))}
                                >
                                  <option value="minutes">minutes</option>
                                  <option value="hours">hours</option>
                                </select>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="label">Attributes (JSON)</div>
                            <textarea
                              className="input"
                              rows={4}
                              value={editor.attrsJson}
                              onChange={(e) => setEditor((p) => (p ? { ...p, attrsJson: e.target.value } : p))}
                            />
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
                                const md = editor.minimumDurationValue.trim();

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
                                  minimumDuration: md ? { unit: editor.minimumDurationUnit, value: Number(md) } : null,
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
                          {(() => {
                            const s = deriveState(t);
                            const et = deriveEntityType(t);
                            const due = t.dueDate ? fmtDue(t.dueDate) : null;
                            const dueLabel = t.dueDate ? dueTone(t.dueDate).label : null;

                            return (
                              <div className="meta-row" style={{ marginTop: 8 }}>
                                <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                                  <StateBadge state={s} />
                                  <span className="pill">{et === "project" ? "PROJECT" : "ACTION"}</span>

                                  {s === "waiting" && (t.waitingFor ?? "").trim() ? (
                                    <span className="meta-strong">Waiting for: {(t.waitingFor ?? "").trim()}</span>
                                  ) : null}

                                  {s === "scheduled" && due ? (
                                    <span className="meta-strong">Scheduled: {due}</span>
                                  ) : null}

                                  {s !== "scheduled" && due ? (
                                    <span className="meta-muted">
                                      Due: {due}
                                      {dueLabel ? ` (${dueLabel})` : ""}
                                    </span>
                                  ) : null}

                                  {t.priority ? <span className="meta-muted">P{t.priority}</span> : null}
                                  {t.effort ? <span className="meta-muted">Effort {t.effort.value} {t.effort.unit}</span> : null}
                              {t.minimumDuration ? <span className="meta-muted">Min block {t.minimumDuration.value} {t.minimumDuration.unit}</span> : null}
                                  {hygieneSignals.map((signal) => <span key={signal.key} className="meta-muted" title={signal.label}>{signal.icon} {signal.label}</span>)}
                                  <span className="meta-muted">Updated {formatTime(t.updatedAt)}</span>
                                  {t.taskId.startsWith("temp-") ? <span className="meta-muted">Syncing…</span> : null}
                                </div>
                              </div>
                            );
                          })()}

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
                        </>
                      )}
                    </div>

                    <div className="content-actions-side">
                      {/* Quick GTD actions (always visible, compact) */}
                      {t.status !== "COMPLETED" ? (
                        <>
                          {/* Inbox triage surface: show the common “process” actions */}
                          {view === "inbox" ? (
                            <>
                              {isAction(t) ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-compact"
                                  onClick={() => void quickTransition(t, "next")}
                                  disabled={pending}
                                  title="Move to Next"
                                >
                                  Next
                                </button>
                              ) : null}

                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => void quickTransition(t, "waiting")}
                                disabled={pending}
                                title="Send to Waiting"
                              >
                                Waiting
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => void quickTransition(t, "scheduled")}
                                disabled={pending}
                                title="Schedule (requires due date)"
                              >
                                Schedule
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => void quickTransition(t, "someday")}
                                disabled={pending}
                                title="Move to Someday"
                              >
                                Someday
                              </button>

                              <button
                                type="button"
                                className="btn btn-secondary btn-compact"
                                onClick={() => void quickTransition(t, "reference")}
                                disabled={pending}
                                title="Move to Reference"
                              >
                                Reference
                              </button>
                            </>
                          ) : (
                            /* Non-inbox views: keep it minimal */
                            <>
                              {isAction(t) && deriveState(t) !== "next" ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-compact"
                                  onClick={() => void quickTransition(t, "next")}
                                  disabled={pending}
                                  title="Move to Next"
                                >
                                  Next
                                </button>
                              ) : null}

                              {deriveState(t) !== "waiting" ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-compact"
                                  onClick={() => void quickTransition(t, "waiting")}
                                  disabled={pending}
                                  title="Send to Waiting"
                                >
                                  Waiting
                                </button>
                              ) : null}

                              {deriveState(t) !== "scheduled" ? (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-compact"
                                  onClick={() => void quickTransition(t, "scheduled")}
                                  disabled={pending}
                                  title="Schedule (requires due date)"
                                >
                                  Schedule
                                </button>
                              ) : null}
                            </>
                          )}
                        </>
                      ) : null}

                      {/* ===== Phase 6 PR4.2: Focus button (Projects view only) ===== */}
                      {view === "projects" && isProject(t) ? (
                        focusId === t.taskId ? (
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onClick={clearFocus}
                            disabled={pending}
                            title="Back to all projects"
                          >
                            Unfocus
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-secondary btn-compact"
                            onClick={() => setFocus(t.taskId)}
                            disabled={pending}
                            title="Focus this project"
                          >
                            Focus
                          </button>
                        )
                      ) : null}
                      {/* =========================================================== */}

                      {/* Existing primary actions */}
                      <button
                      className={view === "next" && t.status !== "COMPLETED" ? "btn btn-primary" : "btn btn-secondary"}
                      onClick={() => void toggleCompleteNode(t)}
                      disabled={pending}
                    >
                      {t.status === "COMPLETED" ? "Reopen" : "Complete"}
                    </button>
                      <button className="btn btn-secondary" onClick={() => startEdit(t)} disabled={pending}>
                        Edit
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => {
                          if (!window.confirm("Delete this task?")) return;
                          void deleteNode(t);
                        }}
                        title={
                          subtrees[t.taskId]?.loaded && (subtrees[t.taskId]?.items?.length ?? 0) > 0
                            ? "This task has subtasks. Delete subtasks first."
                            : undefined
                        }
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

                  {expandedHere ? renderChildren(t.taskId, 1) : null}
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