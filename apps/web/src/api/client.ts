import type { CognitoTokens } from "../auth/tokenStore";
import { apiFetchJson } from "./http";

export type MeResponse = {
  ok: boolean;
  sub: string | null;
  email: string | null;
  claims: Record<string, unknown>;
};

export async function getMe(tokens: CognitoTokens): Promise<MeResponse> {
  return apiFetchJson<MeResponse>({ tokens, path: "/me" });
}

export async function getHealth(): Promise<any> {
  return apiFetchJson<any>({ path: "/health" });
}
