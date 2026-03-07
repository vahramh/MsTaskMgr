import type { ReviewResponse } from "@tm/shared";
import type { CognitoTokens } from "../../auth/tokenStore";
import { apiFetchJson } from "../../api/http";

export async function getReview(tokens: CognitoTokens, includeShared: boolean, signal?: AbortSignal): Promise<ReviewResponse> {
  return apiFetchJson<ReviewResponse>({
    tokens,
    path: "/review",
    query: { includeShared: includeShared ? "true" : undefined },
    signal,
  });
}
