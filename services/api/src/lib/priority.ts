export type ApiTaskPriority = 1 | 2 | 3 | 4 | 5;

export function priorityRank(priority: ApiTaskPriority | undefined | null): number {
  if (!priority) return 0;
  return 6 - priority; // P1 strongest, P5 weakest
}

export function priorityLabel(priority: ApiTaskPriority | undefined | null): string {
  switch (priority) {
    case 1:
      return "P1 · Critical";
    case 2:
      return "P2 · High";
    case 3:
      return "P3 · Normal";
    case 4:
      return "P4 · Low";
    case 5:
      return "P5 · Very low";
    default:
      return "No priority";
  }
}