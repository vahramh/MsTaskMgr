export function pkForUser(sub: string): string {
  return `USER#${sub}`;
}

export function skForTask(taskId: string): string {
  return `TASK#${taskId}`;
}

export function skForSubtask(parentTaskId: string, taskId: string): string {
  return `SUBTASK#${parentTaskId}#${taskId}`;
}

export function gsi1pkForUser(sub: string): string {
  return pkForUser(sub);
}

export function gsi1skForCreated(createdAt: string, taskId: string): string {
  return `CREATED#${createdAt}#${taskId}`;
}

export function gsi2pkForUserState(sub: string, state: string): string {
  return `${pkForUser(sub)}#STATE#${state}`;
}

export function gsi2skForBucket(updatedAt: string, taskId: string): string {
  return `UPDATED#${updatedAt}#${taskId}`;
}

// ----------------------------------------------------------------------
// Phase 3: Sharing + secure subtree membership lookups

export function skForLookup(taskId: string): string {
  return `LOOKUP#${taskId}`;
}

export function skForShareGrant(rootTaskId: string, granteeSub: string): string {
  return `SHARE#${rootTaskId}#${granteeSub}`;
}

export function skForSharedPointer(ownerSub: string, rootTaskId: string): string {
  return `SHARED#${ownerSub}#${rootTaskId}`;
}
