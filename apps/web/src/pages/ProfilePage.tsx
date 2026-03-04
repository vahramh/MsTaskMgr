import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { getMe, type MeResponse } from "../api/client";

async function tryCopy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // ignore
  }
}

export default function ProfilePage() {
  const { tokens } = useAuth();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    (async () => {
      if (!tokens) return;
      setStatus("Loading profile...");
      try {
        const data = await getMe(tokens);
        setMe(data);
        setStatus("OK");
      } catch (e: any) {
        setStatus(e?.message ?? String(e));
      }
    })();
  }, [tokens]);

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 860 }}>
      <h2>Profile</h2>

      <div className="card" style={{ padding: 14, marginTop: 12 }}>
        <div style={{ fontWeight: 900, fontSize: 16 }}>Your share ID</div>
        <div className="help" style={{ marginTop: 6 }}>
          To share a task with you, the other user needs your Cognito <code>sub</code>.
        </div>

        <div className="row" style={{ gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              padding: "8px 10px",
              background: "#f9fafb",
              border: "1px solid #e5e7eb",
              borderRadius: 10,
              minWidth: 360,
              overflowX: "auto",
            }}
            title={me?.sub ?? ""}
          >
            {me?.sub ?? "(loading...)"}
          </div>
          <button className="btn btn-secondary" type="button" disabled={!me?.sub} onClick={() => void tryCopy(me!.sub!)}>
            Copy
          </button>
        </div>

        <div className="help" style={{ marginTop: 10 }}>
          Email: <b>{me?.email ?? "(unknown)"}</b>
        </div>
        <div className="help" style={{ marginTop: 6 }}>
          Note: email is not used for sharing. Sharing is keyed strictly by <code>sub</code>.
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <details>
          <summary style={{ cursor: "pointer", fontWeight: 800 }}>Raw /me response</summary>
          <pre style={{ background: "#f6f6f6", padding: 12, overflowX: "auto", marginTop: 10 }}>
            {me ? JSON.stringify(me, null, 2) : "(not loaded)"}
          </pre>
        </details>
      </div>

      <p style={{ marginTop: 16, color: "#666" }}>{status}</p>
    </div>
  );
}
