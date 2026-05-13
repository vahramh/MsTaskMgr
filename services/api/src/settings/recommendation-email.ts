import type { ExecutionContext, TodayRecommendation } from "@tm/shared";
import { listExecutionContexts } from "../contexts/repo";
import { buildTodayOverview } from "../today/overview";
import { minimumDurationToMinutes, remainingMinutesForTask } from "../today/scoring";
import { getRawSettings, markSent } from "./repo";
import { esc, sendSesEmail } from "./ses";

type Allocation = { recommendation: TodayRecommendation; minutes: number };
type Group = {
  contextName: string;
  plannedMinutes: number;
  planningBudgetMinutes: number;
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

function isWeekend(now: Date): boolean {
  const day = now.getDay();
  return day === 0 || day === 6;
}

function baseMinutesForContext(context: ExecutionContext, now: Date): number {
  const raw = isWeekend(now) ? context.weekendMinutes : context.weekdayMinutes;
  return Math.max(0, Math.floor(typeof raw === "number" && Number.isFinite(raw) ? raw : 0));
}

function allocationBudgetForContext(context: ExecutionContext, now: Date): number {
  return Math.floor(baseMinutesForContext(context, now) * PLANNING_UTILISATION);
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

function render(groups: Group[]) {
  const text = groups.map((g) => {
    const plan = g.allocations.length
      ? [
          `Suggested execution plan (${formatMinutes(g.plannedMinutes)} of ${formatMinutes(g.planningBudgetMinutes)} planning budget):`,
          ...g.allocations.map((a, i) => `${i + 1}. ${formatMinutes(a.minutes)} — ${taskLine(a.recommendation)}`),
        ]
      : [`Suggested execution plan: No allocation. ${g.planningBudgetMinutes <= 0 ? "No time budget configured for this context today." : "No matching task fits the available budget."}`];

    return [
      `${g.contextName}:`,
      ...plan,
      "",
      "Top recommendations:",
      ...(g.recommendations.length ? g.recommendations.map((r, i) => `${i + 1}. ${taskLine(r)}`) : ["No matching recommended tasks."]),
      "",
    ].join("\n");
  }).join("\n");

  const html = `<div style="font-family:Arial,sans-serif;line-height:1.45"><h2>Execution Guidance recommendations</h2>${groups.map((g) => `<h3>${esc(g.contextName)}</h3><h4>Suggested execution plan</h4>${g.allocations.length ? `<p style="color:#555">${esc(formatMinutes(g.plannedMinutes))} allocated from ${esc(formatMinutes(g.planningBudgetMinutes))} planning budget.</p><ol>${g.allocations.map((a) => `<li><strong>${esc(formatMinutes(a.minutes))}</strong> — ${esc(a.recommendation.task.title)}${a.recommendation.project?.title ? `<br><span>Project: ${esc(a.recommendation.project.title)}</span>` : ""}${a.recommendation.task.dueDate ? `<br><span>Due: ${esc(a.recommendation.task.dueDate)}</span>` : ""}${a.recommendation.task.priority ? `<br><span>Priority: P${a.recommendation.task.priority}</span>` : ""}</li>`).join("")}</ol>` : `<p>${g.planningBudgetMinutes <= 0 ? "No time budget configured for this context today." : "No matching task fits the available budget."}</p>`}<h4>Top recommendations</h4>${g.recommendations.length ? `<ol>${g.recommendations.map((r) => `<li><strong>${esc(r.task.title)}</strong>${r.project?.title ? `<br><span>Project: ${esc(r.project.title)}</span>` : ""}${r.task.dueDate ? `<br><span>Due: ${esc(r.task.dueDate)}</span>` : ""}${r.task.priority ? `<br><span>Priority: P${r.task.priority}</span>` : ""}</li>`).join("")}</ol>` : `<p>No matching recommended tasks.</p>`}`).join("")}<p style="color:#666;font-size:12px">Execution plan uses 80% of the configured weekday/weekend context budget. Generated by Execution Guidance System.</p></div>`;
  return { text, html };
}

export async function sendRecommendationsEmailForUser(sub: string, now = new Date()): Promise<{ sent: boolean; message: string; sentAt?: string }> {
  const [raw, contexts] = await Promise.all([getRawSettings(sub), listExecutionContexts(sub)]);
  const notificationEmail = typeof raw?.notificationEmail === "string" ? raw.notificationEmail.trim() : "";
  if (!notificationEmail) return { sent: false, message: "Notification email address is not configured." };

  const topN = Math.max(1, Math.min(20, Number(raw?.notificationSchedule?.topN || 5)));
  const significant = contexts.filter((c) => c.significant && !c.archived);
  if (!significant.length) return { sent: false, message: "No significant execution contexts are selected." };

  const groups: Group[] = [];
  for (const context of significant) {
    const overview = await buildTodayOverview(sub, false, now, [context.contextId], false);
    const recommendations = uniqueRecommendations([
      ...(overview.bestNextAction ? [overview.bestNextAction] : []),
      ...overview.recommended,
    ]).slice(0, topN);

    const planningBudgetMinutes = allocationBudgetForContext(context, now);
    const allocations = allocateExecutionPlan(recommendations, planningBudgetMinutes);
    const plannedMinutes = allocations.reduce((sum, item) => sum + item.minutes, 0);

    groups.push({ contextName: context.name, planningBudgetMinutes, plannedMinutes, recommendations, allocations });
  }
  const { html, text } = render(groups);
  await sendSesEmail(notificationEmail, `EGS recommendations - ${now.toLocaleDateString("en-AU")}`, html, text);
  await markSent(sub, now);
  return { sent: true, message: "Recommendation email sent.", sentAt: now.toISOString() };
}
