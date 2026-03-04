// src/auth/tokenStore.ts
export type CognitoTokens = {
  id_token: string;
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number; // seconds
  obtained_at: number; // epoch ms
};

const KEY = "mstaskmgr_tokens_v1";

export function saveTokens(tokens: CognitoTokens) {
  sessionStorage.setItem(KEY, JSON.stringify(tokens));
}

export function loadTokens(): CognitoTokens | null {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CognitoTokens;
  } catch {
    return null;
  }
}

export function clearTokens() {
  sessionStorage.removeItem(KEY);
}

export function isExpired(tokens: CognitoTokens, skewSeconds = 30): boolean {
  const expiresAt = tokens.obtained_at + (tokens.expires_in - skewSeconds) * 1000;
  return Date.now() >= expiresAt;
}