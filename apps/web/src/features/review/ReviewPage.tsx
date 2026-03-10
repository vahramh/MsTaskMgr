import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { ReviewMetricKey, ReviewResponse, TodayProjectHealthIssue, TodayTask } from "@tm/shared";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/http";
import InlineAlert from "../../components/InlineAlert";
import { getReview } from "./api";
import InsightsPanel from "../insights/InsightsPanel";
import { effortToMinutes } from "../today/scoring";
import { getHygieneSignals } from "../tasks/hygiene";

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

function metricLabel(metric: ReviewMetricKey): string {
  switch (metric) {
    case "inbox": return "Inbox items";
    case "projectsWithoutNext": return "Projects without Next actions";
    case "waitingFollowups": return "Waiting tasks needing follow-up";
    case "staleTasks": return "Stale tasks";
    case "oldSomeday": return "Someday items older than 60 days";
    case "overdueScheduled": return "Scheduled tasks past due";
  }
}

function metricHelp(metric: ReviewMetricKey): string {
  switch (metric) {
    case "inbox": return "Capture is working, but these still need clarification or organisation.";
    case "projectsWithoutNext": return "Every active project should expose at least one executable next action.";
    case "waitingFollowups": return "These delegated or blocked items have gone quiet long enough to chase.";
    case "staleTasks": return "Open items not touched in 30+ days usually need refresh, defer, or delete.";
    case "oldSomeday": return "Someday/maybe items older than 60 days should be renewed or dropped.";
    case "overdueScheduled": return "Calendar-committed work that has already slipped past its due date.";
  }
}

function formatDueDate(dueDate?: string): string | null {
  if (!dueDate) return null;
  try { return new Date(dueDate).toLocaleDateString(); } catch { return dueDate; }
}

function taskPath(task: TodayTask): string {

  // Open real projects in project workspace
  if (task.entityType === "project" && !task.parentTaskId) {
    return `/app/tasks?view=projects&focus=${encodeURIComponent(task.taskId)}&pview=all&scrollTo=${encodeURIComponent(task.taskId)}&edit=${encodeURIComponent(task.taskId)}`;
  }

  // Otherwise open in normal task list view
  const stateView = task.state ?? "inbox";

  return `/app/tasks?view=${encodeURIComponent(stateView)}&scrollTo=${encodeURIComponent(task.taskId)}&edit=${encodeURIComponent(task.taskId)}`;
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

function TaskRow({ task, onOpenTask }: { task: TodayTask; onOpenTask: (task: TodayTask) => void }) {
  const minutes = effortToMinutes(task.effort);
  const due = formatDueDate(task.dueDate);
  const hygiene = getHygieneSignals(task, new Date());
  return (
    <div className="card" style={{ padding: 14, cursor: "pointer" }} {...cardClickProps(() => onOpenTask(task))}>
      <div className="row space-between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 700, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span>{task.title}</span>
            {task.source === "shared" ? <span className="pill">Shared</span> : null}
          </div>
          <div className="help" style={{ marginTop: 4 }}>
            {(task.entityType ?? "action")}
            {task.state ? ` · ${task.state}` : ""}
            {typeof task.priority === "number" ? ` · P${task.priority}` : ""}
            {task.context ? ` · ${task.context}` : ""}
            {minutes !== null ? ` · ${minutes}m` : ""}
            {due ? ` · Due ${due}` : ""}
          </div>
          {hygiene.length ? (
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
              {hygiene.map((signal) => <span key={signal.key} className="pill" title={signal.label}>{signal.icon} {signal.label}</span>)}
            </div>
          ) : null}
        </div>
        <button type="button" className="btn btn-secondary btn-compact" onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}>Open in Tasks</button>
      </div>
    </div>
  );
}

function ProjectIssueRow({ item, onOpenProject }: { item: TodayProjectHealthIssue; onOpenProject: (task: TodayTask) => void }) {
  return (
    <div className="card" style={{ padding: 14, cursor: "pointer" }} {...cardClickProps(() => onOpenProject(item.project))}>
      <div className="row space-between" style={{ gap: 10, alignItems: "flex-start" }}>
        <div>
          <div style={{ fontWeight: 700 }}>{item.project.title}</div>
          <div className="help" style={{ marginTop: 4 }}>
            {item.nextActions} next · {item.openActions} open actions · {item.stalledWaiting} stalled waiting
          </div>
          <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {item.issues.map((issue) => <span key={issue} className="pill">{issue === "noNext" ? "No next action" : issue === "onlySomeday" ? "Only someday actions" : "Stalled waiting"}</span>)}
          </div>
        </div>
        <button type="button" className="btn btn-secondary btn-compact" onClick={(e) => { e.stopPropagation(); onOpenProject(item.project); }}>Open project</button>
      </div>
    </div>
  );
}

function ReviewChecklist({ active, onSelect }: { active: ReviewMetricKey; onSelect: (metric: ReviewMetricKey) => void }) {
  const steps: Array<{ step: number; label: string; metric: ReviewMetricKey }> = [
    { step: 1, label: "Process Inbox", metric: "inbox" },
    { step: 2, label: "Check Waiting For", metric: "waitingFollowups" },
    { step: 3, label: "Ensure every Project has a Next action", metric: "projectsWithoutNext" },
    { step: 4, label: "Review Scheduled items", metric: "overdueScheduled" },
    { step: 5, label: "Reconsider Someday items", metric: "oldSomeday" },
  ];

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8 }}>Weekly Review Checklist</div>
      <div className="help" style={{ marginBottom: 12 }}>Move top to bottom until the system is trustworthy again.</div>
      <div style={{ display: "grid", gap: 8 }}>
        {steps.map((step) => (
          <button
            key={step.step}
            type="button"
            className={`btn ${active === step.metric ? "btn-primary" : "btn-secondary"}`}
            style={{ justifyContent: "flex-start" }}
            onClick={() => onSelect(step.metric)}
          >
            {step.step}. {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function ReviewPage() {
  const { tokens } = useAuth();
  const navigate = useNavigate();
  const [includeShared, setIncludeShared] = useState(false);
  const [data, setData] = useState<ReviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<ReviewMetricKey>("inbox");
  const [refreshVersion, setRefreshVersion] = useState(0);

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
    getReview(tokens, includeShared, ac.signal)
      .then((resp) => {
        setData(resp);
        const countMap: Record<ReviewMetricKey, number> = {
          inbox: resp.inboxCount,
          projectsWithoutNext: resp.projectsWithoutNext,
          waitingFollowups: resp.waitingFollowups,
          staleTasks: resp.staleTasks,
          oldSomeday: resp.oldSomeday,
          overdueScheduled: resp.overdueScheduled,
        };
        if (countMap[selectedMetric] === 0) {
          const firstNonZero = (Object.entries(countMap).find(([, v]) => v > 0)?.[0] ?? "inbox") as ReviewMetricKey;
          setSelectedMetric(firstNonZero);
        }
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(toUiError(e));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [tokens, includeShared, refreshVersion]);

  const metricCards = useMemo(() => data ? [
    { key: "inbox" as const, value: data.inboxCount },
    { key: "projectsWithoutNext" as const, value: data.projectsWithoutNext },
    { key: "waitingFollowups" as const, value: data.waitingFollowups },
    { key: "staleTasks" as const, value: data.staleTasks },
    { key: "oldSomeday" as const, value: data.oldSomeday },
    { key: "overdueScheduled" as const, value: data.overdueScheduled },
  ] : [], [data]);

  const detailPane = useMemo(() => {
    if (!data) return null;
    switch (selectedMetric) {
      case "projectsWithoutNext":
        return { type: "projects" as const, items: data.projectsWithoutNextItems };
      case "inbox":
        return { type: "tasks" as const, items: data.buckets.inbox };
      case "waitingFollowups":
        return { type: "tasks" as const, items: data.buckets.waitingFollowups };
      case "staleTasks":
        return { type: "tasks" as const, items: data.buckets.staleTasks };
      case "oldSomeday":
        return { type: "tasks" as const, items: data.buckets.oldSomeday };
      case "overdueScheduled":
        return { type: "tasks" as const, items: data.buckets.overdueScheduled };
    }
  }, [data, selectedMetric]);

  const openProject = (task: TodayTask) => {
    const projectId = task.entityType === "project" && !task.parentTaskId ? task.taskId : (task.sharedMeta?.rootTaskId ?? task.parentTaskId ?? task.taskId);
    navigate(`/app/tasks?view=projects&focus=${encodeURIComponent(projectId)}&pview=all&scrollTo=${encodeURIComponent(projectId)}&edit=${encodeURIComponent(projectId)}`);
  };

  const openTask = (task: TodayTask) => {
    navigate(taskPath(task));
  };

  return (
    <div className="stack">
      <div>
        <div style={{ fontSize: 22, fontWeight: 900 }}>Review</div>
        <div className="help">Weekly discipline layer for inbox processing, follow-up, project integrity, and cleanup.</div>
      </div>

      {error ? (
        <InlineAlert
          tone="error"
          title={error.message}
          message={[typeof error.status === "number" ? `HTTP ${error.status}` : null, error.code ? error.code : null].filter(Boolean).join(" · ") || undefined}
          actions={<button className="btn btn-secondary" type="button" onClick={() => setError(null)}>Dismiss</button>}
        />
      ) : null}

      <div className="card" style={{ padding: 14 }}>
        <div className="row space-between" style={{ alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 800 }}>Scope</div>
            <div className="help">Review the system health snapshot and drill directly into the problem buckets.</div>
          </div>
          <label className="row" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={includeShared} onChange={(e) => setIncludeShared(e.target.checked)} />
            Include shared tasks
          </label>
        </div>
      </div>

      <InsightsPanel
        includeShared={includeShared}
        title="Guided actions"
        subtitle="High-value fixes that make the weekly review shorter and the system more trustworthy."
        onActionComplete={() => setRefreshVersion((v) => v + 1)}
      />

      {loading ? <div className="card">Loading…</div> : null}

      {!loading && data ? (
        <>
          <div style={{ display: "grid", gap: 14, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {metricCards.map((card) => (
              <button
                key={card.key}
                type="button"
                className="card"
                style={{ padding: 14, textAlign: "left", border: selectedMetric === card.key ? "1px solid #111827" : undefined }}
                onClick={() => setSelectedMetric(card.key)}
              >
                <div className="help">{metricLabel(card.key)}</div>
                <div style={{ fontSize: 30, fontWeight: 900, marginTop: 8 }}>{card.value}</div>
                <div className="help" style={{ marginTop: 8 }}>{metricHelp(card.key)}</div>
              </button>
            ))}
          </div>

            <div
              style={{
                display: "grid",
                gap: 14,
                gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))",
                alignItems: "start",
              }}
            >
              <ReviewChecklist active={selectedMetric} onSelect={setSelectedMetric} />

              <div className="card" style={{ padding: 14, minWidth: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{metricLabel(selectedMetric)}</div>
              <div className="help" style={{ marginTop: 4, marginBottom: 12 }}>{metricHelp(selectedMetric)}</div>

              {detailPane?.type === "projects" ? (
                detailPane.items.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {detailPane.items.map((item) => <ProjectIssueRow key={`${item.project.source}-${item.project.taskId}`} item={item} onOpenProject={openProject} />)}
                  </div>
                ) : <div className="help">No items in this bucket.</div>
              ) : detailPane?.type === "tasks" ? (
                detailPane.items.length ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {detailPane.items.map((task) => <TaskRow key={`${task.source}-${task.taskId}`} task={task} onOpenTask={openTask} />)}
                  </div>
                ) : <div className="help">No items in this bucket.</div>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
