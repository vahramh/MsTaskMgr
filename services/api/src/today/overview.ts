import type { TodayOverviewResponse } from "@tm/shared";
import { buildProjectHealthSummary } from "../insights/project-health";
import { buildTodayRecommendations } from "./best-next-action";
import { loadTodayTasks } from "./repo";
import { buildGuidedActions } from "./guided-actions";

export async function buildTodayOverview(sub: string, includeShared: boolean, now: Date): Promise<TodayOverviewResponse> {
  const allItems = await loadTodayTasks(sub, includeShared);
  const actionablePool = allItems.filter((task) => task.state !== "completed" && task.state !== "reference");
  const { summary: projectHealth, taskContextByKey } = buildProjectHealthSummary(allItems, now);
  const { bestNextAction, recommended } = buildTodayRecommendations(actionablePool, now, taskContextByKey);
  const guidedActions = buildGuidedActions(actionablePool, projectHealth, now);

  return {
    generatedAt: now.toISOString(),
    includeShared,
    bestNextAction,
    recommended,
    guidedActions,
    projectHealth,
  };
}
