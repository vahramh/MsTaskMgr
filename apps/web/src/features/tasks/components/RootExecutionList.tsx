import React from "react";
import type { Task } from "@tm/shared";
import { TaskNodeEditor } from "./TaskNodeEditor";
import { TaskNodeSummary } from "./TaskNodeSummary";
import { TaskQuickActions } from "./TaskQuickActions";
import type { TaskPresentationHelpers, TaskSurfaceActions } from "./taskRenderModels";
import type { SubtreeState } from "../hooks/useSubtreeController";

export function RootExecutionList({
  items,
  isExpanded,
  toggleExpand,
  getSubtree,
  subtrees,
  view,
  focusId,
  clearFocus,
  setFocus,
  renderChildren,
  renderExtraPanel,
  taskSurface,
  presentation,
  onOpenAttachPanel
}: {
  items: Task[];
  isExpanded: (taskId: string) => boolean;
  toggleExpand: (taskId: string) => Promise<void>;
  getSubtree: (taskId: string) => SubtreeState;
  subtrees: Record<string, SubtreeState>;
  view: string;
  focusId: string | null;
  clearFocus: () => void;
  setFocus: (taskId: string) => void;
  renderChildren: (taskId: string) => React.ReactNode;
  renderExtraPanel?: (task: Task) => React.ReactNode;
  taskSurface: TaskSurfaceActions;
  presentation: Required<Pick<TaskPresentationHelpers, "deriveState" | "deriveEntityType" | "dueTone" | "fmtDue" | "renderTaskStateBadge" | "formatTime" | "getHygieneSignals">>;
  onOpenAttachPanel?: (task: Task) => void;
}) {
  return (
    <div style={{ display: "grid", gap: 10 }}>
      {items.map((task) => (
        <RootExecutionItem
          key={task.taskId}
          task={task}
          pending={taskSurface.pendingFor(task)}
          isEditing={taskSurface.editor?.taskId === task.taskId}
          expandedHere={isExpanded(task.taskId)}
          childrenState={getSubtree(task.taskId)}
          hygieneSignals={presentation.getHygieneSignals(task, new Date())}
          toggleExpand={toggleExpand}
          subtrees={subtrees}
          view={view}
          focusId={focusId}
          clearFocus={clearFocus}
          setFocus={setFocus}
          renderChildren={renderChildren}
          extraPanel={renderExtraPanel?.(task)}
          taskSurface={taskSurface}
          presentation={presentation}
          onOpenAttachPanel={onOpenAttachPanel}
        />
      ))}
    </div>
  );
}

function RootExecutionItem({
  task,
  pending,
  isEditing,
  expandedHere,
  childrenState,
  hygieneSignals,
  toggleExpand,
  subtrees,
  view,
  focusId,
  clearFocus,
  setFocus,
  renderChildren,
  extraPanel,
  taskSurface,
  presentation,
  onOpenAttachPanel,
}: {
  task: Task;
  pending: boolean;
  isEditing: boolean;
  expandedHere: boolean;
  childrenState: SubtreeState;
  hygieneSignals: ReturnType<NonNullable<Required<Pick<TaskPresentationHelpers, "getHygieneSignals">>["getHygieneSignals"]>>;
  toggleExpand: (taskId: string) => Promise<void>;
  subtrees: Record<string, SubtreeState>;
  view: string;
  focusId: string | null;
  clearFocus: () => void;
  setFocus: (taskId: string) => void;
  renderChildren: (taskId: string) => React.ReactNode;
  extraPanel?: React.ReactNode;
  taskSurface: TaskSurfaceActions;
  presentation: Required<Pick<TaskPresentationHelpers, "deriveState" | "deriveEntityType" | "dueTone" | "fmtDue" | "renderTaskStateBadge" | "formatTime">>;
  onOpenAttachPanel?: (task: Task) => void;
}) {
  const isProject = presentation.deriveEntityType(task) === "project";
  const canAttachToProject = !task.parentTaskId && presentation.deriveEntityType(task) === "action" && presentation.deriveState(task) === "inbox";

  return (
    <div
      data-task-id={task.taskId}
      className="card task-card"
      data-state={presentation.deriveState(task)}
      data-entity={presentation.deriveEntityType(task)}
      style={{ padding: 14, borderLeft: presentation.dueTone(task.dueDate).border ? `4px solid ${presentation.dueTone(task.dueDate).border}` : undefined }}
    >
      <div className="content-actions-row">
        <div className="content-actions-main text-wrap">
          {isEditing ? (
            <TaskNodeEditor
              editor={taskSurface.editor}
              setEditor={taskSurface.setEditor}
              pending={pending}
              onCancel={() => taskSurface.setEditor(null)}
              onSave={() => void taskSurface.saveEditorForNode(task)}
              requireWorkflowFields
            />
          ) : (
            <TaskNodeSummary
              task={task}
              fmtDue={presentation.fmtDue}
              dueTone={presentation.dueTone}
              deriveState={presentation.deriveState}
              deriveEntityType={presentation.deriveEntityType}
              renderStateBadge={presentation.renderTaskStateBadge}
              expanded={expandedHere}
              onToggleExpand={() => void toggleExpand(task.taskId)}
              expandLabel={childrenState.loaded ? `(${childrenState.items.length})` : ""}
              hygieneSignals={hygieneSignals}
              showUpdatedAt
              formatTime={presentation.formatTime}
            />
          )}
        </div>

        <TaskQuickActions
          task={task}
          pending={pending}
          isAction={presentation.deriveEntityType(task) === "action"}
          currentState={presentation.deriveState(task)}
          onTransition={(item, state) => void taskSurface.quickTransition(item, state)}
          onToggleComplete={(item) => void taskSurface.toggleCompleteNode(item)}
          onEdit={taskSurface.startEdit}
          onDelete={(item) => {
            if (!window.confirm("Delete this task?")) return;
            void taskSurface.deleteNode(item);
          }}
          deleteTitle={subtrees[task.taskId]?.loaded && (subtrees[task.taskId]?.items?.length ?? 0) > 0 ? "This task has subtasks. Delete subtasks first." : undefined}
          deleteDisabled={pending || (subtrees[task.taskId]?.loaded && (subtrees[task.taskId]?.items?.length ?? 0) > 0)}
          completePrimary={presentation.deriveState(task) === "next" && task.status !== "COMPLETED"}
          focusAction={
            <>
              {canAttachToProject && onOpenAttachPanel ? (
                <button
                  type="button"
                  className="btn btn-secondary btn-compact"
                  onClick={() => onOpenAttachPanel(task)}
                  disabled={pending}
                  title="File this inbox item under an existing project"
                >
                  File under project
                </button>
              ) : null}

              {view === "projects" && isProject ? (
                focusId === task.taskId ? (
                  <button type="button" className="btn btn-secondary btn-compact" onClick={clearFocus} disabled={pending} title="Back to all projects">
                    Unfocus
                  </button>
                ) : (
                  <button type="button" className="btn btn-secondary btn-compact" onClick={() => setFocus(task.taskId)} disabled={pending} title="Focus this project">
                    Focus
                  </button>
                )
              ) : null}
            </>
          }
        />

        {extraPanel}
      </div>

      {expandedHere ? renderChildren(task.taskId) : null}
    </div>
  );
}
