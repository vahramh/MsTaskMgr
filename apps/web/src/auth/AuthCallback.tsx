import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { handleCallback } from "./cognitoHostedUi";
import { useAuth } from "./AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setTokens } = useAuth();

  const startedRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Signing you in…");

  useEffect(() => {
    // React 18 StrictMode runs effects twice in dev. Guard to run only once.
    if (startedRef.current) return;
    startedRef.current = true;

    (async () => {
      try {
        const url = new URL(window.location.href);

        const oauthError = url.searchParams.get("error");
        const oauthErrorDesc = url.searchParams.get("error_description");

        if (oauthError || oauthErrorDesc) {
          // Keep query for debugging? Up to you. I prefer cleaning it.
          window.history.replaceState({}, document.title, url.pathname);
          throw new Error(
            `OAuth error: ${oauthError ?? "(none)"}${oauthErrorDesc ? ` — ${oauthErrorDesc}` : ""}`
          );
        }

        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");

        // If we don't have code/state, don't fail hard immediately.
        // This can happen if the URL was already cleaned or StrictMode re-ran.
        if (!code || !state) {
          // If tokens are already present, just go home.
          setStatus("Finishing sign-in…");
          navigate("/", { replace: true });
          return;
        }

        setStatus("Exchanging code for tokens…");
        const tokens = await handleCallback(code, state);
        setTokens(tokens);

        // Clean URL after successful exchange
        window.history.replaceState({}, document.title, url.pathname);

        navigate("/", { replace: true });
      } catch (e: any) {
        setError(e?.message ?? String(e));
      }
    })();
  }, [navigate, setTokens]);

  if (error) {
    return (
      <div style={{ padding: 16 }}>
        <h2>Login failed</h2>
        <pre style={{ whiteSpace: "pre-wrap" }}>{error}</pre>
      </div>
    );
  }

  return <div style={{ padding: 16 }}>{status}</div>;
}