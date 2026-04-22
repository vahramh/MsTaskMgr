
import type { ExecutionContext } from "@tm/shared";

export function TaskContextSelector({
  contexts,
  selected,
  onToggle,
}: {
  contexts: ExecutionContext[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div>
      <div className="help" style={{ marginBottom: 6 }}>Execution context</div>
      {contexts.length === 0 ? <div className="help">No contexts defined yet. Create them from the Contexts page.</div> : null}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {contexts.filter((option) => !option.archived).map((option) => {
          const active = selected.includes(option.contextId);
          return (
            <button
              key={option.contextId}
              type="button"
              className="btn btn-secondary btn-compact"
              onClick={() => onToggle(option.contextId)}
              style={{
                borderColor: active ? "#2563eb" : undefined,
                background: active ? "#eff6ff" : undefined,
                color: active ? "#1d4ed8" : undefined,
              }}
              title={option.kind}
            >
              {option.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
