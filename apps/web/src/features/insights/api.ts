import type { InsightsResponse } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { apiFetchJson } from "../../api/http";

export async function getInsights(tokens: CognitoTokens, includeShared: boolean, signal?: AbortSignal): Promise<InsightsResponse> {
  return apiFetchJson<InsightsResponse>({
    tokens,
    path: "/insights",
    query: { includeShared: includeShared ? "true" : undefined },
    signal,
  });
}
