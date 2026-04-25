import React from "react";
import type { ExecutionContext, Task, WorkflowState } from "@tm/shared";
import { useSpeechToText } from "../../../hooks/useSpeechToText";
import { TaskNodeEditor } from "./TaskNodeEditor";
import { TaskNodeSummary } from "./TaskNodeSummary";
import { TaskQuickActions } from "./TaskQuickActions";
import type { TaskPresentationHelpers, TaskSurfaceActions } from "./taskRenderModels";
import type { SubtreeState } from "../hooks/useSubtreeController";

type SpeechController = ReturnType<typeof useSpeechToText>;

export type TaskTreeProps = {
  parentTaskId: string;
  depth: number;
  filterState?: WorkflowState | "all";
  getSubtree: (taskId: string) => SubtreeState;
  newChildTitle: Record<string, string>;
  setNewChildTitle: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  tokensPresent: boolean;
  createChild: (parentTaskId: string) => Promise<void>;
  loadChildren: (parentTaskId: string, force?: boolean) => Promise<void>;
  loadMoreChildren: (parentTaskId: string) => Promise<void>;
  isExpanded: (taskId: string) => boolean;
  toggleExpand: (taskId: string) => Promise<void>;
  subtrees: Record<string, SubtreeState>;
  view: string;
  taskSurface: TaskSurfaceActions;
  presentation: TaskPresentationHelpers;
  subtaskSpeech: SpeechController;
  subtaskSpeechParentId: string | null;
  toggleSubtaskSpeech: (parentTaskId: string) => void;
  speechErrorLabel: (error: string | null) => string;
  getBlockerOptions: (task: Task) => Array<{ taskId: string; title: string }>;
  contexts: ExecutionContext[];
  onOpenProject?: (projectId: string) => void;
};

export function TaskTree(props: TaskTreeProps) {
  return <TaskTreeNode {...props} parentTaskId={props.parentTaskId} depth={props.depth} filterState={props.filterState ?? "all"} />;
}

function TaskTreeNode({ parentTaskId, depth, filterState = "all", ...props }: TaskTreeProps) {
  const subtree = props.getSubtree(parentTaskId);
  const paddingLeft = Math.min(depth * 18, 72);
  const filteredItems = filterState === "all"
    ? subtree.items
    : subtree.items.filter((item) => props.presentation.deriveState(item) === filterState);

  return (
    <div className="tree-wrap" style={{ marginTop: 10, paddingLeft }}>
      <div className="card subtasks-card" style={{ padding: 12, background: "#f9fafb" }}>
        <div className="row space-between" style={{ marginBottom: 8 }}>
          <div style={{ fontWeight: 700 }}>Subtasks</div>
          <div className="help">
            {subtree.loading
              ? "Loading…"
              : subtree.loaded
                ? `${filteredItems.length} shown / ${subtree.items.length} total${subtree.nextToken ? " (more)" : ""}`
                : ""}
          </div>
        </div>

        <div className="row" style={{ gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
          <div className="speech-input-row" style={{ minWidth: 240, flex: "1 1 320px" }}>
            <input
              className="input"
              style={{ minWidth: 240 }}
              placeholder="Add a subtask…"
              value={props.newChildTitle[parentTaskId] ?? ""}
              onChange={(event) => props.setNewChildTitle((previous) => ({ ...previous, [parentTaskId]: event.target.value }))}
            />

            {props.subtaskSpeech.supported ? (
              <button
                type="button"
                className={`btn btn-secondary speech-mic-btn${props.subtaskSpeech.state === "listening" && props.subtaskSpeechParentId === parentTaskId ? " is-listening" : ""}`}
                onClick={() => props.toggleSubtaskSpeech(parentTaskId)}
                aria-label={props.subtaskSpeech.state === "listening" && props.subtaskSpeechParentId === parentTaskId ? "Stop voice input" : "Start voice input"}
                title={props.subtaskSpeech.state === "listening" && props.subtaskSpeechParentId === parentTaskId ? "Stop voice input" : "Speak subtask title"}
              >
                {props.subtaskSpeech.state === "listening" && props.subtaskSpeechParentId === parentTaskId ? "●" : "🎤"}
              </button>
            ) : null}
          </div>

          <button type="button" className="btn" onClick={() => void props.createChild(parentTaskId)} disabled={!props.tokensPresent || !(props.newChildTitle[parentTaskId] ?? "").trim().length}>
            Add
          </button>

          <button type="button" className="btn btn-secondary" onClick={() => void props.loadChildren(parentTaskId, true)} disabled={!props.tokensPresent || subtree.loading}>
            Refresh
          </button>

          {subtree.nextToken ? (
            <button type="button" className="btn btn-secondary" onClick={() => void props.loadMoreChildren(parentTaskId)} disabled={!props.tokensPresent || subtree.loading || subtree.loadingMore}>
              {subtree.loadingMore ? "Loading…" : "Load more"}
            </button>
          ) : null}
        </div>

        {props.subtaskSpeech.supported && props.subtaskSpeech.state === "listening" && props.subtaskSpeechParentId === parentTaskId ? (
          <div className="help" style={{ marginBottom: 8 }}>Listening… speak the subtask title.</div>
        ) : null}

        {props.subtaskSpeech.supported && props.subtaskSpeech.error && props.subtaskSpeechParentId === parentTaskId ? (
          <div className="help" style={{ marginBottom: 8, color: "#991b1b" }}>{props.speechErrorLabel(props.subtaskSpeech.error)}</div>
        ) : null}

        {subtree.loading && !subtree.loaded ? (
          <div className="help">Loading subtasks…</div>
        ) : subtree.loaded && subtree.items.length === 0 ? (
          <div className="help">No subtasks yet.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {filteredItems.map((task) => {
              const pending = props.taskSurface.pendingFor(task);
              const isEditing = props.taskSurface.editor?.taskId === task.taskId;
              const expandedHere = props.isExpanded(task.taskId);

              return (
                <div key={task.taskId} className="tree-wrap" style={{ paddingLeft: 14 }}>
                  <div
                    className="card task-card"
                    data-state={props.presentation.deriveState(task)}
                    data-entity={props.presentation.deriveEntityType(task)}
                    style={{
                      padding: 12,
                      borderLeft: props.presentation.dueTone(task.dueDate).border ? `4px solid ${props.presentation.dueTone(task.dueDate).border}` : undefined,
                      opacity: task.taskId.startsWith("temp-") ? 0.7 : 1,
                    }}
                  >
                    <div className="content-actions-row">
                      <div className="content-actions-main text-wrap">
                        {isEditing ? (
                          <TaskNodeEditor
                            editor={props.taskSurface.editor}
                            setEditor={props.taskSurface.setEditor}
                            pending={pending}
                            onCancel={() => props.taskSurface.setEditor(null)}
                            onSave={() => void props.taskSurface.saveEditorForNode(task)}
                            blockerOptions={props.getBlockerOptions(task)}
                            contexts={props.contexts}
                          />
                        ) : (
                          <TaskNodeSummary
                            task={task}
                            fmtDue={props.presentation.fmtDue}
                            dueTone={props.presentation.dueTone}
                            deriveState={props.presentation.deriveState}
                            deriveEntityType={props.presentation.deriveEntityType}
                            renderStateBadge={props.presentation.renderTaskStateBadge}
                            expanded={expandedHere}
                            onToggleExpand={() => void props.toggleExpand(task.taskId)}
                            expandLabel=""
                            contexts={props.contexts}
                            onOpenProject={props.onOpenProject}
                          />
                        )}
                      </div>

                      <TaskQuickActions
                        task={task}
                        pending={pending}
                        isAction={props.presentation.deriveEntityType(task) === "action"}
                        currentState={props.presentation.deriveState(task)}
                        onTransition={(item, state) => void props.taskSurface.quickTransition(item, state)}
                        onToggleComplete={(item) => void props.taskSurface.toggleCompleteNode(item)}
                        onEdit={props.taskSurface.startEdit}
                        onDelete={(item) => {
                          if (!window.confirm("Delete this subtask?")) return;
                          void props.taskSurface.deleteNode(item);
                        }}
                        deleteTitle={props.subtrees[task.taskId]?.loaded && (props.subtrees[task.taskId]?.items?.length ?? 0) > 0 ? "This subtask has subtasks. Delete subtasks first." : undefined}
                        deleteDisabled={pending || (props.subtrees[task.taskId]?.loaded && (props.subtrees[task.taskId]?.items?.length ?? 0) > 0)}
                        completePrimary={props.view === "next" && task.status !== "COMPLETED"}
                      />
                    </div>

                    {expandedHere ? <TaskTreeNode {...props} parentTaskId={task.taskId} depth={depth + 1} filterState="all" /> : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
