import type { TodayTask } from "@tm/shared";
import { listTasksByCreatedAt, listAllSubtasks } from "../tasks/repo";
import { batchGetRootTasks, listSharedWithMe } from "../tasks/sharing";
import { pkForUser } from "../tasks/keys";

async function listAllOwnedRoots(sub: string): Promise<TodayTask[]> {
  const out: TodayTask[] = [];
  let lek: any | undefined = undefined;
  while (true) {
    const r = await listTasksByCreatedAt(sub, 100, lek);
    out.push(...r.items.map((task) => ({ ...task, source: "owned" as const })));
    if (!r.lastEvaluatedKey) break;
    lek = r.lastEvaluatedKey;
  }
  return out;
}

async function expandOwnedTree(sub: string, parentTaskId: string): Promise<TodayTask[]> {
  const children = (await listAllSubtasks(sub, parentTaskId, 100)).map((task) => ({ ...task, source: "owned" as const }));
  const descendants: TodayTask[] = [...children];
  for (const child of children) {
    descendants.push(...await expandOwnedTree(sub, child.taskId));
  }
  return descendants;
}

async function expandSharedTree(ownerSub: string, parentTask: TodayTask): Promise<TodayTask[]> {
  const children = (await listAllSubtasks(ownerSub, parentTask.taskId, 100)).map((task) => ({
    ...task,
    source: "shared" as const,
    sharedMeta: parentTask.sharedMeta,
  }));
  const descendants: TodayTask[] = [...children];
  for (const child of children) {
    descendants.push(...await expandSharedTree(ownerSub, child));
  }
  return descendants;
}

export async function loadTodayTasks(viewerSub: string, includeShared: boolean): Promise<TodayTask[]> {
  const ownedRoots = await listAllOwnedRoots(viewerSub);
  const ownedDescendantsNested = await Promise.all(
    ownedRoots.map((task) => expandOwnedTree(viewerSub, task.taskId))
  );
  const tasks: TodayTask[] = [...ownedRoots, ...ownedDescendantsNested.flat()];

  if (!includeShared) return tasks;

  let sharedLek: { PK: string; SK: string } | undefined;
  const pointers: Array<{ ownerSub: string; rootTaskId: string; mode: "VIEW" | "EDIT" }> = [];
  while (true) {
    const r = await listSharedWithMe(viewerSub, 100, sharedLek);
    for (const item of r.items) {
      pointers.push({ ownerSub: item.ownerSub, rootTaskId: item.rootTaskId, mode: item.mode });
    }
    if (!r.lastEvaluatedKey) break;
    sharedLek = r.lastEvaluatedKey;
  }

  if (!pointers.length) return tasks;

  const rootMap = await batchGetRootTasks(pointers.map((p) => ({ ownerSub: p.ownerSub, rootTaskId: p.rootTaskId })));
  const sharedRoots: TodayTask[] = [];
  for (const pointer of pointers) {
    const key = `${pkForUser(pointer.ownerSub)}::TASK#${pointer.rootTaskId}`;
    const task = rootMap.get(key);
    if (!task) continue;
    sharedRoots.push({
      ...task,
      source: "shared",
      sharedMeta: {
        ownerSub: pointer.ownerSub,
        rootTaskId: pointer.rootTaskId,
        mode: pointer.mode,
      },
    });
  }

  const sharedDescendantsNested = await Promise.all(sharedRoots.map((task) => expandSharedTree(task.sharedMeta!.ownerSub, task)));
  return [...tasks, ...sharedRoots, ...sharedDescendantsNested.flat()];
}
