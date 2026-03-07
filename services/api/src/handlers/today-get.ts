import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import type { TodayResponse } from "@tm/shared";
import { internalError, ok, unauthorized } from "../lib/http";
import { withHttp } from "../lib/handler";
import type { HttpHandlerContext } from "../lib/handler";
import { log, toErrorInfo } from "../lib/log";
import { loadTodayTasks } from "../today/repo";
import { buildProjectHealth, isDueToday, isOverdue, isWaitingFollowUp, rankTasks, TODAY_CONSTANTS } from "../today/scoring";

function parseIncludeShared(raw: string | undefined): boolean {
  return raw === "1" || raw === "true" || raw === "yes";
}

export const handler = withHttp(async (
  event: APIGatewayProxyEventV2,
  ctx: HttpHandlerContext
): Promise<APIGatewayProxyResultV2> => {
  const requestId = ctx.requestId;
  const sub = ctx.sub;
  if (!sub) return unauthorized("Unauthorized", requestId);

  const includeShared = parseIncludeShared(event.queryStringParameters?.includeShared);
  const now = new Date();

  try {
    const allItems = await loadTodayTasks(sub, includeShared);
    const actionable = allItems.filter((task) => task.state !== "completed" && task.state !== "reference" && task.entityType !== "project");
    const overdue = actionable.filter((task) => isOverdue(task, now));
    const dueToday = actionable.filter((task) => isDueToday(task, now));
    const waiting = actionable.filter((task) => isWaitingFollowUp(task, now));
    const excluded = new Set<string>([
      ...overdue.map((task) => `${task.source}:${task.taskId}`),
      ...dueToday.map((task) => `${task.source}:${task.taskId}`),
    ]);
    const recommended = rankTasks(actionable, now)
      .filter((task) => !excluded.has(`${task.source}:${task.taskId}`))
      .slice(0, TODAY_CONSTANTS.MAX_RECOMMENDED);
    const projectHealth = buildProjectHealth(allItems, now);

    const resp: TodayResponse = {
      generatedAt: now.toISOString(),
      includeShared,
      overdue,
      dueToday,
      waiting,
      recommended,
      projectHealth,
    };
    return ok(resp, requestId);
  } catch (e: any) {
    log("error", "today.get_failed", { requestId, sub, includeShared, error: toErrorInfo(e) });
    return internalError("Failed to build Today view", undefined, requestId);
  }
});
