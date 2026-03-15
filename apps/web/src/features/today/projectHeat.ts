import type { TodayProjectHealthProject, TodayProjectHealthSummary } from "@tm/shared";

export type ProjectHeatTone = "atRisk" | "blocked" | "cool" | "warm" | "hot";

export type ProjectHeatItem = {
  projectId: string;
  title: string;
  tone: ProjectHeatTone;
  label: string;
  hint?: string;
  severity: number;
  item: TodayProjectHealthProject;
};

const TONE_RANK: Record<ProjectHeatTone, number> = {
  atRisk: 5,
  blocked: 4,
  cool: 3,
  warm: 2,
  hot: 1,
};

function toneRank(tone: ProjectHeatTone): number {
  return TONE_RANK[tone] ?? 0;
}

function pickBetter(a: ProjectHeatItem, b: ProjectHeatItem): ProjectHeatItem {
  const aRank = toneRank(a.tone);
  const bRank = toneRank(b.tone);

  if (aRank !== bRank) return aRank > bRank ? a : b;
  if (a.severity !== b.severity) return a.severity > b.severity ? a : b;
  return a.title.localeCompare(b.title) <= 0 ? a : b;
}

function push(
  map: Map<string, ProjectHeatItem>,
  project: TodayProjectHealthProject,
  tone: ProjectHeatTone,
  label: string,
  hint: string | undefined,
  severityBase: number
) {
  const projectId = project.project.taskId;
  if (!projectId) return;

  const candidate: ProjectHeatItem = {
    projectId,
    title: project.project.title,
    tone,
    label,
    hint,
    severity: severityBase + (project.severity ?? 0),
    item: project,
  };

  const existing = map.get(projectId);
  map.set(projectId, existing ? pickBetter(existing, candidate) : candidate);
}

export function buildProjectHeat(summary: TodayProjectHealthSummary, maxItems = 8): ProjectHeatItem[] {
  const map = new Map<string, ProjectHeatItem>();

  for (const item of summary.deadlinePressure ?? []) {
    push(map, item, "atRisk", "At Risk", "due soon", 100);
  }

  for (const item of summary.noClearNextStep ?? []) {
    push(map, item, "atRisk", "No Next", "clarify next step", 90);
  }

  for (const item of summary.blockedByWaiting ?? []) {
    push(map, item, "blocked", "Blocked", "waiting", 80);
  }

  for (const item of summary.lowMomentum ?? []) {
    push(map, item, "cool", "Cool", "low momentum", 70);
  }

  const items = Array.from(map.values()).sort((a, b) => {
    const toneDelta = toneRank(b.tone) - toneRank(a.tone);
    if (toneDelta !== 0) return toneDelta;

    const severityDelta = b.severity - a.severity;
    if (severityDelta !== 0) return severityDelta;

    return a.title.localeCompare(b.title);
  });

  const primary = items.filter((item) => item.tone === "atRisk" || item.tone === "blocked" || item.tone === "cool");
  const secondary = items.filter((item) => item.tone === "warm" || item.tone === "hot");

  const merged = primary.length >= 4 ? primary : [...primary, ...secondary];

  return merged.slice(0, maxItems);
}