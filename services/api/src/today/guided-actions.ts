import type { TodayGuidedActions, TodayTask } from "@tm/shared";
import type { TodayProjectHealthSummary } from "@tm/shared";
import { effortToMinutes, isWaitingFollowUp, minimumDurationToMinutes } from "./scoring";

const DEFER_COUNT_ATTR = "_egsDeferCount";

function sampleTitles(tasks: TodayTask[], limit = 3): string[] {
  return tasks.slice(0, limit).map((task) => task.title);
}

function isLargeDeferredTask(task: TodayTask): boolean {
  if (task.entityType === "project") return false;
  if (task.state === "completed" || task.state === "reference" || task.state === "someday") return false;
  const deferCount = typeof task.attrs?.[DEFER_COUNT_ATTR] === "number" ? Number(task.attrs?.[DEFER_COUNT_ATTR]) : 0;
  const effortMinutes = effortToMinutes(task.effort) ?? 0;
  const blockMinutes = minimumDurationToMinutes(task.minimumDuration) ?? 0;
  return deferCount >= 2 && (effortMinutes >= 120 || blockMinutes >= 120);
}

export function buildGuidedActions(
  tasks: TodayTask[],
  projectHealth: TodayProjectHealthSummary,
  now: Date
): TodayGuidedActions {
  const inbox = tasks.filter((task) => task.entityType !== "project" && task.state === "inbox");
  const waiting = tasks.filter((task) => task.entityType !== "project" && isWaitingFollowUp(task, now));
  const largeDeferred = tasks.filter(isLargeDeferredTask);

  const guided: TodayGuidedActions = {};

  if (inbox.length) {
    guided.processInbox = { count: inbox.length, sampleTitles: sampleTitles(inbox) };
  }
  if (waiting.length) {
    guided.followUpWaiting = { count: waiting.length, sampleTitles: sampleTitles(waiting) };
  }
  if (projectHealth.noClearNextStep.length) {
    guided.clarifyProjects = {
      count: projectHealth.noClearNextStep.length,
      sampleTitles: projectHealth.noClearNextStep.slice(0, 3).map((item) => item.project.title),
    };
  }
  if (projectHealth.lowMomentum.length) {
    guided.reviveProjects = {
      count: projectHealth.lowMomentum.length,
      sampleTitles: projectHealth.lowMomentum.slice(0, 3).map((item) => item.project.title),
    };
  }
  if (projectHealth.blockedByWaiting.length) {
    guided.unblockProjects = {
      count: projectHealth.blockedByWaiting.length,
      sampleTitles: projectHealth.blockedByWaiting.slice(0, 3).map((item) => item.project.title),
    };
  }
  if (largeDeferred.length) {
    guided.breakLargeTasks = { count: largeDeferred.length, sampleTitles: sampleTitles(largeDeferred) };
  }

  return guided;
}
