
import type { TodayOverviewResponse } from "@tm/shared";
import { buildProjectHealthSummary } from "../insights/project-health";
import { listExecutionContexts } from "../contexts/repo";
import { buildTodayRecommendations } from "./best-next-action";
import { buildGuidedActions } from "./guided-actions";
import { buildFallbackRecommendation, buildTodayAttentionItems, buildTodayExecutionMetrics } from "./attention";
import { loadTodayTasks } from "./repo";
import { isTaskEligibleByExecutionContext } from "./context-filter";

export async function buildTodayOverview(
  sub: string,
  includeShared: boolean,
  now: Date,
  activeContextIds?: string[],
  includeNoContext = true
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
  const { defaultMode, bestNextAction, recommended, recommendationModes } = buildTodayRecommendations(actionablePool, now, taskContextByKey);
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
    attentionItems,
    recommended,
    recommendationModes,
    guidedActions,
    projectHealth,
  };
}
