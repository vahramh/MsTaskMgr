import type { ExecutionContext, TodayRecommendation } from "@tm/shared";
import { listExecutionContexts } from "../contexts/repo";
import { buildTodayOverview } from "../today/overview";
import { minimumDurationToMinutes, remainingMinutesForTask } from "../today/scoring";
import { getRawSettings, markSent } from "./repo";
import { esc, sendSesEmail } from "./ses";

type Allocation = { recommendation: TodayRecommendation; minutes: number };
type Group = {
  contextName: string;
  committedMinutes: number;
  plannedMinutes: number;
  planningBudgetMinutes: number;
  flexibleBudgetMinutes: number;
  scheduledCommitments: TodayRecommendation[];
  recommendations: TodayRecommendation[];
  allocations: Allocation[];
};

const PLANNING_UTILISATION = 0.8;
const DEFAULT_MINIMUM_BLOCK_MINUTES = 15;
const DEFAULT_ALLOCATION_MINUTES = 30;

function taskLine(r: TodayRecommendation): string {
  const t = r.task;
  const bits = [r.project?.title ? `Project: ${r.project.title}` : undefined, t.dueDate ? `Due: ${t.dueDate}` : undefined, t.priority ? `P${t.priority}` : undefined].filter(Boolean).join(" · ");
  return `${t.title}${bits ? ` (${bits})` : ""}`;
}

function timezoneFromRawSettings(raw: Record<string, any> | null): string {
  const timezone = raw?.notificationSchedule?.timezone;
  return typeof timezone === "string" && timezone.trim() ? timezone.trim() : "Australia/Melbourne";
}

function dateLabelForTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function isWeekend(now: Date, timezone: string): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(now);
  return weekday === "Sat" || weekday === "Sun";
}

function baseMinutesForContext(context: ExecutionContext, now: Date, timezone: string): number {
  const raw = isWeekend(now, timezone) ? context.weekendMinutes : context.weekdayMinutes;
  return Math.max(0, Math.floor(typeof raw === "number" && Number.isFinite(raw) ? raw : 0));
}

function allocationBudgetForContext(context: ExecutionContext, now: Date, timezone: string): number {
  return Math.floor(baseMinutesForContext(context, now, timezone) * PLANNING_UTILISATION);
}

function uniqueRecommendations(items: TodayRecommendation[]): TodayRecommendation[] {
  const seen = new Set<string>();
  const result: TodayRecommendation[] = [];
  for (const item of items) {
    const key = item.task.taskId;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function plannedMinutesForTask(recommendation: TodayRecommendation): number {
  const task = recommendation.task;
  return remainingMinutesForTask(task) ?? minimumDurationToMinutes(task.minimumDuration) ?? DEFAULT_ALLOCATION_MINUTES;
}

function allocateExecutionPlan(recommendations: TodayRecommendation[], budgetMinutes: number): Allocation[] {
  let remainingBudget = Math.max(0, Math.floor(budgetMinutes));
  const allocations: Allocation[] = [];
  if (remainingBudget <= 0) return allocations;

  for (const recommendation of recommendations) {
    const task = recommendation.task;
    const minimumBlock = minimumDurationToMinutes(task.minimumDuration) ?? DEFAULT_MINIMUM_BLOCK_MINUTES;
    if (minimumBlock <= 0 || remainingBudget < minimumBlock) continue;

    const taskRemaining = remainingMinutesForTask(task) ?? DEFAULT_ALLOCATION_MINUTES;
    if (taskRemaining <= 0) continue;

    const minutes = Math.min(taskRemaining, remainingBudget);
    if (minutes < minimumBlock) continue;

    allocations.push({ recommendation, minutes });
    remainingBudget -= minutes;
    if (remainingBudget < DEFAULT_MINIMUM_BLOCK_MINUTES) break;
  }

  return allocations;
}

function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem ? `${hours}h ${rem}m` : `${hours}h`;
}

function renderTaskHtml(r: TodayRecommendation): string {
  return `<strong>${esc(r.task.title)}</strong>${r.project?.title ? `<br><span>Project: ${esc(r.project.title)}</span>` : ""}${r.task.dueDate ? `<br><span>Due: ${esc(r.task.dueDate)}</span>` : ""}${r.task.priority ? `<br><span>Priority: P${r.task.priority}</span>` : ""}`;
}

function render(groups: Group[]) {
  const text = groups.map((g) => {
    const commitments = g.scheduledCommitments.length
      ? [
          `Today's commitments (${formatMinutes(g.committedMinutes)}):`,
          ...g.scheduledCommitments.map((r, i) => `${i + 1}. ${formatMinutes(plannedMinutesForTask(r))} — ${taskLine(r)}`),
        ]
      : ["Today's commitments: None scheduled for this context."];

    const plan = g.allocations.length
      ? [
          `Suggested flexible execution plan (${formatMinutes(g.plannedMinutes)} of ${formatMinutes(g.flexibleBudgetMinutes)} remaining flexible budget; ${formatMinutes(g.planningBudgetMinutes)} original planning budget):`,
          ...g.allocations.map((a, i) => `${i + 1}. ${formatMinutes(a.minutes)} — ${taskLine(a.recommendation)}`),
        ]
      : [
          `Suggested flexible execution plan: No allocation. ${
            g.planningBudgetMinutes <= 0
              ? "No time budget configured for this context today."
              : g.flexibleBudgetMinutes <= 0
                ? "Today's scheduled commitments consume the available planning budget."
                : "No matching task fits the available flexible budget."
          }`,
        ];

    return [
      `${g.contextName}:`,
      ...commitments,
      "",
      ...plan,
      "",
      "Top recommendations:",
      ...(g.recommendations.length ? g.recommendations.map((r, i) => `${i + 1}. ${taskLine(r)}`) : ["No matching recommended tasks."]),
      "",
    ].join("\n");
  }).join("\n");

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.45"><h2>Execution Guidance recommendations</h2>${groups.map((g) => `<h3>${esc(g.contextName)}</h3><h4>Today's commitments</h4>${g.scheduledCommitments.length ? `<p style="color:#555">${esc(formatMinutes(g.committedMinutes))} scheduled for this context today.</p><ol>${g.scheduledCommitments.map((r) => `<li><strong>${esc(formatMinutes(plannedMinutesForTask(r)))}</strong> — ${renderTaskHtml(r)}</li>`).join("")}</ol>` : `<p>None scheduled for this context.</p>`}<h4>Suggested flexible execution plan</h4>${g.allocations.length ? `<p style="color:#555">${esc(formatMinutes(g.plannedMinutes))} allocated from ${esc(formatMinutes(g.flexibleBudgetMinutes))} remaining flexible budget. Original planning budget: ${esc(formatMinutes(g.planningBudgetMinutes))}; scheduled commitments: ${esc(formatMinutes(g.committedMinutes))}.</p><ol>${g.allocations.map((a) => `<li><strong>${esc(formatMinutes(a.minutes))}</strong> — ${renderTaskHtml(a.recommendation)}</li>`).join("")}</ol>` : `<p>${g.planningBudgetMinutes <= 0 ? "No time budget configured for this context today." : g.flexibleBudgetMinutes <= 0 ? "Today's scheduled commitments consume the available planning budget." : "No matching task fits the available flexible budget."}</p>`}<h4>Top recommendations</h4>${g.recommendations.length ? `<ol>${g.recommendations.map((r) => `<li>${renderTaskHtml(r)}</li>`).join("")}</ol>` : `<p>No matching recommended tasks.</p>`}`).join("")}<p style="color:#666;font-size:12px">Execution plan uses 80% of the configured weekday/weekend context budget. Scheduled commitments are shown first and consume planning budget before discretionary recommendations. Generated by Execution Guidance System.</p></div>`;
  return { text, html };
}

export async function sendRecommendationsEmailForUser(sub: string, now = new Date()): Promise<{ sent: boolean; message: string; sentAt?: string }> {
  const [raw, contexts] = await Promise.all([getRawSettings(sub), listExecutionContexts(sub)]);
  const notificationEmail = typeof raw?.notificationEmail === "string" ? raw.notificationEmail.trim() : "";
  if (!notificationEmail) return { sent: false, message: "Notification email address is not configured." };

  const timezone = timezoneFromRawSettings(raw);
  const topN = Math.max(1, Math.min(20, Number(raw?.notificationSchedule?.topN || 5)));
  const significant = contexts.filter((c) => c.significant && !c.archived);
  if (!significant.length) return { sent: false, message: "No significant execution contexts are selected." };

  const groups: Group[] = [];
  for (const context of significant) {
    const overview = await buildTodayOverview(sub, false, now, [context.contextId], false, timezone);
    const scheduledCommitments = uniqueRecommendations(overview.scheduledCommitments);
    const scheduledIds = new Set(scheduledCommitments.map((item) => item.task.taskId));
    const recommendations = uniqueRecommendations([
      ...(overview.bestNextAction && !scheduledIds.has(overview.bestNextAction.task.taskId) ? [overview.bestNextAction] : []),
      ...overview.recommended,
    ]).filter((item) => !scheduledIds.has(item.task.taskId)).slice(0, topN);

    const planningBudgetMinutes = allocationBudgetForContext(context, now, timezone);
    const committedMinutes = scheduledCommitments.reduce((sum, item) => sum + plannedMinutesForTask(item), 0);
    const flexibleBudgetMinutes = Math.max(0, planningBudgetMinutes - committedMinutes);
    const allocations = allocateExecutionPlan(recommendations, flexibleBudgetMinutes);
    const plannedMinutes = allocations.reduce((sum, item) => sum + item.minutes, 0);

    groups.push({
      contextName: context.name,
      planningBudgetMinutes,
      committedMinutes,
      flexibleBudgetMinutes,
      plannedMinutes,
      scheduledCommitments,
      recommendations,
      allocations,
    });
  }
  const { html, text } = render(groups);
  await sendSesEmail(notificationEmail, `EGS recommendations - ${dateLabelForTimezone(now, timezone)}`, html, text);
  await markSent(sub, now);
  return { sent: true, message: "Recommendation email sent.", sentAt: now.toISOString() };
}
