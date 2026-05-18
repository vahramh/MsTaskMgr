// src/auth/AuthContext.tsx
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { CognitoTokens } from "./tokenStore";
import { clearTokens, loadTokens, saveTokens } from "./tokenStore";
import { startLogin, logout as hostedLogout } from "./cognitoHostedUi";

type AuthContextValue = {
  tokens: CognitoTokens | null;
  isAuthenticated: boolean;
  login: (options?: { returnTo?: string }) => Promise<void>;
  logout: () => void;
  setTokens: (t: CognitoTokens | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function sameTokens(a: CognitoTokens | null, b: CognitoTokens | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.id_token === b.id_token &&
    a.access_token === b.access_token &&
    a.refresh_token === b.refresh_token &&
    a.expires_in === b.expires_in &&
    a.obtained_at === b.obtained_at
  );
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokensState] = useState<CognitoTokens | null>(() => loadTokens());

  const login = useCallback(async (options?: { returnTo?: string }) => startLogin(options), []);

  const logout = useCallback(() => {
    clearTokens();
    setTokensState(null);
    hostedLogout();
  }, []);

  const setTokens = useCallback((t: CognitoTokens | null) => {
    if (!t) {
      clearTokens();
      setTokensState((current) => (current === null ? current : null));
      return;
    }

    saveTokens(t);
    setTokensState((current) => (sameTokens(current, t) ? current : t));
  }, []);

  const value = useMemo<AuthContextValue>(() => {
    return {
      tokens,
      isAuthenticated: !!tokens?.id_token,
      login,
      logout,
      setTokens,
    };
  }, [login, logout, setTokens, tokens]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
