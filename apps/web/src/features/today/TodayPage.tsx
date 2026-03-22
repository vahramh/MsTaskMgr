import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { TodayExecutionMode, TodayOverviewResponse, TodayTask, UpdateTaskRequest } from "@tm/shared";
import { useAuth } from "../../auth/AuthContext";
import { ApiError } from "../../api/http";
import InlineAlert from "../../components/InlineAlert";
import ExecutionStateBadge from "../../components/ExecutionStateBadge";
import { getToday } from "./api";
import { completeTask, updateSharedRoot, updateSharedSubtask, updateSubtask, updateTask } from "../tasks/api";
import { executionModeLabel, hasAnyGuidedActions, hasAnyProjectHealthIssues } from "./scoring";
import BestNextActionCard from "./BestNextActionCard";
import RecommendedTasksSection from "./RecommendedTasksSection";
import GuidedActionsPanel from "./GuidedActionsPanel";
import ProjectHeatStrip from "./ProjectHeatStrip";
import ProjectHealthPanel from "./ProjectHealthPanel";

type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

const DEFER_COUNT_ATTR = "_egsDeferCount";
const LAST_DEFERRED_AT_ATTR = "_egsLastDeferredAt";

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

function isoDatePlusDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function taskPath(task: TodayTask): string {
  if (task.entityType === "project" && !task.parentTaskId) {
    return `/app/tasks?view=projects&focus=${encodeURIComponent(task.taskId)}&pview=all&scrollTo=${encodeURIComponent(task.taskId)}&edit=${encodeURIComponent(task.taskId)}`;
  }
  const stateView = task.state ?? "inbox";
  return `/app/tasks?view=${encodeURIComponent(stateView)}&scrollTo=${encodeURIComponent(task.taskId)}&edit=${encodeURIComponent(task.taskId)}`;
}

async function patchTodayTask(tokens: NonNullable<ReturnType<typeof useAuth>["tokens"]>, task: TodayTask, patch: UpdateTaskRequest) {
  if (task.source === "shared" && task.sharedMeta) {
    if (task.sharedMeta.mode !== "EDIT") throw new Error("This shared task is view-only.");
    if (task.parentTaskId) {
      return updateSharedSubtask(tokens, task.sharedMeta.ownerSub, task.sharedMeta.rootTaskId, task.parentTaskId, task.taskId, {
        ...patch,
        expectedRev: task.rev,
      });
    }
    return updateSharedRoot(tokens, task.sharedMeta.ownerSub, task.sharedMeta.rootTaskId, { ...patch, expectedRev: task.rev });
  }

  if (task.parentTaskId) {
    return updateSubtask(tokens, task.parentTaskId, task.taskId, { ...patch, expectedRev: task.rev });
  }
  return updateTask(tokens, task.taskId, { ...patch, expectedRev: task.rev });
}

function withDeferredAttrs(task: TodayTask) {
  const current = typeof task.attrs?.[DEFER_COUNT_ATTR] === "number" ? task.attrs?.[DEFER_COUNT_ATTR] : 0;
  return {
    ...(task.attrs ?? {}),
    [DEFER_COUNT_ATTR]: (current ?? 0) + 1,
    [LAST_DEFERRED_AT_ATTR]: new Date().toISOString(),
  };
}

function taskKey(task: TodayTask): string {
  return `${task.source}:${task.taskId}`;
}

function getTaskEffortMinutes(task: TodayTask): number {
  const anyTask = task as TodayTask & {
    effortMinutes?: number;
    effortMins?: number;
    effort?: number | string | null;
  };

  if (typeof anyTask.effortMinutes === "number") return anyTask.effortMinutes;
  if (typeof anyTask.effortMins === "number") return anyTask.effortMins;
  if (typeof anyTask.effort === "number") return anyTask.effort;
  if (typeof anyTask.effort === "string") {
    const match = anyTask.effort.match(/\d+/);
    if (match) return Number(match[0]);
  }
  return 0;
}

function extractTodayTask(value: unknown): TodayTask | null {
  if (!value || typeof value !== "object") return null;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.taskId === "string") {
    return value as TodayTask;
  }

  const nestedTask = candidate.task;
  if (nestedTask && typeof nestedTask === "object") {
    const nested = nestedTask as Record<string, unknown>;
    if (typeof nested.taskId === "string") {
      return nestedTask as TodayTask;
    }
  }

  return null;
}

export default function TodayPage() {
  const { tokens } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<TodayExecutionMode>("all");
  const [includeShared, setIncludeShared] = useState(false);
  const [data, setData] = useState<TodayOverviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<UiError | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(null);
  const now = useMemo(() => new Date(), [refreshVersion, loading]);

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
      .then((resp) => {
        setData(resp);
        setMode(resp.defaultMode ?? "all");
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(toUiError(e));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, [tokens, includeShared, refreshVersion]);

  const openProject = (task: TodayTask) => {
    const projectId =
      task.entityType === "project" && !task.parentTaskId
        ? task.taskId
        : (task.sharedMeta?.rootTaskId ?? task.parentTaskId ?? task.taskId);
    navigate(
      `/app/tasks?view=projects&focus=${encodeURIComponent(projectId)}&pview=all&scrollTo=${encodeURIComponent(projectId)}&edit=${encodeURIComponent(projectId)}`
    );
  };

  const openTask = (task: TodayTask) => {
    navigate(taskPath(task));
  };

  const handleQuickAction = async (task: TodayTask, action: "complete" | "tomorrow" | "plus3" | "waiting" | "reschedule") => {
    if (!tokens) return;
    try {
      setPendingTaskId(`${task.source}:${task.taskId}`);
      setError(null);

      if (action === "complete") {
        if (task.source === "owned" && !task.parentTaskId) {
          await completeTask(tokens, task.taskId, task.rev);
        } else {
          await patchTodayTask(tokens, task, { state: "completed" });
        }
      } else if (action === "tomorrow" || action === "plus3") {
        const days = action === "tomorrow" ? 1 : 3;
        await patchTodayTask(tokens, task, {
          state: "scheduled",
          dueDate: isoDatePlusDays(days),
          attrs: withDeferredAttrs(task),
        });
      } else if (action === "waiting") {
        const value = window.prompt(`Waiting for… (${task.title})`, task.waitingFor ?? "Awaiting response");
        if (!value) return;
        await patchTodayTask(tokens, task, {
          state: "waiting",
          waitingFor: value.trim(),
          dueDate: null,
        });
      } else if (action === "reschedule") {
        const initial = task.dueDate ? task.dueDate.slice(0, 10) : isoDatePlusDays(1);
        const value = window.prompt(`New due date for "${task.title}" (YYYY-MM-DD)`, initial);
        if (!value) return;
        await patchTodayTask(tokens, task, {
          state: "scheduled",
          dueDate: value.trim(),
        });
      }

      setRefreshVersion((v) => v + 1);
    } catch (e) {
      setError(toUiError(e));
    } finally {
      setPendingTaskId(null);
    }
  };

  const goToInbox = () => navigate("/app/tasks?view=inbox");
  const goToWaiting = () => navigate("/app/tasks?view=waiting");
  const goToProjects = () => navigate("/app/tasks?view=projects");
  const goToTasks = () => navigate("/app/tasks");

  const modeData = data?.recommendationModes?.[mode] ?? null;

  const todayMetrics = useMemo(() => {
    const taskMap = new Map<string, TodayTask>();

    const bestNextTask = extractTodayTask(modeData?.bestNextAction);
    if (bestNextTask) {
      taskMap.set(taskKey(bestNextTask), bestNextTask);
    }

    for (const item of modeData?.recommended ?? []) {
      const task = extractTodayTask(item);
      if (task) {
        taskMap.set(taskKey(task), task);
      }
    }

    const tasks = Array.from(taskMap.values());
    const nowMs = Date.now();
    const dueSoonThresholdMs = nowMs + 3 * 24 * 60 * 60 * 1000;
    const staleThresholdMs = nowMs - 7 * 24 * 60 * 60 * 1000;

    const readyTasks = tasks.filter((task) => task.state === "next").length;

    const overdueTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const dueMs = new Date(task.dueDate).getTime();
      return !Number.isNaN(dueMs) && dueMs < nowMs;
    }).length;

    const dueSoonTasks = tasks.filter((task) => {
      if (!task.dueDate) return false;
      const dueMs = new Date(task.dueDate).getTime();
      return !Number.isNaN(dueMs) && dueMs >= nowMs && dueMs <= dueSoonThresholdMs;
    }).length;

    const blockedTasks = tasks.filter((task) => task.state === "waiting" || Boolean(task.waitingFor)).length;

    const staleTasks = tasks.filter((task) => {
      const stamp = task.updatedAt ?? task.createdAt;
      if (!stamp) return false;
      const updatedMs = new Date(stamp).getTime();
      return !Number.isNaN(updatedMs) && updatedMs < staleThresholdMs;
    }).length;

    const totalEffortMinutes = tasks.reduce((sum, task) => sum + getTaskEffortMinutes(task), 0);

    return {
      readyTasks,
      overdueTasks,
      dueSoonTasks,
      blockedTasks,
      staleTasks,
      totalEffortMinutes,
    };
  }, [modeData]);

  const showEmpty =
    !loading &&
    data &&
    modeData &&
    !modeData.bestNextAction &&
    modeData.recommended.length === 0 &&
    !hasAnyGuidedActions(data.guidedActions) &&
    !hasAnyProjectHealthIssues(data.projectHealth);

  return (
    <div className="stack">
      <div className="row space-between" style={{ alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 280, flex: "1 1 520px" }}>
          <div style={{ fontSize: 22, fontWeight: 900 }}>Today</div>
          <div className="help">Primary execution surface: what to do now, what else is reasonable, and what needs attention.</div>
          {modeData ? (
            <div className="help" style={{ marginTop: 6 }}>
              Current execution lens: {executionModeLabel(mode)}. Tasks outside this lens are not removed from the system; they are simply deprioritised for this working window.
            </div>
          ) : null}
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 10, flex: "0 1 auto" }}>
          {modeData ? <ExecutionStateBadge metrics={todayMetrics} /> : null}
          <label className="row" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={includeShared} onChange={(e) => setIncludeShared(e.target.checked)} />
            Include shared tasks
          </label>
        </div>
      </div>

      {error ? (
        <InlineAlert
          tone="error"
          title={error.message}
          message={
            [
              typeof error.status === "number" ? `HTTP ${error.status}` : null,
              error.code ? error.code : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
          actions={
            <button className="btn btn-secondary" type="button" onClick={() => setError(null)}>
              Dismiss
            </button>
          }
        />
      ) : null}

      {loading ? <div className="card">Loading…</div> : null}

      {!loading && data && modeData ? (
        <>
          <BestNextActionCard
            item={modeData.bestNextAction}
            mode={mode}
            modeDescription={modeData.description}
            now={now}
            onOpenTask={openTask}
            onSeeAlternatives={() => window.scrollTo({ top: 320, behavior: "smooth" })}
          />

          <RecommendedTasksSection
            mode={mode}
            modeData={modeData}
            onModeChange={setMode}
            now={now}
            onOpenTask={openTask}
            onOpenProject={openProject}
            onQuickAction={handleQuickAction}
            pendingTaskId={pendingTaskId}
          />

          <GuidedActionsPanel
            actions={data.guidedActions}
            onOpenInbox={goToInbox}
            onOpenWaiting={goToWaiting}
            onOpenProjects={goToProjects}
            onOpenTasks={goToTasks}
          />

          <ProjectHeatStrip summary={data.projectHealth} onOpenProject={openProject} />

          <ProjectHealthPanel summary={data.projectHealth} onOpenProject={openProject} />

          {showEmpty ? (
            <div className="card" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700 }}>Nothing urgent right now</div>
              <div className="help" style={{ marginTop: 4 }}>
                Add more Next actions or run a Review if you want the system to surface stronger recommendations.
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}