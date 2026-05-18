import React, { useEffect, useRef, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { ensureValidTokens } from "./ensureValidToken";
import type { CognitoTokens } from "./tokenStore";

type AuthCheckState = "checking" | "authenticated" | "unauthenticated";

function sameTokens(a: CognitoTokens | null, b: CognitoTokens | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id_token === b.id_token && a.access_token === b.access_token && a.refresh_token === b.refresh_token;
}

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { tokens, setTokens } = useAuth();
  const tokensRef = useRef<CognitoTokens | null>(tokens);
  const location = useLocation();
  const [authState, setAuthState] = useState<AuthCheckState>("checking");

  useEffect(() => {
    tokensRef.current = tokens;
  }, [tokens]);

  useEffect(() => {
    let cancelled = false;

    async function checkAuth() {
      setAuthState("checking");

      try {
        const validTokens = await ensureValidTokens();
        if (cancelled) return;

        if (validTokens) {
          if (!sameTokens(tokensRef.current, validTokens)) {
            setTokens(validTokens);
          }
          setAuthState("authenticated");
          return;
        }

        if (tokensRef.current !== null) {
          setTokens(null);
        }
        setAuthState("unauthenticated");
      } catch {
        if (cancelled) return;
        if (tokensRef.current !== null) {
          setTokens(null);
        }
        setAuthState("unauthenticated");
      }
    }

    void checkAuth();

    return () => {
      cancelled = true;
    };
  }, [location.pathname, location.search, setTokens]);

  if (authState === "checking") {
    return <div className="auth-loading">Checking session…</div>;
  }

  if (authState === "unauthenticated") {
    return <Navigate to="/signin" replace state={{ from: location.pathname + location.search }} />;
  }

  return <>{children}</>;
}
