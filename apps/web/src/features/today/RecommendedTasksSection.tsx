import type { TodayRecommendation, TodayTask } from "@tm/shared";
import { getHygieneSignals } from "../tasks/hygiene";
import {
  applyRecommendationFilter,
  effortToMinutes,
  minimumDurationToMinutes,
  prioritySignal,
  TODAY_CONSTANTS,
  type TodayFilter,
} from "./scoring";

function formatDueDate(dueDate?: string): string | null {
  if (!dueDate) return null;
  try {
    return new Date(dueDate).toLocaleDateString();
  } catch {
    return dueDate;
  }
}

function cardClickProps(onOpen: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: onOpen,
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onOpen();
      }
    },
  };
}

function canEditTask(task: TodayTask): boolean {
  if (task.source !== "shared") return true;
  return task.sharedMeta?.mode === "EDIT";
}

function TaskCard({
  item,
  now,
  onOpenTask,
  onOpenProject,
  onQuickAction,
  pending,
}: {
  item: TodayRecommendation;
  now: Date;
  onOpenTask: (task: TodayTask) => void;
  onOpenProject: (task: TodayTask) => void;
  onQuickAction: (task: TodayTask, action: "complete" | "tomorrow" | "plus3" | "waiting" | "reschedule") => void;
  pending: boolean;
}) {
  const task = item.task;
  const due = formatDueDate(task.dueDate);
  const effortMinutes = effortToMinutes(task.effort);
  const minimumBlockMinutes = minimumDurationToMinutes(task.minimumDuration);
  const signal = prioritySignal(task, now);
  const hygiene = getHygieneSignals(task, now);
  const editable = canEditTask(task);

  return (
    <div className="card today-task-card" style={{ padding: 14, cursor: "pointer" }} {...cardClickProps(() => onOpenTask(task))}>
      <div className="row space-between" style={{ alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{signal ? `${signal} ` : ""}{task.title}</span>
            {task.source === "shared" ? <span className="pill">Shared</span> : null}
          </div>
          <div className="help" style={{ marginTop: 4 }}>
            {item.project ? `Project: ${item.project.title} · ` : ""}
            {task.state ? `${task.state}` : "action"}
            {typeof task.priority === "number" ? ` · P${task.priority}` : ""}
            {task.context ? ` · ${task.context}` : ""}
            {effortMinutes !== null ? ` · effort ${effortMinutes}m` : ""}
            {minimumBlockMinutes !== null ? ` · block ${minimumBlockMinutes}m` : ""}
            {task.source === "shared" && task.sharedMeta ? ` · ${task.sharedMeta.mode}` : ""}
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {item.reasons.map((reason) => <span key={reason} className="pill">{reason}</span>)}
            {hygiene.map((tag) => <span key={tag.key} className="pill" title={tag.label}>{tag.icon} {tag.label}</span>)}
          </div>
          {due ? <div className="help" style={{ marginTop: 6 }}>Due {due}</div> : null}
          <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button type="button" className="btn btn-compact" disabled={!editable || pending} onClick={(e) => { e.stopPropagation(); onQuickAction(task, "complete"); }}>
              {pending ? "Working…" : "Complete"}
            </button>
            <button type="button" className="btn btn-secondary btn-compact" disabled={!editable || pending} onClick={(e) => { e.stopPropagation(); onQuickAction(task, "tomorrow"); }}>
              Tomorrow
            </button>
            <button type="button" className="btn btn-secondary btn-compact" disabled={!editable || pending} onClick={(e) => { e.stopPropagation(); onQuickAction(task, "plus3"); }}>
              +3 days
            </button>
            <button type="button" className="btn btn-secondary btn-compact" disabled={!editable || pending} onClick={(e) => { e.stopPropagation(); onQuickAction(task, "waiting"); }}>
              Waiting
            </button>
            <button type="button" className="btn btn-secondary btn-compact" disabled={!editable || pending} onClick={(e) => { e.stopPropagation(); onQuickAction(task, "reschedule"); }}>
              Reschedule
            </button>
            <button type="button" className="btn btn-secondary btn-compact" onClick={(e) => { e.stopPropagation(); onOpenProject(task); }}>
              Open Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function filterLabel(filter: TodayFilter): string {
  switch (filter) {
    case "quick":
      return "Quick wins";
    case "deep":
      return "Deep work";
    case "dueSoon":
      return "Due soon";
    case "scheduled":
      return "Scheduled";
    case "all":
    default:
      return "All";
  }
}

function FilterButtons({ value, onChange }: { value: TodayFilter; onChange: (value: TodayFilter) => void }) {
  const filters: Array<{ key: TodayFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "quick", label: "Quick wins" },
    { key: "dueSoon", label: "Due soon" },
    { key: "deep", label: "Deep work" },
    { key: "scheduled", label: "Scheduled" },
  ];
  return (
    <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
      {filters.map((filter) => {
        const active = value === filter.key;
        return (
          <button
            key={filter.key}
            type="button"
            className={`btn btn-compact${active ? " btn-primary" : " btn-secondary"}`}
            onClick={() => onChange(filter.key)}
          >
            {filter.label}
          </button>
        );
      })}
    </div>
  );
}

export default function RecommendedTasksSection({
  items,
  filter,
  onFilterChange,
  now,
  onOpenTask,
  onOpenProject,
  onQuickAction,
  pendingTaskId,
}: {
  items: TodayRecommendation[];
  filter: TodayFilter;
  onFilterChange: (value: TodayFilter) => void;
  now: Date;
  onOpenTask: (task: TodayTask) => void;
  onOpenProject: (task: TodayTask) => void;
  onQuickAction: (task: TodayTask, action: "complete" | "tomorrow" | "plus3" | "waiting" | "reschedule") => void;
  pendingTaskId: string | null;
}) {
  const filtered = applyRecommendationFilter(items, filter, now).slice(0, TODAY_CONSTANTS.MAX_RECOMMENDED);

  return (
    <div className="card" style={{ padding: 14 }}>
      <div className="row space-between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>Recommended Tasks</div>
          <div className="help" style={{ marginTop: 4 }}>
            Good execution alternatives after the top recommendation.
          </div>
        </div>
        <FilterButtons value={filter} onChange={onFilterChange} />
      </div>

      {filtered.length ? (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {filtered.map((item) => (
            <TaskCard
              key={`${item.task.source}-${item.task.taskId}`}
              item={item}
              now={now}
              onOpenTask={onOpenTask}
              onOpenProject={onOpenProject}
              onQuickAction={onQuickAction}
              pending={pendingTaskId === `${item.task.source}:${item.task.taskId}`}
            />
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontWeight: 700 }}>No recommended tasks for {filterLabel(filter).toLowerCase()}</div>
          <div className="help" style={{ marginTop: 4 }}>
            Try another filter or create more executable Next or Scheduled actions.
          </div>
        </div>
      )}
    </div>
  );
}
