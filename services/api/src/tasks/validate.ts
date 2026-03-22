import type { DurationEstimate, EffortEstimate, TaskAttributes, TaskAttrValue, TaskPriority } from "@tm/shared";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (!v || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

export function validateDueDate(raw: unknown): { ok: true; value?: string } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "string") return { ok: false, message: "dueDate must be a string" };

  const s = raw.trim();
  if (!s) return { ok: false, message: "dueDate cannot be empty" };
  if (s.length > 40) return { ok: false, message: "dueDate too long" };

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return { ok: false, message: "dueDate must be a valid ISO date/datetime" };

  return { ok: true, value: s };
}

export function validatePriority(raw: unknown): { ok: true; value?: TaskPriority } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!Number.isInteger(raw)) return { ok: false, message: "priority must be an integer" };
  const p = raw as number;
  if (p < 1 || p > 5) return { ok: false, message: "priority must be between 1 and 5" };
  return { ok: true, value: p as TaskPriority };
}

export function validateEffort(raw: unknown): { ok: true; value?: EffortEstimate } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(raw)) return { ok: false, message: "effort must be an object" };

  const unit = (raw as any).unit;
  const value = (raw as any).value;

  if (unit !== "hours" && unit !== "days") return { ok: false, message: "effort.unit must be 'hours' or 'days'" };
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, message: "effort.value must be a finite number" };
  if (value <= 0) return { ok: false, message: "effort.value must be > 0" };

  // Bounded for sanity.
  if (unit === "hours" && value > 10000) return { ok: false, message: "effort.value too large (hours max 10000)" };
  if (unit === "days" && value > 3650) return { ok: false, message: "effort.value too large (days max 3650)" };

  return { ok: true, value: { unit, value } as EffortEstimate };
}




export function validateMinutesField(
  raw: unknown,
  label: string
): { ok: true; value?: number } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw !== "number" || !Number.isFinite(raw)) return { ok: false, message: `${label} must be a finite number` };
  if (raw < 0) return { ok: false, message: `${label} must be >= 0` };
  if (raw > 1000000) return { ok: false, message: `${label} too large` };
  return { ok: true, value: Math.round(raw) };
}
export function validateMinimumDuration(raw: unknown): { ok: true; value?: DurationEstimate } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(raw)) return { ok: false, message: "minimumDuration must be an object" };

  const unit = (raw as any).unit;
  const value = (raw as any).value;

  if (unit !== "minutes" && unit !== "hours") return { ok: false, message: "minimumDuration.unit must be 'minutes' or 'hours'" };
  if (typeof value !== "number" || !Number.isFinite(value)) return { ok: false, message: "minimumDuration.value must be a finite number" };
  if (value <= 0) return { ok: false, message: "minimumDuration.value must be > 0" };

  if (unit === "minutes" && value > 1440) return { ok: false, message: "minimumDuration.value too large (minutes max 1440)" };
  if (unit === "hours" && value > 24) return { ok: false, message: "minimumDuration.value too large (hours max 24)" };

  return { ok: true, value: { unit, value } as DurationEstimate };
}

function validateAttrValue(v: unknown): v is TaskAttrValue {
  if (typeof v === "string") return v.length <= 200;
  if (typeof v === "number") return Number.isFinite(v);
  if (typeof v === "boolean") return true;
  if (Array.isArray(v)) {
    if (v.length > 20) return false;
    return v.every((x) => typeof x === "string" && x.length <= 50);
  }
  return false;
}

export function validateAttrs(raw: unknown): { ok: true; value?: TaskAttributes } | { ok: false; message: string } {
  if (raw === undefined) return { ok: true, value: undefined };
  if (!isPlainObject(raw)) return { ok: false, message: "attrs must be an object" };

  const keys = Object.keys(raw);
  if (keys.length > 20) return { ok: false, message: "attrs has too many keys (max 20)" };

  const out: Record<string, TaskAttrValue> = {};
  for (const k of keys) {
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(k)) return { ok: false, message: "attrs keys must match /^[a-zA-Z0-9_-]{1,40}$/" };

    const v = (raw as any)[k];
    if (!validateAttrValue(v)) return { ok: false, message: `attrs.${k} has invalid or too large value` };
    out[k] = v;
  }

  return { ok: true, value: out as TaskAttributes };
}

export function normalizeNullable<T>(
  raw: unknown,
  validate: (v: unknown) => { ok: true; value?: T } | { ok: false; message: string },
  label: string
): { ok: true; value?: T | null } | { ok: false; message: string } {
  if (raw === null) return { ok: true, value: null };
  const r = validate(raw);
  if (!r.ok) return { ok: false, message: r.message.replace(/^\w+/, label) };
  return { ok: true, value: r.value };
}
