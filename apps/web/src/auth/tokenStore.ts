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

function canUseStorage(storage: Storage): boolean {
  try {
    const testKey = `${KEY}_storage_test`;
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

function preferredStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  if (canUseStorage(window.localStorage)) return window.localStorage;
  if (canUseStorage(window.sessionStorage)) return window.sessionStorage;
  return null;
}

export function saveTokens(tokens: CognitoTokens) {
  const storage = preferredStorage();
  if (!storage) return;

  storage.setItem(KEY, JSON.stringify(tokens));

  // Remove the old session-only copy after migrating to persistent storage.
  if (storage !== window.sessionStorage) {
    window.sessionStorage.removeItem(KEY);
  }
}

export function loadTokens(): CognitoTokens | null {
  if (typeof window === "undefined") return null;

  const raw = window.localStorage.getItem(KEY) ?? window.sessionStorage.getItem(KEY);
  if (!raw) return null;

  try {
    const tokens = JSON.parse(raw) as CognitoTokens;

    // If this came from the older sessionStorage-only implementation, persist it
    // so installed mobile/PWA capture remains signed in after reopening.
    if (!window.localStorage.getItem(KEY) && canUseStorage(window.localStorage)) {
      window.localStorage.setItem(KEY, JSON.stringify(tokens));
      window.sessionStorage.removeItem(KEY);
    }

    return tokens;
  } catch {
    clearTokens();
    return null;
  }
}

export function clearTokens() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.sessionStorage.removeItem(KEY);
}

export function isExpired(tokens: CognitoTokens, skewSeconds = 30): boolean {
  const expiresAt = tokens.obtained_at + (tokens.expires_in - skewSeconds) * 1000;
  return Date.now() >= expiresAt;
}
