// src/auth/pkce.ts
function base64UrlEncode(bytes: ArrayBuffer): string {
  const uint8 = new Uint8Array(bytes);
  let str = "";
  for (let i = 0; i < uint8.length; i++) str += String.fromCharCode(uint8[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function randomString(length = 64): string {
  const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let result = "";
  for (let i = 0; i < length; i++) result += charset[bytes[i] % charset.length];
  return result;
}

export async function pkceChallengeFromVerifier(verifier: string): Promise<string> {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(digest);
}