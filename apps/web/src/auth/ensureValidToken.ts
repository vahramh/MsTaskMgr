import { loadTokens, saveTokens, isExpired, type CognitoTokens } from "./tokenStore";
import { refreshTokens } from "./cognitoHostedUi";

let refreshing: Promise<CognitoTokens> | null = null;

export async function ensureValidTokens(): Promise<CognitoTokens | null> {
  const tokens = loadTokens();
  if (!tokens) return null;

  if (!isExpired(tokens, 60)) {
    return tokens;
  }

  if (!tokens.refresh_token) {
    return null;
  }

  if (!refreshing) {
    refreshing = refreshTokens(tokens.refresh_token).finally(() => {
      refreshing = null;
    });
  }

  const newTokens = await refreshing;

  saveTokens(newTokens);

  return newTokens;
}