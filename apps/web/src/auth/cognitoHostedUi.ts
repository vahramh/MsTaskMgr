// src/auth/cognitoHostedUi.ts
import { pkceChallengeFromVerifier, randomString } from "./pkce";
import type { CognitoTokens } from "./tokenStore";
import { saveTokens } from "./tokenStore";

const cfg = {
  domain: import.meta.env.VITE_COGNITO_DOMAIN as string,
  clientId: import.meta.env.VITE_COGNITO_CLIENT_ID as string,
  redirectUri: import.meta.env.VITE_COGNITO_REDIRECT_URI as string,
  logoutUri: import.meta.env.VITE_COGNITO_LOGOUT_URI as string,
};

const PKCE_VERIFIER_KEY = "mstaskmgr_pkce_verifier";
const OAUTH_STATE_KEY = "mstaskmgr_oauth_state";

/**
 * Kick off Hosted UI login (Authorization Code + PKCE)
 */
export async function startLogin() {
  const verifier = randomString(64);
  const challenge = await pkceChallengeFromVerifier(verifier);
  const state = randomString(32);

  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);
  sessionStorage.setItem(OAUTH_STATE_KEY, state);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: "openid email profile",
    state,
    code_challenge_method: "S256",
    code_challenge: challenge,
  });

  const authorizeUrl = `${cfg.domain.replace(/\/+$/, "")}/oauth2/authorize?${params.toString()}`;

  window.location.assign(authorizeUrl);
}

/**
 * Handle /auth/callback?code=...&state=...
 * Exchanges code for tokens via /oauth2/token
 */
export async function handleCallback(code: string, state: string): Promise<CognitoTokens> {
  const expectedState = sessionStorage.getItem(OAUTH_STATE_KEY);
  if (!expectedState || expectedState !== state) {
    throw new Error("OAuth state mismatch.");
  }

  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) {
    throw new Error("Missing PKCE verifier (sessionStorage).");
  }

  // Clear one-time PKCE items ASAP
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);
  sessionStorage.removeItem(OAUTH_STATE_KEY);

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code,
    redirect_uri: cfg.redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(`${cfg.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as Omit<CognitoTokens, "obtained_at">;
  const tokens: CognitoTokens = { ...json, obtained_at: Date.now() };
  saveTokens(tokens);
  return tokens;
}

export async function refreshTokens(refreshToken: string): Promise<CognitoTokens> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    refresh_token: refreshToken,
  });

  const res = await fetch(`${cfg.domain}/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${text}`);
  }

  const json = (await res.json()) as Omit<CognitoTokens, "obtained_at">;

  const tokens: CognitoTokens = {
    ...json,
    refresh_token: refreshToken,
    obtained_at: Date.now(),
  };

  saveTokens(tokens);

  return tokens;
}

/**
 * Hosted UI logout (ends Cognito session + redirects back)
 */
export function logout() {
  // You can also clear your local tokens before redirect
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    logout_uri: cfg.logoutUri,
  });
  window.location.assign(`${cfg.domain}/logout?${params.toString()}`);
}