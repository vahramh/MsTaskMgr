import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TodayResponse } from "@tm/shared";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/http";
import InlineAlert from "../../components/InlineAlert";
import { getToday } from "./api";
import InsightsPanel from "../insights/InsightsPanel";
import { getHygieneSignals } from "../tasks/hygiene";
import {
  applyTaskFilter,
  effortToMinutes,
  prioritySignal,
  TODAY_CONSTANTS,
  type ProjectHealthIssue,
  type TodayFilter,
  type TodayTask,
} from "./scoring";

type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

function toUiError(e: unknown): UiError {
  if (e instanceof ApiError) {
    return {
      message: e.message,
      requestId: e.requestId,
      code: e.code,
      status: e.status,
    };
  }
  if (e && typeof e === "object") {
    const any = e as { message?: string };
    return { message: any.message ?? String(e) };
  }
  return { message: String(e) };
}

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

function TaskCard({ task, now, onOpenProject }: { task: TodayTask; now: Date; onOpenProject: (task: TodayTask) => void }) {
  const due = formatDueDate(task.dueDate);
  const minutes = effortToMinutes(task.effort);
  const signal = prioritySignal(task, now);
  const hygiene = getHygieneSignals(task, now);

  return (
    <div key={`${task.source}-${task.taskId}`} className="card today-task-card" style={{ padding: 14 }}>
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

          {due ? <div className="help" style={{ marginTop: 4 }}>Due {due}</div> : null}
          {hygiene.length ? <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>{hygiene.map((item) => <span key={item.key} className="pill" title={item.label}>{item.icon} {item.label}</span>)}</div> : null}
        </div>
        <button type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenProject(task)}>Open in Tasks</button>
      </div>
    </div>
  );
}

function Section({ title, tasks, now, onOpenProject }: { title: string; tasks: TodayTask[]; now: Date; onOpenProject: (task: TodayTask) => void }) {
  if (!tasks.length) return null;
  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ marginBottom: 10 }}>{title}</h3>
      <div style={{ display: "grid", gap: 10 }}>
        {tasks.map((task) => <TaskCard key={`${task.source}-${task.taskId}`} task={task} now={now} onOpenProject={onOpenProject} />)}
      </div>
    </div>
  );
}

function ProjectHealthPanel({ items, onOpenProject }: { items: ProjectHealthIssue[]; onOpenProject: (task: TodayTask) => void }) {
  if (!items.length) return null;
  return (
    <div className="card" style={{ padding: 14, marginBottom: 24 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 10 }}>Project Health</div>
      <div className="help" style={{ marginBottom: 12 }}>
        Projects needing attention because they have no next actions, are parked in someday, or have stale waiting items.
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((item) => (
          <div key={`${item.project.source}-${item.project.taskId}`} className="today-project-health-row">
            <div style={{ fontWeight: 700 }}>{item.project.title}</div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 6 }}>
              {item.issues.map((issue) => <span key={issue} className="pill">{issueLabel(issue)}</span>)}
            </div>
            <div className="help" style={{ marginTop: 6 }}>
              {item.nextActions} next · {item.openActions} open actions · {item.stalledWaiting} stalled waiting
            </div>
            <div style={{ marginTop: 8 }}>
              <button type="button" className="btn btn-secondary btn-compact" onClick={() => onOpenProject(item.project)}>Open project</button>
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
  const navigate = useNavigate();
  const [filter, setFilter] = useState<TodayFilter>("all");
  const [includeShared, setIncludeShared] = useState(false);
  const [data, setData] = useState<TodayResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const now = new Date();

  useEffect(() => {
    if (!tokens) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    getToday(tokens, includeShared, ac.signal)
      .then((resp) => setData(resp))
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(toUiError(e));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [tokens, includeShared, refreshVersion]);

  const recommended = useMemo(() => applyTaskFilter(data?.recommended ?? [], filter, now).slice(0, TODAY_CONSTANTS.MAX_RECOMMENDED), [data, filter, now]);

  const openProject = (task: TodayTask) => {
    const projectId = task.entityType === "project" && !task.parentTaskId ? task.taskId : (task.sharedMeta?.rootTaskId ?? task.parentTaskId ?? task.taskId);
    navigate(`/app/tasks?view=projects&focus=${encodeURIComponent(projectId)}&pview=all&scrollTo=${encodeURIComponent(projectId)}`);
  };

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Today</div>
        <div className="help">Best tasks to do now, based on priority, urgency, effort, context, and aging.</div>
      </div>

      {error ? (
        <InlineAlert
          tone="error"
          title={error.message}
          message={[
            typeof error.status === "number" ? `HTTP ${error.status}` : null,
            error.code ? error.code : null,
          ].filter(Boolean).join(" · ") || undefined}
          actions={<button className="btn btn-secondary" type="button" onClick={() => setError(null)}>Dismiss</button>}
        />
      ) : null}

      <div className="card" style={{ padding: 14 }}>
        <div className="row space-between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Focus filters</div>
            <div className="help">Use these to bias recommendations toward quick wins, deeper work, or near-term deadlines.</div>
          </div>
          <label className="row" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={includeShared} onChange={(e) => setIncludeShared(e.target.checked)} />
            Include shared tasks
          </label>
        </div>
        <div style={{ marginTop: 12 }}>
          <FilterButtons value={filter} onChange={setFilter} />
        </div>
      </div>

      <InsightsPanel
        includeShared={includeShared}
        title="Guided actions"
        subtitle="Deterministic suggestions for what to clean up or push forward next."
        onActionComplete={() => setRefreshVersion((v) => v + 1)}
      />

      {loading ? <div className="card">Loading…</div> : null}

      {!loading && data ? (
        <>
          <ProjectHealthPanel items={data.projectHealth} onOpenProject={openProject} />
          <Section title="Overdue" tasks={data.overdue} now={now} onOpenProject={openProject} />
          <Section title="Due today" tasks={data.dueToday} now={now} onOpenProject={openProject} />
          <Section title={filterLabel(filter)} tasks={recommended} now={now} onOpenProject={openProject} />
          <Section title="Waiting follow-ups" tasks={data.waiting} now={now} onOpenProject={openProject} />
          {!data.overdue.length && !data.dueToday.length && !recommended.length && !data.waiting.length && !data.projectHealth.length ? (
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
