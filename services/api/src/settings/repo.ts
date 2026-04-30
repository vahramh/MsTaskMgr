import { GetCommand, PutCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { UserSettings, UpdateUserSettingsRequest } from "@tm/shared";
import { ddb, mustGetEnv } from "../lib/db";

const TABLE = () => mustGetEnv("TASKS_TABLE");
const GSI1 = () => process.env.TASKS_GSI1 || "GSI1";
const SETTINGS_SK = "SETTINGS#notifications";
const DUE_PK = "SETTINGS#NOTIFICATIONS";

function pkForUser(sub: string): string { return `USER#${sub}`; }
function defaultSchedule(): UserSettings["notificationSchedule"] { return { enabled: false, timeOfDay: "08:00", timezone: "Australia/Melbourne", topN: 5 }; }

function normaliseEmail(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function mask(item: Record<string, any> | undefined): UserSettings {
  if (!item) return { notificationSchedule: defaultSchedule() };
  return {
    notificationEmail: normaliseEmail(item.notificationEmail),
    notificationSchedule: { ...defaultSchedule(), ...(item.notificationSchedule ?? {}) },
    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
  };
}

export async function getSettings(sub: string): Promise<UserSettings> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { PK: pkForUser(sub), SK: SETTINGS_SK } }));
  return mask(r.Item);
}

export async function getRawSettings(sub: string): Promise<Record<string, any> | null> {
  const r = await ddb.send(new GetCommand({ TableName: TABLE(), Key: { PK: pkForUser(sub), SK: SETTINGS_SK } }));
  return r.Item ?? null;
}

export function computeNextRunAt(
  schedule: { enabled?: boolean; timeOfDay?: string; timezone?: string },
  from = new Date()
): string | undefined {
  if (!schedule.enabled) return undefined;

  const [hh, mm] = (schedule.timeOfDay || "08:00").split(":").map(Number);

  if (
    !Number.isInteger(hh) ||
    !Number.isInteger(mm) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59
  ) {
    return undefined;
  }

  const tz = schedule.timezone || "Australia/Melbourne";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(from);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);

  const year = get("year");
  const month = get("month");
  const day = get("day");
  const hour = get("hour");
  const minute = get("minute");
  const second = get("second");

  const nowLocalUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let targetLocalUtc = Date.UTC(year, month - 1, day, hh, mm, 0);

  if (targetLocalUtc <= nowLocalUtc) {
    targetLocalUtc += 24 * 60 * 60 * 1000;
  }

  const deltaMs = targetLocalUtc - nowLocalUtc;
  return new Date(from.getTime() + deltaMs).toISOString();
}

function validateNotificationEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw new Error("notificationEmail must be a valid email address");
  return value;
}

export async function updateSettings(sub: string, patch: UpdateUserSettingsRequest): Promise<UserSettings> {
  const existingRaw = await getRawSettings(sub);
  const existing = existingRaw ?? {};
  const now = new Date().toISOString();

  let notificationEmail = mask(existing).notificationEmail;
  if (Object.prototype.hasOwnProperty.call(patch, "notificationEmail")) {
    notificationEmail = patch.notificationEmail === null ? undefined : validateNotificationEmail(normaliseEmail(patch.notificationEmail));
  }

  const notificationSchedule: any = { ...defaultSchedule(), ...(existing.notificationSchedule ?? {}), ...(patch.notificationSchedule ?? {}) };
  notificationSchedule.topN = Math.max(1, Math.min(20, Number(notificationSchedule.topN || 5)));
  notificationSchedule.nextRunAt = computeNextRunAt(notificationSchedule);

  const item: Record<string, any> = { PK: pkForUser(sub), SK: SETTINGS_SK, sub, notificationSchedule, updatedAt: now };
  if (notificationEmail) item.notificationEmail = notificationEmail;
  if (notificationSchedule.enabled && notificationSchedule.nextRunAt) { item.GSI1PK = DUE_PK; item.GSI1SK = notificationSchedule.nextRunAt; }

  await ddb.send(new PutCommand({ TableName: TABLE(), Item: item }));
  return mask(item);
}

export async function markSent(sub: string, at = new Date()): Promise<void> {
  const raw = await getRawSettings(sub); if (!raw) return;
  const schedule: any = { ...defaultSchedule(), ...(raw.notificationSchedule ?? {}), lastSentAt: at.toISOString() };
  schedule.nextRunAt = computeNextRunAt(schedule, at); raw.notificationSchedule = schedule; raw.updatedAt = at.toISOString();
  if (schedule.enabled && schedule.nextRunAt) { raw.GSI1PK = DUE_PK; raw.GSI1SK = schedule.nextRunAt; } else { delete raw.GSI1PK; delete raw.GSI1SK; }
  await ddb.send(new PutCommand({ TableName: TABLE(), Item: raw }));
}

export async function listDueSettings(now = new Date()): Promise<Array<{ sub: string }>> {
  const r = await ddb.send(new QueryCommand({ TableName: TABLE(), IndexName: GSI1(), KeyConditionExpression: "GSI1PK = :pk AND GSI1SK <= :now", ExpressionAttributeValues: { ":pk": DUE_PK, ":now": now.toISOString() } }));
  return (r.Items ?? []).map((item) => ({ sub: String(item.sub) })).filter((x) => x.sub);
}
