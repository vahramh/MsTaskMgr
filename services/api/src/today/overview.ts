import type { ExecutionStateSummary, TodayOverviewResponse, TodayTask } from "@tm/shared";
import { buildProjectHealthSummary } from "../insights/project-health";
import { buildTodayRecommendations } from "./best-next-action";
import { buildGuidedActions } from "./guided-actions";
import { loadTodayTasks } from "./repo";
import { daysFromToday, remainingMinutesForTask } from "./scoring";


function buildExecutionState(tasks: TodayTask[], now: Date): ExecutionStateSummary {
  const actionable = tasks.filter((task) => task.state !== "completed" && task.state !== "reference");
  const overdueCount = actionable.filter((task) => task.dueDate && daysFromToday(task.dueDate, now) < 0).length;
  const dueSoonCount = actionable.filter((task) => task.dueDate && daysFromToday(task.dueDate, now) >= 0 && daysFromToday(task.dueDate, now) <= 3).length;
  const blockedCount = actionable.filter((task) => task.state === "waiting" || Boolean(task.waitingFor)).length;
  const staleCount = actionable.filter((task) => {
    const ageMs = now.getTime() - new Date(task.updatedAt || task.createdAt).getTime();
    return ageMs >= 7 * 86400000;
  }).length;
  const readyCount = actionable.filter((task) => task.state === "next").length;
  const remainingMinutes = actionable.reduce((sum, task) => sum + (remainingMinutesForTask(task) ?? 0), 0);

  let level: ExecutionStateSummary["level"] = "calm";
  if (overdueCount >= 4 || (overdueCount >= 2 && blockedCount >= 3) || readyCount === 0) level = "critical";
  else if (overdueCount >= 2 || dueSoonCount >= 5 || blockedCount >= 4 || remainingMinutes >= 18 * 60) level = "stressed";
  else if (dueSoonCount >= 3 || blockedCount >= 2 || staleCount >= 5 || remainingMinutes >= 12 * 60) level = "building";
  else if (readyCount >= 3 || dueSoonCount >= 1 || remainingMinutes >= 4 * 60) level = "balanced";

  const parts: string[] = [];
  if (overdueCount) parts.push(`${overdueCount} overdue`);
  if (dueSoonCount) parts.push(`${dueSoonCount} due soon`);
  if (blockedCount) parts.push(`${blockedCount} blocked`);
  if (staleCount) parts.push(`${staleCount} stale`);
  if (!parts.length && remainingMinutes >= 6 * 60) parts.push(`${Math.round(remainingMinutes / 60)}h remaining`);

  return {
    level,
    summary: parts.length ? parts.slice(0, 3).join(" • ") : "Clean execution surface",
    metrics: {
      actionableCount: actionable.length,
      overdueCount,
      dueSoonCount,
      blockedCount,
      staleCount,
      readyCount,
      remainingMinutes,
    },
  };
}

export async function buildTodayOverview(sub: string, includeShared: boolean, now: Date): Promise<TodayOverviewResponse> {
  const allItems = await loadTodayTasks(sub, includeShared);
  const actionablePool = allItems.filter((task) => task.state !== "completed" && task.state !== "reference");
  const { summary: projectHealth, taskContextByKey } = buildProjectHealthSummary(allItems, now);
  const { defaultMode, bestNextAction, recommended, recommendationModes } = buildTodayRecommendations(actionablePool, now, taskContextByKey);
  const guidedActions = buildGuidedActions(actionablePool, projectHealth, now, taskContextByKey);
  const executionState = buildExecutionState(actionablePool, now);

  return {
    generatedAt: now.toISOString(),
    includeShared,
    defaultMode,
    bestNextAction,
    recommended,
    recommendationModes,
    guidedActions,
    projectHealth,
    executionState,
  };
}
