import type { CognitoTokens } from "../../auth/tokenStore";
import type {
  CreateTaskRequest,
  CreateTaskResponse,
  CreateSubtaskRequest,
  CreateSubtaskResponse,
  ListTasksResponse,
  ListBucketTasksResponse,
  BucketCountsResponse,
  ListSubtasksResponse,
  UpdateTaskRequest,
  UpdateTaskResponse,
  UpdateSubtaskRequest,
  UpdateSubtaskResponse,
  CreateShareRequest,
  CreateShareResponse,
  ListSharesResponse,
  RevokeShareResponse,
  ListSharedWithMeResponse,
} from "@tm/shared";
import { apiFetchJson, apiFetchVoid } from "../../api/http";

export async function createTask(tokens: CognitoTokens, req: CreateTaskRequest): Promise<CreateTaskResponse> {
  return apiFetchJson<CreateTaskResponse>({ tokens, method: "POST", path: "/tasks", body: req });
}

export async function listTasks(
  tokens: CognitoTokens,
  params?: { limit?: number; nextToken?: string },
  signal?: AbortSignal
): Promise<ListTasksResponse> {
  return apiFetchJson<ListTasksResponse>({
    tokens,
    path: "/tasks",
    query: { limit: params?.limit, nextToken: params?.nextToken },
    signal,
  });
}



export async function listBucketTasks(
  tokens: CognitoTokens,
  state: string,
  params?: { limit?: number; nextToken?: string },
  signal?: AbortSignal
): Promise<ListBucketTasksResponse> {
  return apiFetchJson<ListBucketTasksResponse>({
    tokens,
    path: `/task-buckets/${state}`,
    query: { limit: params?.limit, nextToken: params?.nextToken },
    signal,
  });
}

export async function getBucketCounts(tokens: CognitoTokens, signal?: AbortSignal): Promise<BucketCountsResponse> {
  return apiFetchJson<BucketCountsResponse>({
    tokens,
    path: `/task-buckets/counts`,
    signal,
  });
}
export async function updateTask(
  tokens: CognitoTokens,
  taskId: string,
  patch: UpdateTaskRequest
): Promise<UpdateTaskResponse> {
  return apiFetchJson<UpdateTaskResponse>({ tokens, method: "PATCH", path: `/tasks/${taskId}`, body: patch });
}

export async function completeTask(tokens: CognitoTokens, taskId: string, expectedRev?: number): Promise<UpdateTaskResponse> {
  // Body is optional; used for optimistic concurrency.
  const body = expectedRev === undefined ? undefined : { expectedRev };
  return apiFetchJson<UpdateTaskResponse>({ tokens, method: "POST", path: `/tasks/${taskId}/complete`, body });
}
export async function deleteTask(tokens: CognitoTokens, taskId: string): Promise<void> {
  return apiFetchVoid({ tokens, method: "DELETE", path: `/tasks/${taskId}` });
}

// ----------------------------------------------------------------------
// Phase 2: Subtasks

export async function createSubtask(
  tokens: CognitoTokens,
  parentTaskId: string,
  req: CreateSubtaskRequest
): Promise<CreateSubtaskResponse> {
  return apiFetchJson<CreateSubtaskResponse>({
    tokens,
    method: "POST",
    path: `/tasks/${parentTaskId}/subtasks`,
    body: req,
  });
}

export async function listSubtasks(
  tokens: CognitoTokens,
  parentTaskId: string,
  params?: { limit?: number; nextToken?: string },
  signal?: AbortSignal
): Promise<ListSubtasksResponse> {
  return apiFetchJson<ListSubtasksResponse>({
    tokens,
    path: `/tasks/${parentTaskId}/subtasks`,
    query: { limit: params?.limit, nextToken: params?.nextToken },
    signal,
  });
}

export async function updateSubtask(
  tokens: CognitoTokens,
  parentTaskId: string,
  subtaskId: string,
  patch: UpdateSubtaskRequest
): Promise<UpdateSubtaskResponse> {
  return apiFetchJson<UpdateSubtaskResponse>({
    tokens,
    method: "PATCH",
    path: `/tasks/${parentTaskId}/subtasks/${subtaskId}`,
    body: patch,
  });
}

export async function deleteSubtask(tokens: CognitoTokens, parentTaskId: string, subtaskId: string): Promise<void> {
  return apiFetchVoid({ tokens, method: "DELETE", path: `/tasks/${parentTaskId}/subtasks/${subtaskId}` });
}

// ----------------------------------------------------------------------
// Phase 3: Sharing

export async function createShare(
  tokens: CognitoTokens,
  rootTaskId: string,
  req: CreateShareRequest
): Promise<CreateShareResponse> {
  return apiFetchJson<CreateShareResponse>({ tokens, method: "POST", path: `/tasks/${rootTaskId}/shares`, body: req });
}

export async function listShares(
  tokens: CognitoTokens,
  rootTaskId: string,
  params?: { limit?: number; nextToken?: string },
  signal?: AbortSignal
): Promise<ListSharesResponse> {
  return apiFetchJson<ListSharesResponse>({
    tokens,
    path: `/tasks/${rootTaskId}/shares`,
    query: { limit: params?.limit, nextToken: params?.nextToken },
    signal,
  });
}

export async function revokeShare(tokens: CognitoTokens, rootTaskId: string, granteeSub: string): Promise<RevokeShareResponse> {
  return apiFetchJson<RevokeShareResponse>({ tokens, method: "DELETE", path: `/tasks/${rootTaskId}/shares/${granteeSub}` });
}

export async function listSharedWithMe(
  tokens: CognitoTokens,
  params?: { limit?: number; nextToken?: string },
  signal?: AbortSignal
): Promise<ListSharedWithMeResponse> {
  return apiFetchJson<ListSharedWithMeResponse>({
    tokens,
    path: `/shared`,
    query: { limit: params?.limit, nextToken: params?.nextToken },
    signal,
  });
}

// ----------------------------------------------------------------------
// Phase 3: Shared access routes (authorized via SHARED_POINTER)

export async function getSharedRoot(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  signal?: AbortSignal
): Promise<CreateTaskResponse> {
  return apiFetchJson<CreateTaskResponse>({
    tokens,
    path: `/shared/${ownerSub}/tasks/${rootTaskId}`,
    signal,
  });
}

export async function updateSharedRoot(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  patch: UpdateTaskRequest
): Promise<UpdateTaskResponse> {
  return apiFetchJson<UpdateTaskResponse>({
    tokens,
    method: "PATCH",
    path: `/shared/${ownerSub}/tasks/${rootTaskId}`,
    body: patch,
  });
}

export async function listSharedSubtasks(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  parentTaskId: string,
  params?: { limit?: number; nextToken?: string },
  signal?: AbortSignal
): Promise<ListSubtasksResponse> {
  return apiFetchJson<ListSubtasksResponse>({
    tokens,
    path: `/shared/${ownerSub}/tasks/${rootTaskId}/subtasks/${parentTaskId}`,
    query: { limit: params?.limit, nextToken: params?.nextToken },
    signal,
  });
}

export async function createSharedSubtask(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  parentTaskId: string,
  req: CreateSubtaskRequest
): Promise<CreateSubtaskResponse> {
  return apiFetchJson<CreateSubtaskResponse>({
    tokens,
    method: "POST",
    path: `/shared/${ownerSub}/tasks/${rootTaskId}/subtasks/${parentTaskId}`,
    body: req,
  });
}

export async function updateSharedSubtask(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  parentTaskId: string,
  subtaskId: string,
  patch: UpdateSubtaskRequest
): Promise<UpdateSubtaskResponse> {
  return apiFetchJson<UpdateSubtaskResponse>({
    tokens,
    method: "PATCH",
    path: `/shared/${ownerSub}/tasks/${rootTaskId}/subtasks/${parentTaskId}/${subtaskId}`,
    body: patch,
  });
}

export async function deleteSharedSubtask(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  parentTaskId: string,
  subtaskId: string
): Promise<void> {
  return apiFetchVoid({
    tokens,
    method: "DELETE",
    path: `/shared/${ownerSub}/tasks/${rootTaskId}/subtasks/${parentTaskId}/${subtaskId}`,
  });
}


// ----------------------------------------------------------------------
// Phase 4: Explicit reopen endpoints

export async function reopenTask(tokens: CognitoTokens, taskId: string, expectedRev?: number): Promise<UpdateTaskResponse> {
  const body = expectedRev === undefined ? undefined : { expectedRev };
  return apiFetchJson<UpdateTaskResponse>({ tokens, method: "POST", path: `/tasks/${taskId}/reopen`, body });
}

export async function reopenSubtask(
  tokens: CognitoTokens,
  parentTaskId: string,
  subtaskId: string,
  expectedRev?: number
): Promise<UpdateSubtaskResponse> {
  const body = expectedRev === undefined ? undefined : { expectedRev };
  return apiFetchJson<UpdateSubtaskResponse>({
    tokens,
    method: "POST",
    path: `/tasks/${parentTaskId}/subtasks/${subtaskId}/reopen`,
    body,
  });
}

export async function reopenSharedRoot(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  expectedRev?: number
): Promise<UpdateTaskResponse> {
  const body = expectedRev === undefined ? undefined : { expectedRev };
  return apiFetchJson<UpdateTaskResponse>({
    tokens,
    method: "POST",
    path: `/shared/${ownerSub}/tasks/${rootTaskId}/reopen`,
    body,
  });
}

export async function reopenSharedSubtask(
  tokens: CognitoTokens,
  ownerSub: string,
  rootTaskId: string,
  parentTaskId: string,
  subtaskId: string,
  expectedRev?: number
): Promise<UpdateSubtaskResponse> {
  const body = expectedRev === undefined ? undefined : { expectedRev };
  return apiFetchJson<UpdateSubtaskResponse>({
    tokens,
    method: "POST",
    path: `/shared/${ownerSub}/tasks/${rootTaskId}/subtasks/${parentTaskId}/${subtaskId}/reopen`,
    body,
  });
}
