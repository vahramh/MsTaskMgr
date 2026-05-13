import { useMemo, useState } from "react";
import type { ExecutionContextKind } from "@tm/shared";
import { useAuth } from "../../auth/AuthContext";
import InlineAlert from "../../components/InlineAlert";
import { useExecutionContexts } from "./useExecutionContexts";

const KINDS: ExecutionContextKind[] = ["place", "person", "tool", "mode", "energy"];

export default function ExecutionContextsPage() {
  const { tokens } = useAuth();
  const { items, loading, saving, error, setError, create, update } = useExecutionContexts(tokens);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<ExecutionContextKind>("place");
  const [newWeekdayMinutes, setNewWeekdayMinutes] = useState("60");
  const [newWeekendMinutes, setNewWeekendMinutes] = useState("0");

  const activeItems = useMemo(() => items.filter((item) => !item.archived), [items]);
  const archivedItems = useMemo(() => items.filter((item) => item.archived), [items]);

  return (
    <div className="stack">
      <style>{`
        .contexts-create-grid {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) 180px 140px 140px auto;
          gap: 10px;
        }

        .contexts-table {
          display: grid;
          gap: 8px;
        }

        .contexts-row,
        .contexts-header {
          display: grid;
          grid-template-columns: minmax(240px, 1fr) 160px 130px 130px 76px 96px;
          gap: 10px;
          align-items: center;
        }

        .contexts-header {
          padding: 0 2px;
        }

        .contexts-minutes-cell,
        .contexts-email-cell,
        .contexts-archive-cell {
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .contexts-field-label {
          display: none;
        }

        .contexts-archive-cell .btn {
          width: 100%;
        }

        @media (max-width: 760px) {
          .contexts-create-grid {
            grid-template-columns: 1fr;
          }

          .contexts-header {
            display: none;
          }

          .contexts-row {
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            padding: 12px;
            border: 1px solid var(--border, #e5e7eb);
            border-radius: 14px;
            background: var(--surface, #fff);
          }

          .contexts-name-cell,
          .contexts-kind-cell,
          .contexts-minutes-cell {
            min-width: 0;
          }

          .contexts-name-cell {
            grid-column: 1 / -1;
          }

          .contexts-field-label {
            display: block;
            font-size: 12px;
            font-weight: 700;
            color: var(--muted, #6b7280);
            margin: 0 0 5px;
          }

          .contexts-email-cell,
          .contexts-archive-cell {
            justify-content: stretch;
            align-self: end;
          }

          .contexts-email-cell label {
            width: 100%;
            min-height: 40px;
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 0;
            padding: 0 2px;
          }

          .contexts-email-cell label::before {
            content: "Email?";
            font-weight: 700;
          }
        }
      `}</style>

      <div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Execution contexts</div>
        <div className="help">Define the situations that make tasks executable. Today uses these contexts with match-any filtering.</div>
      </div>

      {error ? (
        <InlineAlert
          tone="error"
          title={error}
          actions={<button className="btn btn-secondary" type="button" onClick={() => setError(null)}>Dismiss</button>}
        />
      ) : null}

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Create context</div>
        <div className="contexts-create-grid">
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Home, Client A, Phone, Deep Focus" />
          <select className="input" value={newKind} onChange={(e) => setNewKind(e.target.value as ExecutionContextKind)}>
            {KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
          <input className="input" inputMode="numeric" value={newWeekdayMinutes} onChange={(e) => setNewWeekdayMinutes(e.target.value)} placeholder="Weekday min" />
          <input className="input" inputMode="numeric" value={newWeekendMinutes} onChange={(e) => setNewWeekendMinutes(e.target.value)} placeholder="Weekend min" />
          <button
            type="button"
            className="btn"
            disabled={saving || !newName.trim()}
            onClick={() => {
              void create(newName.trim(), newKind, Math.max(0, Math.floor(Number(newWeekdayMinutes) || 0)), Math.max(0, Math.floor(Number(newWeekendMinutes) || 0)));
              setNewName("");
            }}
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Active contexts</div>
        <div className="help" style={{ marginBottom: 10 }}>Tick Email? for contexts that should be included in scheduled recommendation emails. Weekday/weekend minutes define the daily planning budget; email plans use 80% of that time.</div>
        {loading ? <div className="help">Loading…</div> : null}
        {!loading && activeItems.length === 0 ? <div className="help">No contexts yet.</div> : null}
        {activeItems.length > 0 ? (
          <div className="contexts-table">
            <div className="help contexts-header">
              <span>Name</span>
              <span>Kind</span>
              <span style={{ textAlign: "center" }}>Weekday min</span>
              <span style={{ textAlign: "center" }}>Weekend min</span>
              <span style={{ textAlign: "center" }}>Email?</span>
              <span style={{ textAlign: "center" }}>Archive</span>
            </div>
            {activeItems.map((item) => (
              <div key={item.contextId} className="contexts-row">
                <div className="contexts-name-cell">
                  <span className="contexts-field-label">Name</span>
                  <input className="input" defaultValue={item.name} onBlur={(e) => e.target.value.trim() !== item.name && void update(item.contextId, { name: e.target.value })} />
                </div>
                <div className="contexts-kind-cell">
                  <span className="contexts-field-label">Kind</span>
                  <select className="input" value={item.kind} onChange={(e) => void update(item.contextId, { kind: e.target.value as ExecutionContextKind })}>
                    {KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                </div>
                <div className="contexts-minutes-cell">
                  <span className="contexts-field-label">Weekday minutes</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    defaultValue={item.weekdayMinutes ?? 0}
                    onBlur={(e) => {
                      const next = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      if (next !== (item.weekdayMinutes ?? 0)) void update(item.contextId, { weekdayMinutes: next });
                    }}
                  />
                </div>
                <div className="contexts-minutes-cell">
                  <span className="contexts-field-label">Weekend minutes</span>
                  <input
                    className="input"
                    inputMode="numeric"
                    defaultValue={item.weekendMinutes ?? 0}
                    onBlur={(e) => {
                      const next = Math.max(0, Math.floor(Number(e.target.value) || 0));
                      if (next !== (item.weekendMinutes ?? 0)) void update(item.contextId, { weekendMinutes: next });
                    }}
                  />
                </div>
                <div className="contexts-email-cell">
                  <label className="checkbox-line" title="Include this context in recommendation emails">
                    <input
                      type="checkbox"
                      checked={Boolean(item.significant)}
                      onChange={(e) => void update(item.contextId, { significant: e.target.checked })}
                    />
                  </label>
                </div>
                <div className="contexts-archive-cell">
                  <button type="button" className="btn btn-secondary" onClick={() => void update(item.contextId, { archived: true })}>Archive</button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {archivedItems.length > 0 ? (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontWeight: 700, marginBottom: 10 }}>Archived contexts</div>
          <div style={{ display: "grid", gap: 10 }}>
            {archivedItems.map((item) => (
              <div key={item.contextId} className="row space-between" style={{ gap: 10, flexWrap: "wrap" }}>
                <div>{item.name} <span className="help">· {item.kind}</span></div>
                <button type="button" className="btn btn-secondary" onClick={() => void update(item.contextId, { archived: false })}>Restore</button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
