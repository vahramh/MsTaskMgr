import type { TodayProjectHealthSummary } from "@tm/shared";
import { buildProjectIntelligence, type TaskProjectContext } from "../projects/intelligence";
import type { TodayTask } from "@tm/shared";

export type { TaskProjectContext };

export type ProjectHealthComputation = {
  summary: TodayProjectHealthSummary;
  taskContextByKey: Map<string, TaskProjectContext>;
};

export function buildProjectHealthSummary(tasks: TodayTask[], now: Date): ProjectHealthComputation {
  const { projects, taskContextByKey } = buildProjectIntelligence(tasks, now);

  const summary: TodayProjectHealthSummary = {
    noClearNextStep: projects.filter((item) => item.clarity === "needsClarification" || item.clarity === "needsNextAction"),
    blockedByWaiting: projects.filter((item) => item.blockage === "waiting" || item.blockage === "waitingRisk"),
    deadlinePressure: projects.filter((item) => item.dueSoonCount > 0),
    lowMomentum: projects.filter((item) => (item.momentum === "cold" || item.momentum === "stalled") && item.clarity !== "parked"),
  };

  return { summary, taskContextByKey };
}
