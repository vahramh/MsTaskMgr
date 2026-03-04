// src/auth/AuthContext.tsx
import React, { createContext, useContext, useMemo, useState } from "react";
import type { CognitoTokens } from "./tokenStore";
import { clearTokens, loadTokens } from "./tokenStore";
import { startLogin, logout as hostedLogout } from "./cognitoHostedUi";

type AuthContextValue = {
  tokens: CognitoTokens | null;
  isAuthenticated: boolean;
  login: () => Promise<void>;
  logout: () => void;
  setTokens: (t: CognitoTokens | null) => void;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokensState] = useState<CognitoTokens | null>(() => loadTokens());

  const value = useMemo<AuthContextValue>(() => {
    return {
      tokens,
      isAuthenticated: !!tokens?.id_token,
      login: async () => startLogin(),
      logout: () => {
        clearTokens();
        setTokensState(null);
        hostedLogout();
      },
      setTokens: (t) => {
        if (!t) {
          clearTokens();
          setTokensState(null);
        } else {
          setTokensState(t);
        }
      },
    };
  }, [tokens]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}