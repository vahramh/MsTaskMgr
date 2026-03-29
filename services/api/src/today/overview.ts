import type { TodayOverviewResponse } from "@tm/shared";
import { buildProjectHealthSummary } from "../insights/project-health";
import { buildTodayRecommendations } from "./best-next-action";
import { buildGuidedActions } from "./guided-actions";
import { buildFallbackRecommendation, buildTodayAttentionItems, buildTodayExecutionMetrics } from "./attention";
import { loadTodayTasks } from "./repo";

export async function buildTodayOverview(sub: string, includeShared: boolean, now: Date): Promise<TodayOverviewResponse> {
  const allItems = await loadTodayTasks(sub, includeShared);
  const actionablePool = allItems.filter((task) => task.state !== "completed" && task.state !== "reference");
  const { summary: projectHealth, taskContextByKey } = buildProjectHealthSummary(allItems, now);
  const { defaultMode, bestNextAction, recommended, recommendationModes } = buildTodayRecommendations(actionablePool, now, taskContextByKey);
  const guidedActions = buildGuidedActions(actionablePool, projectHealth, now, taskContextByKey);
  const executionMetrics = buildTodayExecutionMetrics(actionablePool, now);
  const attentionItems = buildTodayAttentionItems(actionablePool, now);
  const fallbackRecommendation = buildFallbackRecommendation(Boolean(bestNextAction), attentionItems, guidedActions);

  return {
    generatedAt: now.toISOString(),
    includeShared,
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
