import type { ExecutionStateSummary } from "@tm/shared";

const toneMap: Record<ExecutionStateSummary["level"], { border: string; dot: string; bg: string }> = {
  calm: { border: "#d1fae5", dot: "#059669", bg: "#f0fdf4" },
  balanced: { border: "#bfdbfe", dot: "#2563eb", bg: "#eff6ff" },
  building: { border: "#fde68a", dot: "#d97706", bg: "#fffbeb" },
  stressed: { border: "#fdba74", dot: "#ea580c", bg: "#fff7ed" },
  critical: { border: "#fecaca", dot: "#dc2626", bg: "#fef2f2" },
};

export default function ExecutionStateBadge({ state }: { state: ExecutionStateSummary }) {
  const tone = toneMap[state.level];
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
      title={`Ready ${state.metrics.readyCount} • Remaining ${Math.round(state.metrics.remainingMinutes / 60)}h`}
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
      <strong style={{ textTransform: "capitalize" }}>{state.level}</strong>
      <span style={{ opacity: 0.78 }}>{state.summary}</span>
    </div>
  );
}
