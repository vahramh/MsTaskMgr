import React from "react";

export function ProjectWorkspace<T extends string>({
  focusId,
  focusView,
  focusCounts,
  focusViewDefs,
  onSelectFocusView,
  onRefresh,
  refreshDisabled,
  projectSummary,
  children,
}: {
  focusId: string;
  focusView: T;
  focusCounts: Record<T, number>;
  focusViewDefs: Array<{ key: T; label: string }>;
  onSelectFocusView: (view: T) => void;
  onRefresh: () => void;
  refreshDisabled?: boolean;
  projectSummary?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div className="card" style={{ padding: 14 }}>
        <div className="row space-between" style={{ alignItems: "flex-start", gap: 12 }}>
          <div>
            <div style={{ fontWeight: 800 }}>Project workspace</div>
            <div className="help" style={{ marginTop: 4 }}>Focused root: {focusId}</div>
          </div>
          <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={refreshDisabled}>
            Refresh subtree
          </button>
        </div>

        {projectSummary ? <div style={{ marginTop: 12 }}>{projectSummary}</div> : null}

        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 12 }}>
          {focusViewDefs.map((def) => {
            const active = def.key === focusView;
            return (
              <button
                key={def.key}
                type="button"
                className={active ? "btn" : "btn btn-secondary"}
                onClick={() => onSelectFocusView(def.key)}
              >
                {def.label} <span style={{ opacity: 0.75 }}>({focusCounts[def.key] ?? 0})</span>
              </button>
            );
          })}
        </div>
      </div>

      {children}
    </div>
  );
}
