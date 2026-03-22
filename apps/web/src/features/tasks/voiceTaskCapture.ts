export function speechErrorLabel(error: string | null): string {
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

function isValidIsoDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime());
}

function formatDateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTimeLocal(date: Date): string {
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  return `${hours}:${minutes}`;
}

function addDaysLocal(base: Date, days: number): Date {
  const next = new Date(base);
  next.setDate(next.getDate() + days);
  return next;
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
  } else if (delta <= 0) {
    delta += 7;
  }

  result.setDate(result.getDate() + delta);
  return result;
}

function parseSpokenTime(raw: string): { hours: number; minutes: number } | null {
  const text = raw.trim().toLowerCase();

  if (text === "noon" || text === "midday") return { hours: 12, minutes: 0 };
  if (text === "midnight") return { hours: 0, minutes: 0 };

  let match = text.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
  if (match) {
    let hours = parseInt(match[1], 10);
    const minutes = match[2] ? parseInt(match[2], 10) : 0;
    const meridiem = match[3].toLowerCase();

    if (hours === 12) hours = 0;
    if (meridiem === "pm") hours += 12;

    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (match) {
    const hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    if (hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59) {
      return { hours, minutes };
    }
  }

  match = text.match(/^(\d{1,2})\s*o'?clock$/i);
  if (match) {
    const hours = parseInt(match[1], 10);
    if (hours >= 0 && hours <= 23) {
      return { hours, minutes: 0 };
    }
  }

  return null;
}

function applyTimeToDate(base: Date, time: { hours: number; minutes: number }): Date {
  const next = new Date(base);
  next.setHours(time.hours, time.minutes, 0, 0);
  return next;
}

function normaliseWhitespace(text: string): string {
  return text.replace(/\s{2,}/g, " ").replace(/\s+([,.;:!?])/g, "$1").trim();
}

export type ParsedVoiceCapture = {
  cleanTitle: string;
  dueDate?: string;
  dueTime?: string;
  priority?: 1 | 2 | 3 | 4;
  state?: "waiting" | "scheduled" | "next";
  waitingFor?: string;
  context?: string;
};

export function parseVoiceTaskCapture(raw: string, now = new Date()): ParsedVoiceCapture {
  let text = normaliseWhitespace(raw);
  const result: ParsedVoiceCapture = { cleanTitle: text };

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

  let resolvedDate: Date | null = null;
  const dateResolvers: Array<[RegExp, (match: RegExpMatchArray) => Date | null]> = [
    [/\bday after tomorrow\b/i, () => addDaysLocal(now, 2)],
    [/\btomorrow\b/i, () => addDaysLocal(now, 1)],
    [/\btoday\b/i, () => startOfLocalDay(now)],
    [/\bnext week\b/i, () => addDaysLocal(now, 7)],
    [/\bin\s+(\d+)\s+days?\b/i, (match) => addDaysLocal(now, parseInt(match[1], 10))],
    [/\bin\s+(\d+)\s+weeks?\b/i, (match) => addDaysLocal(now, parseInt(match[1], 10) * 7)],
    [/\bthis\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (match) => {
      const index = weekdayIndex(match[1]);
      return index == null ? null : nextWeekday(now, index, true);
    }],
    [/\bnext\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (match) => {
      const index = weekdayIndex(match[1]);
      return index == null ? null : nextWeekday(now, index, false);
    }],
    [/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, (match) => {
      const index = weekdayIndex(match[1]);
      return index == null ? null : nextWeekday(now, index, true);
    }],
  ];

  for (const [pattern, resolver] of dateResolvers) {
    const match = text.match(pattern);
    if (!match) continue;
    const resolved = resolver(match);
    if (resolved) {
      resolvedDate = resolved;
      text = text.replace(match[0], " ");
      break;
    }
  }

  const isoDateMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (!resolvedDate && isoDateMatch && isValidIsoDateOnly(isoDateMatch[1])) {
    const [year, month, day] = isoDateMatch[1].split("-").map(Number);
    resolvedDate = new Date(year, month - 1, day, 0, 0, 0, 0);
    text = text.replace(isoDateMatch[0], " ");
  }

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
    if (!match) continue;
    const parsed = parseSpokenTime(match[1]);
    if (parsed) {
      resolvedTime = parsed;
      text = text.replace(match[0], " ");
      break;
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

  const waitingMatch = text.match(/\bwaiting for\s+(.+)$/i);
  if (waitingMatch) {
    let who = waitingMatch[1].trim().replace(/[.,;:!?]+$/g, "").trim();
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

  const spokenContexts: Array<[RegExp, string]> = [
    [/\bcomputer\b/i, "computer"],
    [/\bphone\b/i, "phone"],
    [/\bhome\b/i, "home"],
    [/\boffice\b/i, "office"],
    [/\bout and about\b/i, "out-and-about"],
    [/\bdeep focus\b/i, "deep-focus"],
    [/\blight admin\b/i, "light-admin"],
    [/\blow energy\b/i, "low-energy"],
    [/\bcalls?\b/i, "calls"],
    [/\bemail\b/i, "email"],
    [/\bagenda\b/i, "agenda"],
    [/\bquick win\b/i, "quick-win"],
  ];

  const capturedContexts: string[] = [];
  for (const [pattern, value] of spokenContexts) {
    if (pattern.test(text)) {
      capturedContexts.push(value);
      text = text.replace(pattern, " ");
    }
  }

  if (capturedContexts.length) {
    result.context = Array.from(new Set(capturedContexts)).join(", ");
  }
    
  text = normaliseWhitespace(text.replace(/^[,.;:!?-]+/, "").replace(/[,.;:!?-]+$/, ""));
  result.cleanTitle = text || raw.trim();

  if (result.state === "waiting" && (!result.waitingFor || result.waitingFor.length < 2)) {
    delete result.waitingFor;
  }

  return result;
}

export function promptWaitingFor(current?: string): string | null {
  const value = window.prompt("Waiting for…", (current ?? "").trim());
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function promptDueDate(current?: string): string | null {
  const value = window.prompt("Due date (YYYY-MM-DD)", (current ?? "").trim());
  if (value === null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isValidIsoDateOnly(trimmed)) {
    alert("Please enter a valid date in YYYY-MM-DD format.");
    return null;
  }
  return trimmed;
}
