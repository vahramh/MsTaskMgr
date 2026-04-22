
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

  const activeItems = useMemo(() => items.filter((item) => !item.archived), [items]);
  const archivedItems = useMemo(() => items.filter((item) => item.archived), [items]);

  return (
    <div className="stack">
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(240px, 1fr) 180px auto", gap: 10 }}>
          <input className="input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Home, Client A, Phone, Deep Focus" />
          <select className="input" value={newKind} onChange={(e) => setNewKind(e.target.value as ExecutionContextKind)}>
            {KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
          </select>
          <button
            type="button"
            className="btn"
            disabled={saving || !newName.trim()}
            onClick={() => {
              void create(newName.trim(), newKind);
              setNewName("");
            }}
          >
            {saving ? "Saving…" : "Create"}
          </button>
        </div>
      </div>

      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>Active contexts</div>
        {loading ? <div className="help">Loading…</div> : null}
        {!loading && activeItems.length === 0 ? <div className="help">No contexts yet.</div> : null}
        <div style={{ display: "grid", gap: 10 }}>
          {activeItems.map((item) => (
            <div key={item.contextId} style={{ display: "grid", gridTemplateColumns: "minmax(220px, 1fr) 180px auto", gap: 10 }}>
              <input className="input" defaultValue={item.name} onBlur={(e) => e.target.value.trim() !== item.name && void update(item.contextId, { name: e.target.value })} />
              <select className="input" value={item.kind} onChange={(e) => void update(item.contextId, { kind: e.target.value as ExecutionContextKind })}>
                {KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
              </select>
              <button type="button" className="btn btn-secondary" onClick={() => void update(item.contextId, { archived: true })}>Archive</button>
            </div>
          ))}
        </div>
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
