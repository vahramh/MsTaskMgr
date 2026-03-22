import { useMemo } from "react";

type ExecutionState =
  | "calm"
  | "balanced"
  | "building"
  | "stressed"
  | "critical";

type Props = {
  metrics: {
    readyTasks: number;
    overdueTasks: number;
    dueSoonTasks: number;
    blockedTasks: number;
    staleTasks: number;
    totalEffortMinutes: number;
  };
};

function computeExecutionState(input: {
  readyTasks: number;
  overdueTasks: number;
  dueSoonTasks: number;
  blockedTasks: number;
  staleTasks: number;
  backlogHours: number;
}): ExecutionState {
  const {
    readyTasks,
    overdueTasks,
    dueSoonTasks,
    blockedTasks,
    staleTasks,
    backlogHours,
  } = input;

  if (
    overdueTasks >= 5 ||
    (overdueTasks >= 3 && blockedTasks >= 3) ||
    readyTasks === 0
  ) return "critical";

  if (
    overdueTasks >= 2 ||
    dueSoonTasks >= 5 ||
    blockedTasks >= 5 ||
    backlogHours > 20
  ) return "stressed";

  if (
    dueSoonTasks >= 3 ||
    blockedTasks >= 3 ||
    staleTasks >= 5 ||
    backlogHours > 12
  ) return "building";

  if (readyTasks >= 2) return "balanced";

  return "calm";
}

function describeExecutionState(input: any): string {
  const parts: string[] = [];

  if (input.overdueTasks > 0)
    parts.push(`${input.overdueTasks} overdue`);
  if (input.dueSoonTasks > 0)
    parts.push(`${input.dueSoonTasks} due soon`);
  if (input.blockedTasks > 0)
    parts.push(`${input.blockedTasks} blocked`);
  if (input.staleTasks > 0)
    parts.push(`${input.staleTasks} stale`);

  const backlogHours = input.totalEffortMinutes / 60;
  if (backlogHours > 10)
    parts.push(`${Math.round(backlogHours)}h backlog`);

  return parts.length ? parts.join(" • ") : "Clean execution surface";
}

const colorMap: Record<ExecutionState, string> = {
  calm: "#4caf50",
  balanced: "#2196f3",
  building: "#ff9800",
  stressed: "#f44336",
  critical: "#b71c1c",
};

export default function ExecutionStateBadge({ metrics }: Props) {
  const state = useMemo(() => {
    return computeExecutionState({
      ...metrics,
      backlogHours: metrics.totalEffortMinutes / 60,
    });
  }, [metrics]);

  const description = useMemo(
    () => describeExecutionState(metrics),
    [metrics]
  );

  return (
    <div
      style={{
        border: `1px solid ${colorMap[state]}`,
        borderRadius: 999,
        padding: "6px 12px",
        fontSize: 12,
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        background: "#fff",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: colorMap[state],
        }}
      />
      <strong style={{ textTransform: "capitalize" }}>
        {state}
      </strong>
      <span style={{ opacity: 0.7 }}>
        {description}
      </span>
    </div>
  );
}