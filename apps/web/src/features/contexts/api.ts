
import type { CognitoTokens } from "../../auth/tokenStore";
import type {
  CreateExecutionContextRequest,
  CreateExecutionContextResponse,
  ListExecutionContextsResponse,
  UpdateExecutionContextRequest,
  UpdateExecutionContextResponse,
} from "@tm/shared";
import { apiFetchJson } from "../../api/http";

export async function listExecutionContexts(tokens: CognitoTokens, signal?: AbortSignal): Promise<ListExecutionContextsResponse> {
  return apiFetchJson<ListExecutionContextsResponse>({ tokens, path: "/contexts", signal });
}

export async function createExecutionContext(tokens: CognitoTokens, body: CreateExecutionContextRequest): Promise<CreateExecutionContextResponse> {
  return apiFetchJson<CreateExecutionContextResponse>({ tokens, method: "POST", path: "/contexts", body });
}

export async function updateExecutionContext(tokens: CognitoTokens, contextId: string, body: UpdateExecutionContextRequest): Promise<UpdateExecutionContextResponse> {
  return apiFetchJson<UpdateExecutionContextResponse>({ tokens, method: "PATCH", path: `/contexts/${contextId}`, body });
}
