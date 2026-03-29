import type { ExecutionStateSummary, TodayExecutionMetrics } from "@tm/shared";

type Props = {
  state?: ExecutionStateSummary;
  metrics?: TodayExecutionMetrics;
};

type DerivedStateLevel = ExecutionStateSummary["level"];

const toneMap: Record<DerivedStateLevel, { border: string; dot: string; bg: string }> = {
  calm: { border: "#d1fae5", dot: "#059669", bg: "#f0fdf4" },
  balanced: { border: "#bfdbfe", dot: "#2563eb", bg: "#eff6ff" },
  building: { border: "#fde68a", dot: "#d97706", bg: "#fffbeb" },
  stressed: { border: "#fdba74", dot: "#ea580c", bg: "#fff7ed" },
  critical: { border: "#fecaca", dot: "#dc2626", bg: "#fef2f2" },
};

function deriveStateFromMetrics(metrics: TodayExecutionMetrics): ExecutionStateSummary {
  const readyCount = metrics.readyTasks;
  const overdueCount = metrics.overdueTasks;
  const dueSoonCount = metrics.dueSoonTasks;
  const blockedCount = metrics.blockedTasks;
  const staleCount = metrics.staleTasks;
  const remainingMinutes = metrics.totalEffortMinutes;

  let level: DerivedStateLevel = "calm";
  if (overdueCount >= 5 || (overdueCount >= 3 && blockedCount >= 3) || readyCount === 0) {
    level = "critical";
  } else if (overdueCount >= 2 || dueSoonCount >= 5 || blockedCount >= 5 || remainingMinutes > 20 * 60) {
    level = "stressed";
  } else if (dueSoonCount >= 3 || blockedCount >= 3 || staleCount >= 5 || remainingMinutes > 12 * 60) {
    level = "building";
  } else if (readyCount >= 2) {
    level = "balanced";
  }

  const parts: string[] = [];
  if (overdueCount > 0) parts.push(`${overdueCount} overdue`);
  if (dueSoonCount > 0) parts.push(`${dueSoonCount} due soon`);
  if (blockedCount > 0) parts.push(`${blockedCount} blocked`);
  if (staleCount > 0) parts.push(`${staleCount} stale`);
  if (remainingMinutes > 10 * 60) parts.push(`${Math.round(remainingMinutes / 60)}h backlog`);

  return {
    level,
    summary: parts.length ? parts.join(" · ") : "Clean execution surface",
    metrics: {
      actionableCount: readyCount + blockedCount,
      overdueCount,
      dueSoonCount,
      blockedCount,
      staleCount,
      readyCount,
      remainingMinutes,
    },
  };
}

export default function ExecutionStateBadge({ state, metrics }: Props) {
  const resolved = state ?? (metrics ? deriveStateFromMetrics(metrics) : null);
  if (!resolved) return null;
  const tone = toneMap[resolved.level];
  return (
    <div
      style={{
        border: `1px solid ${tone.border}`,
        borderRadius: 999,
        padding: "8px 12px",
        fontSize: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: tone.bg,
      }}
      title={`Ready ${resolved.metrics.readyCount} • Remaining ${Math.round(resolved.metrics.remainingMinutes / 60)}h`}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: tone.dot,
          flex: "0 0 auto",
        }}
      />
      <strong style={{ textTransform: "capitalize" }}>{resolved.level}</strong>
      <span style={{ opacity: 0.78 }}>{resolved.summary}</span>
    </div>
  );
}
