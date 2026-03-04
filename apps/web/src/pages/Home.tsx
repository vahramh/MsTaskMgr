import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { isExpired } from "../auth/tokenStore";
import { startLogin } from "../auth/cognitoHostedUi";
import { clearTokens } from "../auth/tokenStore";
import { getHealth, getMe, type MeResponse } from "../api/client";

function mustGetEnv(name: string): string {
  const v = import.meta.env[name];
  if (!v || typeof v !== "string") throw new Error(`Missing env ${name}`);
  return v;
}

export default function Home() {
  const navigate = useNavigate();
  const { tokens, isAuthenticated, logout, setTokens } = useAuth();

  const apiBase = useMemo(() => mustGetEnv("VITE_API_BASE"), []);
  const cognitoDomain = useMemo(() => mustGetEnv("VITE_COGNITO_DOMAIN"), []);

  const [health, setHealth] = useState<any>(null);
  const [me, setMe] = useState<MeResponse | null>(null);
  const [status, setStatus] = useState<string>("");

  const expired = tokens ? isExpired(tokens) : false;

  // If we have expired tokens, clear local state and force fresh login
  useEffect(() => {
    if (tokens && expired) {
      clearTokens();
      setTokens(null);
      setMe(null);
      setStatus("Session expired. Please sign in again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expired]);

  async function onLogin() {
    setStatus("Redirecting to Cognito Hosted UI...");
    await startLogin();
  }

  async function onLogout() {
    setStatus("Signing out...");
    // AuthContext.logout clears local tokens then redirects to Cognito logout
    logout();
  }

  async function loadHealth() {
    setStatus("Calling /health...");
    setHealth(null);
    try {
      const data = await getHealth();
      setHealth(data);
      setStatus("OK");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    }
  }

  async function loadMe() {
    setStatus("Calling /me...");
    setMe(null);

    if (!tokens) {
      setStatus("Not signed in.");
      return;
    }

    try {
      const data = await getMe(tokens);
      setMe(data);
      setStatus("OK");
    } catch (e: any) {
      setStatus(e?.message ?? String(e));
    }
  }

  function goToApp() {
    navigate("/app");
  }

  return (
    <div style={{ padding: 24, fontFamily: "system-ui", maxWidth: 860 }}>
      <h1>MsTaskMgr</h1>

      <div style={{ marginBottom: 12 }}>
        <div>
          API: <code>{apiBase}</code>
        </div>
        <div>
          Cognito Domain: <code>{cognitoDomain}</code>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
        <button onClick={loadHealth} style={{ padding: 10 }}>
          Call /health (public)
        </button>

        {!isAuthenticated ? (
          <button onClick={onLogin} style={{ padding: 10 }}>
            Sign in (Hosted UI + PKCE)
          </button>
        ) : (
          <>
            <button onClick={onLogout} style={{ padding: 10 }}>
              Sign out
            </button>

            <button onClick={loadMe} style={{ padding: 10 }}>
              Call /me (protected)
            </button>

            <button onClick={goToApp} style={{ padding: 10 }}>
              Go to /app (protected route)
            </button>
          </>
        )}
      </div>

      {isAuthenticated && (
        <div style={{ marginBottom: 16 }}>
          <div>
            Auth: <strong>signed in</strong>
            {expired ? (
              <span style={{ color: "crimson" }}> (expired)</span>
            ) : (
              <span style={{ color: "green" }}> (active)</span>
            )}
          </div>
        </div>
      )}

      <section style={{ marginTop: 10 }}>
        <h3>/health</h3>
        <pre style={{ background: "#f6f6f6", padding: 12, overflowX: "auto" }}>
          {health ? JSON.stringify(health, null, 2) : "(not loaded)"}
        </pre>
      </section>

      <section style={{ marginTop: 10 }}>
        <h3>/me</h3>
        <pre style={{ background: "#f6f6f6", padding: 12, overflowX: "auto" }}>
          {me ? JSON.stringify(me, null, 2) : "(not loaded)"}
        </pre>
      </section>

      <p style={{ marginTop: 16, color: "#666" }}>{status}</p>
    </div>
  );
}