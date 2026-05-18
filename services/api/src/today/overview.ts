import type { TodayOverviewResponse, TodayRecommendation } from "@tm/shared";
import { buildProjectHealthSummary } from "../insights/project-health";
import { listExecutionContexts } from "../contexts/repo";
import { buildScheduledCommitments, buildTodayRecommendations, isScheduledForToday } from "./best-next-action";
import { buildGuidedActions } from "./guided-actions";
import { buildFallbackRecommendation, buildTodayAttentionItems, buildTodayExecutionMetrics } from "./attention";
import { loadTodayTasks } from "./repo";
import { isTaskEligibleByExecutionContext } from "./context-filter";
import { taskRefKey } from "./hierarchy";

function uniqueRecommendations(items: TodayRecommendation[]): TodayRecommendation[] {
  const seen = new Set<string>();
  const result: TodayRecommendation[] = [];
  for (const item of items) {
    const key = taskRefKey(item.task);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

export async function buildTodayOverview(
  sub: string,
  includeShared: boolean,
  now: Date,
  activeContextIds?: string[],
  includeNoContext = true,
  timezone = "Australia/Melbourne"
): Promise<TodayOverviewResponse> {
  const [allItems, contexts] = await Promise.all([
    loadTodayTasks(sub, includeShared),
    listExecutionContexts(sub),
  ]);
  const contextIndex = new Map(contexts.map((context) => [context.contextId, context] as const));
  const contextFilteredItems = allItems.filter((task) =>
    isTaskEligibleByExecutionContext(task, activeContextIds, includeNoContext, contextIndex)
  );
  const actionablePool = contextFilteredItems.filter((task) => task.state !== "completed" && task.state !== "reference");
  const { summary: projectHealth, taskContextByKey } = buildProjectHealthSummary(allItems, now);

  const scheduledCommitments = buildScheduledCommitments(actionablePool, now, taskContextByKey, timezone);
  const scheduledKeys = new Set(scheduledCommitments.map((item) => taskRefKey(item.task)));
  const recommendationPool = actionablePool.filter((task) => !isScheduledForToday(task, now, timezone));

  const { defaultMode, bestNextAction: scoredBestNextAction, recommended: scoredRecommended, recommendationModes } = buildTodayRecommendations(
    recommendationPool,
    now,
    taskContextByKey,
    timezone
  );
  const bestNextAction = scheduledCommitments[0] ?? scoredBestNextAction;
  const recommended = uniqueRecommendations([
    ...(scheduledCommitments.length ? [] : scoredBestNextAction ? [scoredBestNextAction] : []),
    ...scoredRecommended,
  ]).filter((item) => !scheduledKeys.has(taskRefKey(item.task)));

  const guidedActions = buildGuidedActions(actionablePool, projectHealth, now, taskContextByKey);
  const executionMetrics = buildTodayExecutionMetrics(actionablePool, now);
  const attentionItems = buildTodayAttentionItems(actionablePool, now);
  const fallbackRecommendation = buildFallbackRecommendation(Boolean(bestNextAction), attentionItems, guidedActions);

  return {
    generatedAt: now.toISOString(),
    includeShared,
    activeContextIds,
    includeNoContext,
    defaultMode,
    executionMetrics,
    bestNextAction,
    fallbackRecommendation,
    scheduledCommitments,
    attentionItems,
    recommended,
    recommendationModes,
    guidedActions,
    projectHealth,
  };
}
