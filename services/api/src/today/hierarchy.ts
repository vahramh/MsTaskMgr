import type { TodayTask } from "@tm/shared";

export function taskRefKey(task: Pick<TodayTask, "source" | "taskId">): string {
  return `${task.source}:${task.taskId}`;
}

export function parentRefKey(task: Pick<TodayTask, "source" | "parentTaskId">): string | null {
  return task.parentTaskId ? `${task.source}:${task.parentTaskId}` : null;
}

export function buildChildrenMap(tasks: TodayTask[]): Map<string, TodayTask[]> {
  const map = new Map<string, TodayTask[]>();
  for (const task of tasks) {
    const key = parentRefKey(task);
    if (!key) continue;
    const list = map.get(key) ?? [];
    list.push(task);
    map.set(key, list);
  }
  return map;
}

export function collectDescendants(root: TodayTask, childrenMap: Map<string, TodayTask[]>): TodayTask[] {
  const result: TodayTask[] = [];
  const stack = [...(childrenMap.get(taskRefKey(root)) ?? [])];
  while (stack.length) {
    const current = stack.pop()!;
    result.push(current);
    const children = childrenMap.get(taskRefKey(current));
    if (children?.length) stack.push(...children);
  }
  return result;
}
