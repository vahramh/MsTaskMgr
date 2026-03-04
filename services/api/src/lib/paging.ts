export type NextToken = string;

type TokenEnvelope = {
  v: 1;
  sub: string;
  key: unknown;
};

const MAX_TOKEN_LEN = 2048;

export function encodeNextToken(sub: string, key: unknown): string {
  const env: TokenEnvelope = { v: 1, sub, key };
  const json = JSON.stringify(env);
  return Buffer.from(json, "utf8").toString("base64url");
}

/**
 * Defensive decode:
 * - bounded size
 * - guards shape/version
 * - binds token to a specific user sub
 */
export function decodeNextToken(sub: string, token: string): unknown | null {
  if (!token || token.length > MAX_TOKEN_LEN) return null;
  try {
    const json = Buffer.from(token, "base64url").toString("utf8");
    const env = JSON.parse(json) as Partial<TokenEnvelope>;
    if (env?.v !== 1) return null;
    if (typeof env?.sub !== "string" || env.sub !== sub) return null;
    if (env.key === undefined || env.key === null) return null;
    return env.key;
  } catch {
    return null;
  }
}
