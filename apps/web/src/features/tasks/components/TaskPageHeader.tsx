
export function TaskPageHeader<T extends string>({
  title,
  subtitle,
  view,
  viewDefs,
  viewCounts,
  focusLabel,
  onClearFocus,
  onSelectView,
  onRefresh,
  refreshDisabled,
}: {
  title: string;
  subtitle?: string;
  view: T;
  viewDefs: Array<{ key: T; label: string }>;
  viewCounts: Record<T, number>;
  focusLabel?: string | null;
  onClearFocus?: (() => void) | undefined;
  onSelectView: (view: T) => void;
  onRefresh: () => void;
  refreshDisabled?: boolean;
}) {
  return (
    <>
      <div className="row space-between" style={{ alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{title}</div>
          {subtitle ? <div className="help" style={{ marginTop: 4 }}>{subtitle}</div> : null}
          {focusLabel ? (
            <div className="row" style={{ gap: 8, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span className="pill">Focused: {focusLabel}</span>
              {onClearFocus ? (
                <button type="button" className="btn btn-secondary btn-compact" onClick={onClearFocus}>
                  Clear focus
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        <button type="button" className="btn btn-secondary" onClick={onRefresh} disabled={refreshDisabled}>
          Refresh
        </button>
      </div>

      <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        {viewDefs.map((def) => {
          const active = def.key === view;
          const count = viewCounts[def.key] ?? 0;
          return (
            <button
              key={def.key}
              type="button"
              className={active ? "btn" : "btn btn-secondary"}
              onClick={() => onSelectView(def.key)}
              aria-pressed={active}
            >
              {def.label} <span style={{ opacity: 0.75 }}>({count})</span>
            </button>
          );
        })}
      </div>
    </>
  );
}
