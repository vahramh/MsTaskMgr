import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { Task, WorkflowState } from "@tm/shared";
import { useSpeechToText } from "../../hooks/useSpeechToText";
import { useAuth } from "../../auth/AuthContext";
import { getHygieneSignals } from "./hygiene";
import { TaskPageHeader } from "./components/TaskPageHeader";
import { TaskErrorAlert } from "./components/TaskErrorAlert";
import { TaskCreatePanel } from "./components/TaskCreatePanel";
import { ProjectWorkspace } from "./components/ProjectWorkspace";
import { FocusedProjectSummary } from "./components/FocusedProjectSummary";
import { RootExecutionList } from "./components/RootExecutionList";
import { TaskTree } from "./components/TaskTree";
import { TaskSharePanel } from "./components/TaskSharePanel";
import { InboxProjectAttachPanel } from "./components/InboxProjectAttachPanel";
import type { TaskPresentationHelpers, TaskSurfaceActions } from "./components/taskRenderModels";
import { useTasks } from "./useTasks";
import { useBucketTasks } from "./useBucketTasks";
import { useSubtreeController } from "./hooks/useSubtreeController";
import { useTaskPageNavigation, type FocusViewKey, type ViewKey } from "./hooks/useTaskPageNavigation";
import { useTaskSurfaceController } from "./hooks/useTaskSurfaceController";
import { useTaskCreateController } from "./hooks/useTaskCreateController";
import { useTaskShareController } from "./hooks/useTaskShareController";
import { deriveEntityType, deriveState, dueTone, fmtDue, formatTime, renderTaskStateBadge, stateLabel, TaskListSkeleton } from "./taskPresentation";
import { parseVoiceTaskCapture, promptDueDate, promptWaitingFor, speechErrorLabel } from "./voiceTaskCapture";
import { computeFocusedProjectDiagnostics } from "./projectDiagnostics";
import { createSubtask } from "./api";
import { useExecutionContexts } from "../contexts/useExecutionContexts";

async function tryCopy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // clipboard may be blocked
  }
}

export default function TasksPage() {
  const { tokens } = useAuth();
  const executionContexts = useExecutionContexts(tokens);
  const {
    items,
    hasMore,
    initialLoading,
    loadingMore,
    creating,
    pendingById,
    error,
    clearError,
    reload,
    loadMore,
    create,
    toggleCompleteTask,
    removeTask,
    patchTask,
  } = useTasks(tokens);

  const [searchParams, setSearchParams] = useSearchParams();
  const {
    view,
    focusId,
    focusView,
    scrollToId,
    editId,
    setView,
    setFocus,
    clearFocus,
    setFocusView,
    clearDeepLinkEdit,
  } = useTaskPageNavigation(searchParams, setSearchParams);

  const [attachTaskId, setAttachTaskId] = useState<string | null>(null);
  const [attachProjectId, setAttachProjectId] = useState("");
  const [attachTargetState, setAttachTargetState] = useState<WorkflowState>("next");
  const [attaching, setAttaching] = useState(false);

  const bucketView: WorkflowState | null = view === "projects" ? null : view;
  const {
    items: bucketItems,
    counts: bucketCounts,
    hasMore: bucketHasMore,
    initialLoading: bucketInitialLoading,
    loadingMore: bucketLoadingMore,
    error: bucketError,
    clearError: clearBucketError,
    reload: reloadBucket,
    reloadCounts: reloadBucketCounts,
    loadMore: loadMoreBucket,
  } = useBucketTasks(tokens, bucketView);

  const clearAllErrors = useCallback(() => {
    clearError();
    clearBucketError();
  }, [clearError, clearBucketError]);

  const refreshExecutionModel = useCallback(async () => {
    await reloadBucketCounts();
    if (view !== "projects") await reloadBucket();
  }, [reloadBucketCounts, view, reloadBucket]);

  const createController = useTaskCreateController({
    creating,
    contexts: executionContexts.items,
    onCreate: create,
    onAfterCreate: refreshExecutionModel,
  });

  const shareController = useTaskShareController(tokens);

  const VIEW_DEFS: Array<{ key: ViewKey; label: string }> = [
    { key: "inbox", label: "Inbox" },
    { key: "next", label: "Next" },
    { key: "waiting", label: "Waiting" },
    { key: "scheduled", label: "Scheduled" },
    { key: "someday", label: "Someday" },
    { key: "reference", label: "Reference" },
    { key: "completed", label: "Completed" },
    { key: "projects", label: "Projects" },
  ];

  const FOCUS_VIEW_DEFS: Array<{ key: FocusViewKey; label: string }> = [
    { key: "all", label: "All" },
    { key: "next", label: "Next" },
    { key: "waiting", label: "Waiting" },
    { key: "scheduled", label: "Scheduled" },
    { key: "inbox", label: "Inbox" },
    { key: "someday", label: "Someday" },
    { key: "reference", label: "Reference" },
    { key: "completed", label: "Completed" },
  ];

  const [subtaskSpeechParentId, setSubtaskSpeechParentId] = useState<string | null>(null);
  const subtaskSpeechParentIdRef = useRef<string | null>(null);
  const subtaskSpeech = useSpeechToText({
    lang: "en-AU",
    onResult: (text) => {
      const parsed = parseVoiceTaskCapture(text);
      const nextTitle = parsed.cleanTitle.trim();
      const parentId = subtaskSpeechParentIdRef.current;
      if (!parentId || !nextTitle) return;

      setNewChildTitle((previous) => ({
        ...previous,
        [parentId]: previous[parentId]?.trim() ? `${previous[parentId].trim()} ${nextTitle}`.trim() : nextTitle,
      }));
    },
  });

  const {
    subError,
    setSubError,
    subtrees,
    newChildTitle,
    setNewChildTitle,
    getSubtree,
    isExpanded,
    setExpandedOn,
    loadChildren,
    loadMoreChildren,
    toggleExpand,
    createChild,
    patchSubtreeNode,
    reopenSubtreeNode,
    deleteSubtreeNode,
    pendingForSubtask,
  } = useSubtreeController({
    tokens,
    clearAllErrors,
    refreshExecutionModel,
  });

  const {
    editor,
    setEditor,
    startEdit,
    saveEditorForNode,
    pendingFor,
    quickTransition,
    toggleCompleteNode,
    deleteNode,
  } = useTaskSurfaceController({
    tokens,
    pendingById,
    patchTask,
    toggleCompleteTask,
    removeTask,
    refreshExecutionModel,
    deriveState,
    deriveEntityType,
    promptWaitingFor: async (current?: string) => promptWaitingFor(current),
    promptDueDate: async (current?: string) => promptDueDate(current),
    patchSubtreeNode,
    reopenSubtreeNode,
    deleteSubtreeNode,
    pendingForSubtask,
    contexts: executionContexts.items,
  });

  const availableProjects = useMemo(
    () =>
      items
        .filter((task) => deriveEntityType(task) === "project" && !task.parentTaskId)
        .sort((a, b) => a.title.localeCompare(b.title)),
    [items]
  );

  const openAttachPanel = useCallback((task: Task) => {
    setAttachTaskId(task.taskId);
    setAttachProjectId("");
    setAttachTargetState("next");
  }, []);

  const closeAttachPanel = useCallback(() => {
    setAttachTaskId(null);
    setAttachProjectId("");
    setAttachTargetState("next");
  }, []);

  const attachInboxTaskToProject = useCallback(async (task: Task) => {
    if (!tokens) return;
    if (!attachProjectId) {
      alert("Select a project first.");
      return;
    }

    const targetProject = availableProjects.find((project) => project.taskId === attachProjectId);
    if (!targetProject) {
      alert("Selected project was not found.");
      return;
    }

    try {
      setAttaching(true);

      await createSubtask(tokens, targetProject.taskId, {
        title: task.title,
        description: task.description,
        dueDate: task.dueDate,
        priority: task.priority,
        effort: task.effort,
        estimatedMinutes: task.estimatedMinutes,
        remainingMinutes: task.remainingMinutes,
        timeSpentMinutes: task.timeSpentMinutes,
        minimumDuration: task.minimumDuration,
        attrs: task.attrs,
        entityType: "action",
        state: attachTargetState,
        context: task.context,
        waitingFor: attachTargetState === "waiting" ? task.waitingFor : undefined,
      });

      await removeTask(task);
      await loadChildren(targetProject.taskId, true);
      await refreshExecutionModel();
      closeAttachPanel();
    } catch (error: any) {
      alert(error?.message ?? "Failed to file task under project.");
    } finally {
      setAttaching(false);
    }
  }, [
    tokens,
    attachProjectId,
    attachTargetState,
    availableProjects,
    removeTask,
    loadChildren,
    refreshExecutionModel,
    closeAttachPanel,
  ]);

  const focusedProject = useMemo(() => {
    if (!focusId) return null;
    return items.find((task) => task.taskId === focusId) ?? null;
  }, [items, focusId]);

  const focusCounts = useMemo(() => {
    const counts: Record<FocusViewKey, number> = {
      all: 0,
      inbox: 0,
      next: 0,
      waiting: 0,
      scheduled: 0,
      someday: 0,
      reference: 0,
      completed: 0,
    };
    if (!focusId) return counts;
    const subtree = subtrees[focusId];
    const list = subtree?.items ?? [];
    counts.all = list.length;
    for (const task of list) {
      const state = deriveState(task);
      counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
  }, [focusId, subtrees]);

  const focusedProjectDiagnostics = useMemo(() => {
    if (!focusedProject || !focusId) return null;
    const subtree = subtrees[focusId];
    return computeFocusedProjectDiagnostics(focusedProject, subtree?.items ?? [], new Date());
  }, [focusedProject, focusId, subtrees]);


  const taskIndex = useMemo(() => {
    const map = new Map<string, Task>();
    for (const task of items) map.set(task.taskId, task);
    for (const subtree of Object.values(subtrees)) {
      for (const task of subtree.items) map.set(task.taskId, task);
    }
    return map;
  }, [items, subtrees]);

  const getBlockerOptions = useCallback((task: Task) => {
    if (!task.parentTaskId) return [] as Array<{ taskId: string; title: string }>;

    let current: Task | undefined = task;
    let rootProjectId: string | undefined;
    while (current?.parentTaskId) {
      const parent = taskIndex.get(current.parentTaskId);
      if (!parent) break;
      if (deriveEntityType(parent) === "project" && !parent.parentTaskId) {
        rootProjectId = parent.taskId;
        break;
      }
      current = parent;
    }
    if (!rootProjectId) return [] as Array<{ taskId: string; title: string }>;

    const descendants = new Set<string>();
    const collectDescendants = (parentId: string) => {
      const subtree = subtrees[parentId];
      for (const child of subtree?.items ?? []) {
        if (!descendants.has(child.taskId)) {
          descendants.add(child.taskId);
          collectDescendants(child.taskId);
        }
      }
    };
    collectDescendants(task.taskId);

    const projectItems: Task[] = [];
    const seen = new Set<string>();
    const walkProject = (parentId: string) => {
      for (const child of subtrees[parentId]?.items ?? []) {
        if (seen.has(child.taskId)) continue;
        seen.add(child.taskId);
        projectItems.push(child);
        walkProject(child.taskId);
      }
    };
    walkProject(rootProjectId);

    return projectItems
      .filter((candidate) =>
        candidate.taskId !== task.taskId &&
        !descendants.has(candidate.taskId) &&
        deriveEntityType(candidate) === "action" &&
        !["completed", "reference", "someday"].includes(deriveState(candidate))
      )
      .map((candidate) => ({ taskId: candidate.taskId, title: candidate.title }))
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [taskIndex, deriveEntityType, deriveState, subtrees]);
  const taskPresentation = useMemo<TaskPresentationHelpers>(() => ({
    deriveState,
    deriveEntityType,
    dueTone,
    fmtDue,
    renderTaskStateBadge,
    formatTime,
    getHygieneSignals,
  }), []);

  const taskSurface = useMemo<TaskSurfaceActions>(() => ({
    pendingFor,
    editor,
    setEditor,
    saveEditorForNode,
    startEdit,
    quickTransition,
    toggleCompleteNode,
    deleteNode,
  }), [pendingFor, editor, setEditor, saveEditorForNode, startEdit, quickTransition, toggleCompleteNode, deleteNode]);

  useEffect(() => {
    if (subtaskSpeech.state !== "listening" && subtaskSpeechParentIdRef.current) {
      subtaskSpeechParentIdRef.current = null;
      setSubtaskSpeechParentId(null);
    }
  }, [subtaskSpeech.state]);

  useEffect(() => {
    if (!focusId) return;
    if (view !== "projects") return;
    void loadChildren(focusId);
    setExpandedOn(focusId, true);
  }, [focusId, view, loadChildren, setExpandedOn]);

  useEffect(() => {
    if (!editId) return;

    const direct = items.find((task) => task.taskId === editId);
    if (direct) {
      if (editor?.taskId !== direct.taskId) startEdit(direct);
      clearDeepLinkEdit();
      return;
    }

    for (const subtree of Object.values(subtrees)) {
      const nested = subtree.items.find((task) => task.taskId === editId);
      if (!nested) continue;
      if (editor?.taskId !== nested.taskId) startEdit(nested);
      clearDeepLinkEdit();
      return;
    }
  }, [editId, items, subtrees, editor?.taskId, clearDeepLinkEdit, startEdit]);

  const toggleSubtaskSpeech = useCallback((parentTaskId: string) => {
    if (!subtaskSpeech.supported) return;

    const isListeningHere = subtaskSpeech.state === "listening" && subtaskSpeechParentIdRef.current === parentTaskId;
    if (isListeningHere) {
      subtaskSpeech.stop();
      subtaskSpeechParentIdRef.current = null;
      setSubtaskSpeechParentId(null);
      return;
    }

    subtaskSpeechParentIdRef.current = parentTaskId;
    setSubtaskSpeechParentId(parentTaskId);
    subtaskSpeech.reset();
    subtaskSpeech.start();
  }, [subtaskSpeech]);

  const renderChildren = useCallback((parentTaskId: string, depth: number, options?: { filterState?: WorkflowState | "all" }) => (
    <TaskTree
      parentTaskId={parentTaskId}
      depth={depth}
      filterState={options?.filterState ?? "all"}
      getSubtree={getSubtree}
      newChildTitle={newChildTitle}
      setNewChildTitle={setNewChildTitle}
      tokensPresent={Boolean(tokens)}
      createChild={createChild}
      loadChildren={loadChildren}
      loadMoreChildren={loadMoreChildren}
      isExpanded={isExpanded}
      toggleExpand={toggleExpand}
      subtrees={subtrees}
      view={view}
      taskSurface={taskSurface}
      presentation={taskPresentation}
      subtaskSpeech={subtaskSpeech}
      subtaskSpeechParentId={subtaskSpeechParentId}
      toggleSubtaskSpeech={toggleSubtaskSpeech}
      speechErrorLabel={speechErrorLabel}
      getBlockerOptions={getBlockerOptions}
      contexts={executionContexts.items}
    />
  ), [
    getSubtree,
    newChildTitle,
    setNewChildTitle,
    tokens,
    createChild,
    loadChildren,
    loadMoreChildren,
    isExpanded,
    toggleExpand,
    subtrees,
    view,
    taskSurface,
    taskPresentation,
    subtaskSpeech,
    subtaskSpeechParentId,
    toggleSubtaskSpeech,
    getBlockerOptions,
  ]);

  const viewCounts = useMemo(() => ({
    inbox: bucketCounts.inbox ?? 0,
    next: bucketCounts.next ?? 0,
    waiting: bucketCounts.waiting ?? 0,
    scheduled: bucketCounts.scheduled ?? 0,
    someday: bucketCounts.someday ?? 0,
    reference: bucketCounts.reference ?? 0,
    completed: bucketCounts.completed ?? 0,
    projects: items.filter((task) => deriveEntityType(task) === "project" && !task.parentTaskId).length,
  }), [bucketCounts, items]);

  const visibleItems = useMemo(() => {
    if (view !== "projects") return bucketItems;
    const projects = items.filter((task) => deriveEntityType(task) === "project" && !task.parentTaskId);
    return focusId ? projects.filter((project) => project.taskId === focusId) : projects;
  }, [items, bucketItems, view, focusId]);

  const pageInitialLoading = view === "projects" ? initialLoading : bucketInitialLoading;
  const pageLoadingMore = view === "projects" ? loadingMore : bucketLoadingMore;
  const pageHasMore = view === "projects" ? hasMore : bucketHasMore;
  const pageLoadMore = view === "projects" ? loadMore : loadMoreBucket;
  const empty = !pageInitialLoading && visibleItems.length === 0;
  const activeError = error ?? bucketError;

  useEffect(() => {
    if (!scrollToId) return;
    const element = document.querySelector(`[data-task-id="${CSS.escape(scrollToId)}"]`) as HTMLElement | null;
    if (!element) return;
    window.requestAnimationFrame(() => element.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [scrollToId, visibleItems.length, subtrees]);

  const pageTitle = view === "projects"
    ? focusId && focusedProject ? `Project: ${focusedProject.title}` : "Projects"
    : stateLabel(view);

  return (
    <div className="card">
      <TaskPageHeader
        title={pageTitle}
        subtitle="Quick, pragmatic, and safe-by-default."
        view={view}
        viewDefs={VIEW_DEFS}
        viewCounts={viewCounts}
        focusLabel={view === "projects" && focusId ? focusedProject?.title ?? focusId : null}
        onClearFocus={view === "projects" && focusId ? clearFocus : undefined}
        onSelectView={setView}
        onRefresh={() => {
          void (view === "projects" ? reload() : reloadBucket());
          void reloadBucketCounts();
        }}
        refreshDisabled={pageInitialLoading || pageLoadingMore || creating}
      />

      {activeError ? (
        <TaskErrorAlert
          error={activeError}
          onDismiss={clearAllErrors}
          onRetry={() => {
            void reload();
            if (view !== "projects") void reloadBucket();
            void reloadBucketCounts();
          }}
          onCopyRequestId={(requestId) => {
            void tryCopy(requestId);
          }}
        />
      ) : null}

      {subError ? (
        <TaskErrorAlert
          error={subError}
          onDismiss={() => setSubError(null)}
          onCopyRequestId={(requestId) => {
            void tryCopy(requestId);
          }}
        />
      ) : null}

      {!(view === "projects" && focusId) ? (
        <div style={{ marginTop: 12 }}>
          {!createController.state.showCreate ? (
            <button type="button" className="btn btn-primary" onClick={() => createController.actions.setShowCreate(true)}>
              New task
            </button>
          ) : null}
        </div>
      ) : null}

      <TaskCreatePanel
        visible={!(view === "projects" && focusId) && createController.state.showCreate}
        creating={creating}
        title={createController.state.title}
        description={createController.state.description}
        dueDate={createController.state.dueDate}
        priority={createController.state.priority}
        effortValue={createController.state.effortValue}
        effortUnit={createController.state.effortUnit}
        estimatedMinutes={createController.state.estimatedMinutes}
        remainingMinutes={createController.state.remainingMinutes}
        timeSpentMinutes={createController.state.timeSpentMinutes}
        minimumDurationValue={createController.state.minimumDurationValue}
        minimumDurationUnit={createController.state.minimumDurationUnit}
        attrsJson={createController.state.attrsJson}
        captureSource={createController.state.captureSource}
        advancedOpen={createController.state.advancedOpen}
        createEntityType={createController.state.createEntityType}
        createState={createController.state.createState}
        createContextIds={createController.state.createContextIds}
        contexts={executionContexts.items}
        createWaitingFor={createController.state.createWaitingFor}
        createWaitingForTaskId={createController.state.createWaitingForTaskId}
        createWaitingForTaskTitle={createController.state.createWaitingForTaskTitle}
        createResumeStateAfterWait={createController.state.createResumeStateAfterWait}
        blockerOptions={[]}
        titleError={createController.derived.titleError}
        descriptionError={createController.derived.descriptionError}
        attrsError={createController.derived.attrsError}
        progressError={createController.derived.progressError}
        gtdCreateError={createController.derived.gtdCreateError}
        canCreate={createController.derived.canCreate}
        descTrimLength={createController.derived.descTrim.length}
        speech={createController.speech}
        titleRef={createController.refs.titleRef}
        onSubmit={createController.actions.submit}
        onCancel={() => createController.actions.setShowCreate(false)}
        onTitleChange={createController.actions.setTitle}
        onDescriptionChange={createController.actions.setDescription}
        onDueDateChange={createController.actions.setDueDate}
        onPriorityChange={createController.actions.setPriority}
        onEffortValueChange={createController.actions.setEffortValue}
        onEffortUnitChange={createController.actions.setEffortUnit}
        onEstimatedMinutesChange={createController.actions.setEstimatedMinutes}
        onRemainingMinutesChange={createController.actions.setRemainingMinutes}
        onTimeSpentMinutesChange={createController.actions.setTimeSpentMinutes}
        onMinimumDurationValueChange={createController.actions.setMinimumDurationValue}
        onMinimumDurationUnitChange={createController.actions.setMinimumDurationUnit}
        onAttrsJsonChange={createController.actions.setAttrsJson}
        onCaptureSourceChange={createController.actions.setCaptureSource}
        onAdvancedOpenChange={createController.actions.setAdvancedOpen}
        onCreateEntityTypeChange={createController.actions.setCreateEntityType}
        onCreateStateChange={createController.actions.setCreateState}
        onToggleContextToken={createController.actions.toggleContextToken}
        onCreateWaitingForChange={createController.actions.setCreateWaitingFor}
        onCreateWaitingForTaskIdChange={createController.actions.setCreateWaitingForTaskId}
        onCreateWaitingForTaskTitleChange={createController.actions.setCreateWaitingForTaskTitle}
        onCreateResumeStateAfterWaitChange={createController.actions.setCreateResumeStateAfterWait}
        speechErrorLabel={speechErrorLabel}
      />

      <div style={{ marginTop: 16 }}>
        {pageInitialLoading ? (
          <TaskListSkeleton count={4} />
        ) : view === "projects" && focusId ? (
          <ProjectWorkspace
            focusId={focusId}
            focusView={focusView}
            focusCounts={focusCounts}
            focusViewDefs={FOCUS_VIEW_DEFS}
            onSelectFocusView={setFocusView}
            onRefresh={() => {
              void loadChildren(focusId, true);
            }}
            refreshDisabled={!tokens}
            projectSummary={focusedProject ? (
              <FocusedProjectSummary
                task={focusedProject}
                pending={pendingFor(focusedProject)}
                isEditing={editor?.taskId === focusedProject.taskId}
                editor={editor}
                setEditor={setEditor}
                saveEditorForNode={saveEditorForNode}
                onEdit={startEdit}
                helpers={taskPresentation}
                hygieneSignals={getHygieneSignals(focusedProject, new Date())}
                diagnostics={focusedProjectDiagnostics}
                getBlockerOptions={getBlockerOptions}
                contexts={executionContexts.items}
              />
            ) : null}
          >
            {renderChildren(focusId, 1, { filterState: focusView })}
          </ProjectWorkspace>
        ) : empty ? (
          <div className="card" style={{ padding: 18, textAlign: "left" }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>No tasks yet</div>
            <div className="help" style={{ marginBottom: 10 }}>
              Add your first task above. Keep it short; you can edit later.
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                createController.refs.titleRef.current?.focus();
                createController.refs.titleRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Create your first task
            </button>
          </div>
        ) : (
          <RootExecutionList
            items={visibleItems}
            isExpanded={isExpanded}
            toggleExpand={toggleExpand}
            getSubtree={getSubtree}
            subtrees={subtrees}
            view={view}
            focusId={focusId}
            clearFocus={clearFocus}
            setFocus={setFocus}
            renderChildren={(taskId) => renderChildren(taskId, 1)}
            onOpenAttachPanel={openAttachPanel}
            renderExtraPanel={(task) => (
              <>
                {attachTaskId === task.taskId ? (
                  <InboxProjectAttachPanel
                    task={task}
                    projects={availableProjects}
                    selectedProjectId={attachProjectId}
                    targetState={attachTargetState}
                    pending={attaching}
                    onClose={closeAttachPanel}
                    onProjectChange={setAttachProjectId}
                    onTargetStateChange={setAttachTargetState}
                    onSubmit={() => void attachInboxTaskToProject(task)}
                  />
                ) : null}

                {shareController.shareFor === task.taskId ? (
                  <TaskSharePanel
                    shares={shareController.shares}
                    sharesLoading={shareController.sharesLoading}
                    sharesError={shareController.sharesError}
                    shareGranteeSub={shareController.shareGranteeSub}
                    shareMode={shareController.shareMode}
                    onClose={shareController.closeShares}
                    onDismissError={() => shareController.setSharesError(null)}
                    onShareGranteeSubChange={shareController.setShareGranteeSub}
                    onShareModeChange={shareController.setShareMode}
                    onSubmitShare={() => void shareController.submitShare(task.taskId)}
                    onRemoveShare={(granteeSub) => void shareController.removeShare(task.taskId, granteeSub)}
                  />
                ) : null}
              </>
            )}
            taskSurface={taskSurface}
            presentation={{
              deriveState,
              deriveEntityType,
              dueTone,
              fmtDue,
              renderTaskStateBadge,
              formatTime,
              getHygieneSignals,
            }}
            getBlockerOptions={getBlockerOptions}
            contexts={executionContexts.items}
          />
        )}
      </div>

      <div className="row space-between" style={{ marginTop: 14 }}>
        <div className="help">
          {visibleItems.length ? `${visibleItems.length} task${visibleItems.length === 1 ? "" : "s"}` : ""}
        </div>
        <div>
          {pageHasMore ? (
            <button className="btn" onClick={pageLoadMore} disabled={pageLoadingMore || pageInitialLoading}>
              {pageLoadingMore ? "Loading…" : "Load more"}
            </button>
          ) : (
            <span className="help">{visibleItems.length ? "End of list" : ""}</span>
          )}
        </div>
      </div>
    </div>
  );
}
