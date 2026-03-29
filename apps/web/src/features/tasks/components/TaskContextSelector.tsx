import type { ExecutionContextOption } from "@tm/shared";
import { CONTEXT_OPTIONS } from "../contextOptions";

export function TaskContextSelector({
  selected,
  onToggle,
}: {
  selected: ExecutionContextOption[];
  onToggle: (value: ExecutionContextOption) => void;
}) {
  return (
    <div>
      <div className="help" style={{ marginBottom: 6 }}>Execution context</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {CONTEXT_OPTIONS.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => onToggle(option.value)}
              style={{
                borderColor: active ? "#2563eb" : undefined,
                background: active ? "#eff6ff" : undefined,
                color: active ? "#1d4ed8" : undefined,
              }}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
