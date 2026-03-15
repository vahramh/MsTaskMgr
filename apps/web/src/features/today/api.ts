import type { TodayOverviewResponse } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { apiFetchJson } from "../../api/http";

export async function getToday(tokens: CognitoTokens, includeShared: boolean, signal?: AbortSignal): Promise<TodayOverviewResponse> {
  return apiFetchJson<TodayOverviewResponse>({
    tokens,
    path: "/today",
    query: { includeShared: includeShared ? "true" : undefined },
    signal,
  });
}
