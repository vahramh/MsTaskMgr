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
import AttentionPanel from "./AttentionPanel";
import RecommendedTasksSection from "./RecommendedTasksSection";
import GuidedActionsPanel from "./GuidedActionsPanel";
import ProjectHeatStrip from "./ProjectHeatStrip";
import ProjectHealthPanel from "./ProjectHealthPanel";
import { useExecutionContexts } from "../contexts/useExecutionContexts";

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


export default function TodayPage() {
  const { tokens } = useAuth();
  const navigate = useNavigate();
  const executionContexts = useExecutionContexts(tokens);
  const [mode, setMode] = useState<TodayExecutionMode>("all");
  const [includeShared, setIncludeShared] = useState(false);
  const [activeContextIds, setActiveContextIds] = useState<string[]>([]);
  const [includeNoContext, setIncludeNoContext] = useState(true);
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
    getToday(tokens, includeShared, activeContextIds, includeNoContext, ac.signal)
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
  }, [tokens, includeShared, activeContextIds, includeNoContext, refreshVersion]);

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

  const todayMetrics = data?.executionMetrics ?? null;

  const handleFallbackOpen = (fallback: NonNullable<TodayOverviewResponse["fallbackRecommendation"]>) => {
    if (fallback.task) {
      openTask(fallback.task);
      return;
    }
    switch (fallback.targetView) {
      case "inbox":
        goToInbox();
        return;
      case "waiting":
        goToWaiting();
        return;
      case "projects":
        goToProjects();
        return;
      case "tasks":
      default:
        goToTasks();
    }
  };

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
          {todayMetrics ? <ExecutionStateBadge metrics={todayMetrics} /> : null}
          <label className="row" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={includeShared} onChange={(e) => setIncludeShared(e.target.checked)} />
            Include shared tasks
          </label>
          <label className="row" style={{ gap: 8, fontWeight: 600 }}>
            <input type="checkbox" checked={includeNoContext} onChange={(e) => setIncludeNoContext(e.target.checked)} />
            Include tasks with no context
          </label>
        </div>
      </div>

      
      <div className="card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, marginBottom: 8 }}>Active execution contexts</div>
        {executionContexts.loading ? <div className="help">Loading contexts…</div> : null}
        {!executionContexts.loading && executionContexts.items.length === 0 ? (
          <div className="help">No execution contexts defined yet. Use the Contexts page to create them.</div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {executionContexts.items.filter((item) => !item.archived).map((item) => {
              const active = activeContextIds.includes(item.contextId);
              return (
                <button
                  key={item.contextId}
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => setActiveContextIds((previous) => previous.includes(item.contextId) ? previous.filter((value) => value !== item.contextId) : [...previous, item.contextId])}
                  style={{
                    borderColor: active ? "#2563eb" : undefined,
                    background: active ? "#eff6ff" : undefined,
                    color: active ? "#1d4ed8" : undefined,
                  }}
                >
                  {item.name}
                </button>
              );
            })}
          </div>
        )}
        <div className="help" style={{ marginTop: 8 }}>
          Match rule: a task is eligible if it matches any selected context.
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
            fallback={data.fallbackRecommendation}
            mode={mode}
            modeDescription={modeData.description}
            now={now}
            onOpenTask={openTask}
            onSeeAlternatives={() => window.scrollTo({ top: 320, behavior: "smooth" })}
            onOpenFallback={handleFallbackOpen}
          />

          <AttentionPanel items={data.attentionItems} onOpenTask={openTask} onOpenWaiting={goToWaiting} />

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