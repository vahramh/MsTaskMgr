import { useMemo, useState } from "react";
import { useAuth } from "../../auth/AuthContext";
import InlineAlert from "../../components/InlineAlert";
import { useTasks } from "../tasks/useTasks";
import {
  applyTaskFilter,
  buildProjectHealth,
  effortToMinutes,
  isDueToday,
  isOverdue,
  isWaitingFollowUp,
  prioritySignal,
  rankTasks,
  TODAY_CONSTANTS,
  type ProjectHealthIssue,
  type TodayFilter,
  type TodayTask,
} from "./scoring";
import { useSharedTodayTasks } from "./useSharedTodayTasks";
import { useTodayHierarchy } from "./useTodayHierarchy";

function formatDueDate(dueDate?: string): string | null {
  if (!dueDate) return null;
  try {
    return new Date(dueDate).toLocaleDateString();
  } catch {
    return dueDate;
  }
}

function issueLabel(issue: ProjectHealthIssue["issues"][number]): string {
  switch (issue) {
    case "noNext":
      return "No next action";
    case "onlySomeday":
      return "Only someday actions";
    case "stalledWaiting":
      return "Waiting follow-up stalled";
  }
}

function filterLabel(filter: TodayFilter): string {
  switch (filter) {
    case "quick":
      return "Quick Wins";
    case "deep":
      return "Deep Work";
    case "dueSoon":
      return "Due Soon";
    case "all":
    default:
      return "Recommended";
  }
}

function TaskCard({ task, now }: { task: TodayTask; now: Date }) {
  const due = formatDueDate(task.dueDate);
  const minutes = effortToMinutes(task.effort);
  const signal = prioritySignal(task, now);

  return (
    <div key={task.taskId} className="card today-task-card" style={{ padding: 14 }}>
      <div className="row space-between" style={{ alignItems: "flex-start", gap: 8 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span>{signal ? `${signal} ` : ""}{task.title}</span>
            {task.source === "shared" ? <span className="pill">Shared</span> : null}
          </div>

          <div className="help" style={{ marginTop: 4 }}>
            {task.entityType ?? "action"}
            {task.state ? ` · ${task.state}` : ""}
            {typeof task.priority === "number" ? ` · P${task.priority}` : ""}
            {task.context ? ` · ${task.context}` : ""}
            {minutes !== null ? ` · ${minutes}m` : ""}
            {task.source === "shared" && task.sharedMeta ? ` · ${task.sharedMeta.mode}` : ""}
          </div>

          {due ? (
            <div className="help" style={{ marginTop: 4 }}>
              Due {due}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Section({ title, tasks, now }: { title: string; tasks: TodayTask[]; now: Date }) {
  if (!tasks.length) return null;

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 10 }}>{title}</h3>

      <div style={{ display: "grid", gap: 10 }}>
        {tasks.map((task) => (
          <TaskCard key={`${task.source ?? "owned"}-${task.taskId}`} task={task} now={now} />
        ))}
      </div>
    </div>
  );
}

function ProjectHealthPanel({ items }: { items: ProjectHealthIssue[] }) {
  if (!items.length) return null;

  return (
    <div className="card" style={{ padding: 14, marginBottom: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Project Health</div>
      <div className="help" style={{ marginBottom: 12 }}>
        Projects needing attention because they have no next actions, are parked in someday, or have stale waiting items.
      </div>

      <div style={{ display: "grid", gap: 10 }}>
        {items.map((item) => (
          <div key={item.project.taskId} className="today-project-health-row">
            <div style={{ fontWeight: 700 }}>{item.project.title}</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {item.issues.map((issue) => (
                <span key={issue} className="pill">{issueLabel(issue)}</span>
              ))}
            </div>
            <div className="help" style={{ marginTop: 6 }}>
              {item.nextActions} next · {item.openActions} open actions · {item.stalledWaiting} stalled waiting
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterButtons({ value, onChange }: { value: TodayFilter; onChange: (value: TodayFilter) => void }) {
  const filters: Array<{ key: TodayFilter; label: string }> = [
    { key: "all", label: "All" },
    { key: "quick", label: "Quick Wins" },
    { key: "deep", label: "Deep Work" },
    { key: "dueSoon", label: "Due Soon" },
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

export default function TodayPage() {
  const { tokens } = useAuth();
  const { items, initialLoading, error, clearError } = useTasks(tokens);
  const [filter, setFilter] = useState<TodayFilter>("all");
  const [includeShared, setIncludeShared] = useState(false);
  const { items: sharedItems, loading: sharedLoading, error: sharedError } = useSharedTodayTasks(tokens, includeShared);

  const now = new Date();

  const allItems = useMemo<TodayTask[]>(() => {
    const owned = items.map((task) => ({ ...task, source: "owned" as const }));
    return includeShared ? [...owned, ...sharedItems] : owned;
  }, [items, sharedItems, includeShared]);

  const {
    items: hierarchyItems,
    loading: hierarchyLoading,
    error: hierarchyError,
  } = useTodayHierarchy(tokens, allItems);

  const { overdue, dueToday, waiting, recommended, projectHealth } = useMemo(() => {
    const actionable = hierarchyItems.filter(
      (task) =>
        task.state !== "completed" &&
        task.state !== "reference" &&
        task.entityType !== "project"
    );

    const overdue = actionable.filter((task) => isOverdue(task, now));
    const dueToday = actionable.filter((task) => isDueToday(task, now));
    const waiting = actionable.filter((task) => isWaitingFollowUp(task, now));

    const excluded = new Set<string>([
      ...overdue.map((task) => `${task.source ?? "owned"}:${task.taskId}`),
      ...dueToday.map((task) => `${task.source ?? "owned"}:${task.taskId}`),
    ]);

    const recommendedBase = rankTasks(actionable, now).filter(
      (task) => !excluded.has(`${task.source ?? "owned"}:${task.taskId}`)
    );

    const recommended = applyTaskFilter(recommendedBase, filter, now).slice(
      0,
      TODAY_CONSTANTS.MAX_RECOMMENDED
    );

    const projectHealth = buildProjectHealth(hierarchyItems, now);

    return {
      overdue,
      dueToday,
      waiting,
      recommended,
      projectHealth,
    };
  }, [hierarchyItems, filter, now]);

  const combinedError = error ?? sharedError ?? hierarchyError;
  const loading =
    initialLoading ||
    hierarchyLoading ||
    (includeShared && sharedLoading && items.length === 0);

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Today</div>
        <div className="help">Best tasks to do now, based on priority, urgency, effort, context, and aging.</div>
      </div>

      {combinedError ? (
        <InlineAlert
          tone="error"
          title={combinedError.message}
          message={
            [
              typeof combinedError.status === "number" ? `HTTP ${combinedError.status}` : null,
              combinedError.code ? combinedError.code : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <button className="btn btn-secondary" type="button" onClick={clearError}>
              Dismiss
            </button>
          }
        />
      ) : null}

      <div className="card" style={{ padding: 14 }}>
        <div className="row space-between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Focus filters</div>
            <div className="help">Use these to bias recommendations toward quick wins, deeper work, or near-term deadlines.</div>
          </div>

          <label className="row" style={{ gap: 8, fontWeight: 600 }}>
            <input
              type="checkbox"
              checked={includeShared}
              onChange={(e) => setIncludeShared(e.target.checked)}
            />
            Include shared tasks
          </label>
        </div>

        <div style={{ marginTop: 12 }}>
          <FilterButtons value={filter} onChange={setFilter} />
        </div>
      </div>

      {loading ? <div className="card">Loading…</div> : null}

      {!loading ? (
        <>
          <ProjectHealthPanel items={projectHealth} />
          <Section title="Overdue" tasks={overdue} now={now} />
          <Section title="Due today" tasks={dueToday} now={now} />
          <Section title={filterLabel(filter)} tasks={recommended} now={now} />
          <Section title="Waiting follow-ups" tasks={waiting} now={now} />

          {!overdue.length && !dueToday.length && !recommended.length && !waiting.length && !projectHealth.length ? (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700 }}>Nothing urgent right now</div>
              <div className="help" style={{ marginTop: 4 }}>
                Try adding more Next actions, updating stale waiting items, or reviewing project health.
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}