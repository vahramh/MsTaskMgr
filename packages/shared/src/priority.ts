import type { TaskPriority } from "./index";

export function priorityRank(priority: TaskPriority | undefined | null): number {
  if (priority == null) return 0;
  return 6 - priority;
}

export function priorityLabel(priority: TaskPriority | undefined | null): string {
  switch (priority) {
    case 1: return "P1 · Critical";
    case 2: return "P2 · High";
    case 3: return "P3 · Normal";
    case 4: return "P4 · Low";
    case 5: return "P5 · Very low";
    default: return "No priority";
  }
}
