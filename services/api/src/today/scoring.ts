import { computeProjectSignals } from "./projectSignals";
import type { Task } from "@tm/shared";

const PROJECT_LEVERAGE_WEIGHT = 0.7;

export function scoreTask(
  task: Task,
  projectSignals?: ReturnType<typeof computeProjectSignals>
): number {

  let score = 0;

  if (task.priority) score += task.priority * 1.2;

  if (task.dueDate) {
    const days =
      (new Date(task.dueDate).getTime() - Date.now()) /
      86400000;

    if (days <= 0) score += 4;
    else if (days <= 3) score += 2;
  }

  if (projectSignals) {

    if (projectSignals.clarity === "needsNextAction")
      score += PROJECT_LEVERAGE_WEIGHT;

    if (projectSignals.blockage === "waiting")
      score += PROJECT_LEVERAGE_WEIGHT * 1.5;

    if (projectSignals.momentum === "stalled")
      score += PROJECT_LEVERAGE_WEIGHT * 1.2;
  }

  return score;
}