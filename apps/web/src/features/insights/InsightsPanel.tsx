import { useEffect, useMemo, useState } from "react";
import type { InsightSuggestion, InsightsResponse, TodayTask, UpdateTaskRequest } from "@tm/shared";
import { ApiError } from "../../api/http";
import { useAuth } from "../../auth/AuthContext";
import InlineAlert from "../../components/InlineAlert";
import {
  createSharedSubtask,
  createSubtask,
  updateSharedRoot,
  updateSharedSubtask,
  updateTask,
  updateSubtask,
} from "../tasks/api";
import { getInsights } from "./api";

function toUiError(e: unknown): { message: string; requestId?: string; code?: string; status?: number } {
  if (e instanceof ApiError) {
    return { message: e.message, requestId: e.requestId, code: e.code, status: e.status };
  }
  if (e && typeof e === "object") {
    const any = e as { message?: string };
    return { message: any.message ?? String(e) };
  }
  return { message: String(e) };
}

function taskPath(task: TodayTask): string {
  const projectId = task.entityType === "project" && !task.parentTaskId ? task.taskId : (task.sharedMeta?.rootTaskId ?? task.parentTaskId ?? task.taskId);
  return `/app/tasks?view=projects&focus=${encodeURIComponent(projectId)}&pview=all&scrollTo=${encodeURIComponent(projectId)}`;
}

async function patchTask(tokens: NonNullable<ReturnType<typeof useAuth>["tokens"]>, task: TodayTask, patch: UpdateTaskRequest) {
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

async function createProjectAction(tokens: NonNullable<ReturnType<typeof useAuth>["tokens"]>, project: TodayTask, title: string) {
  const req = { title, entityType: "action" as const, state: "next" as const };
  if (project.source === "shared" && project.sharedMeta) {
    if (project.sharedMeta.mode !== "EDIT") throw new Error("This shared project is view-only.");
    return createSharedSubtask(tokens, project.sharedMeta.ownerSub, project.sharedMeta.rootTaskId, project.taskId, req);
  }
  return createSubtask(tokens, project.taskId, req);
}

function actionLabel(s: InsightSuggestion): string {
  switch (s.recommendedAction) {
    case "set_next": return "Set Next";
    case "create_next_action": return "Create Next Action";
    case "add_context": return "Add Context";
    case "add_effort": return "Add Effort";
    case "set_due_date": return "Set Due Date";
    case "set_waiting_followup": return "Update Follow-up";
    case "open_task":
    default:
      return "Open Task";
  }
}

function canEditSuggestion(s: InsightSuggestion): boolean {
  const target = s.task ?? s.project;
  if (!target) return false;
  if (target.source !== "shared") return true;
  return target.sharedMeta?.mode === "EDIT";
}

export default function InsightsPanel({
  includeShared,
  title = "Guided actions",
  subtitle = "Deterministic recommendations to tighten the system and unblock execution.",
  onActionComplete,
}: {
  includeShared: boolean;
  title?: string;
  subtitle?: string;
  onActionComplete?: () => void;
}) {
  const { tokens } = useAuth();
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; requestId?: string; code?: string; status?: number } | null>(null);

  const refresh = () => {
    if (!tokens) return;
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    getInsights(tokens, includeShared, ac.signal)
      .then(setData)
      .catch((e) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(toUiError(e));
      })
      .finally(() => setLoading(false));
    return () => ac.abort();
  };

  useEffect(() => refresh(), [tokens, includeShared]);

  const suggestions = useMemo(() => data?.suggestions ?? [], [data]);

  async function handlePrimary(suggestion: InsightSuggestion) {
    if (!tokens) return;
    const task = suggestion.task;
    const project = suggestion.project;
    try {
      setPendingId(suggestion.id);
      setError(null);
      switch (suggestion.recommendedAction) {
        case "set_next":
          if (!task) return;
          await patchTask(tokens, task, { state: "next" });
          break;
        case "add_context":
          if (!task) return;
          {
            const value = window.prompt(`Context for "${task.title}"`, task.context ?? "@computer");
            if (!value) return;
            await patchTask(tokens, task, { context: value.trim() });
          }
          break;
        case "add_effort":
          if (!task) return;
          await patchTask(tokens, task, { effort: { unit: "hours", value: 0.25 } });
          break;
        case "set_due_date":
        case "set_waiting_followup":
          if (!task) return;
          {
            const initial = task.dueDate ? task.dueDate.slice(0, 10) : new Date().toISOString().slice(0, 10);
            const value = window.prompt(`Due date for "${task.title}" (YYYY-MM-DD)`, initial);
            if (!value) return;
            await patchTask(tokens, task, { dueDate: value.trim() });
          }
          break;
        case "create_next_action":
          if (!project) return;
          {
            const title = window.prompt(`Next action for project "${project.title}"`, "Define next concrete step");
            if (!title) return;
            await createProjectAction(tokens, project, title.trim());
          }
          break;
        case "open_task":
        default:
          window.location.assign(task ? taskPath(task) : project ? taskPath(project) : "/app/tasks");
          return;
      }
      refresh();
      onActionComplete?.();
    } catch (e) {
      setError(toUiError(e));
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 18, fontWeight: 800 }}>{title}</div>
      <div className="help" style={{ marginTop: 4, marginBottom: 12 }}>{subtitle}</div>

      {error ? (
        <div style={{ marginBottom: 12 }}>
          <InlineAlert
            tone="error"
            title={error.message}
            message={[typeof error.status === "number" ? `HTTP ${error.status}` : null, error.code].filter(Boolean).join(" · ") || undefined}
            actions={<button className="btn btn-secondary btn-compact" type="button" onClick={() => setError(null)}>Dismiss</button>}
          />
        </div>
      ) : null}

      {loading ? <div className="help">Loading insights…</div> : null}
      {!loading && !suggestions.length ? <div className="help">No guided actions right now. The system looks clean.</div> : null}

      {!loading && suggestions.length ? (
        <div style={{ display: "grid", gap: 10 }}>
          {suggestions.slice(0, 8).map((suggestion) => {
            const target = suggestion.task ?? suggestion.project;
            const editable = canEditSuggestion(suggestion);
            return (
              <div key={suggestion.id} className="today-task-card" style={{ padding: 12 }}>
                <div className="row space-between" style={{ gap: 10, alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 700 }}>{suggestion.title}</div>
                    <div className="help" style={{ marginTop: 4 }}>{suggestion.reason}</div>
                    <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <span className="pill">Score {suggestion.score}</span>
                      <span className="pill">{suggestion.type}</span>
                      {target?.source === "shared" ? <span className="pill">{editable ? "Shared · edit" : "Shared · view"}</span> : null}
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    {suggestion.recommendedAction !== "open_task" ? (
                      <button
                        type="button"
                        className="btn btn-primary btn-compact"
                        disabled={!editable || pendingId === suggestion.id}
                        onClick={() => handlePrimary(suggestion)}
                        title={!editable ? "View-only shared task" : undefined}
                      >
                        {pendingId === suggestion.id ? "Working…" : actionLabel(suggestion)}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="btn btn-secondary btn-compact"
                      onClick={() => window.location.assign(target ? taskPath(target) : "/app/tasks")}
                    >
                      Open in Tasks
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
