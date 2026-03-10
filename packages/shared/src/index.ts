export type HealthResponse = {
  ok: true;
  service: "api";
  time: string;
};

export type TaskStatus = "OPEN" | "COMPLETED";

/**
 * Phase 4 (GTD): First-class workflow state (mutually exclusive).
 * These are enforced domain states (NOT tags).
 */
export type WorkflowState =
  | "inbox"
  | "next"
  | "waiting"
  | "scheduled"
  | "someday"
  | "reference"
  | "completed";

/**
 * Phase 4 (GTD): Entity type.
 */
export type EntityType = "project" | "action";

/** 1 (lowest) .. 5 (highest) */
export type TaskPriority = 1 | 2 | 3 | 4 | 5;

export type EffortUnit = "hours" | "days";
export type DurationUnit = "minutes" | "hours";

export type EffortEstimate = {
  unit: EffortUnit;
  value: number; // positive finite
};

export type DurationEstimate = {
  unit: DurationUnit;
  value: number; // positive finite
};

export type TaskAttrValue = string | number | boolean | string[];

export type TaskAttributes = Record<string, TaskAttrValue>;

export type Task = {
  taskId: string;

  /** Present when this task is a subtask of another task node. */
  parentTaskId?: string;
  title: string;
  description?: string;

  /** Legacy status retained for compatibility. In Phase 4+, server derives it from `state`. */
  status: TaskStatus;

  // ----------------------------------------------------------------------
  // Phase 4: GTD-native domain fields

  /** Schema version marker for GTD v2 items. */
  schemaVersion?: 2;

  /** Entity type (project|action). Required for v2 items; defaulted during migration. */
  entityType?: EntityType;

  /** Workflow state. Required for v2 items; derived from legacy fields during migration. */
  state?: WorkflowState;

  /** Optional context string (e.g. "@home"). */
  context?: string;

  /** Required when state === "waiting". */
  waitingFor?: string;

  // ----------------------------------------------------------------------

  /** ISO-8601 date or datetime (e.g. 2026-03-10 or 2026-03-10T12:00:00Z) */
  dueDate?: string;

  priority?: TaskPriority;

  effort?: EffortEstimate;

  /** Smallest uninterrupted block worth starting this task. */
  minimumDuration?: DurationEstimate;

  /** User-defined attributes (small, bounded values). */
  attrs?: TaskAttributes;

  createdAt: string; // ISO 8601
  updatedAt: string; // ISO 8601
  rev: number; // incrementing revision for optimistic concurrency
};

export type CreateTaskRequest = {
  title: string;
  description?: string;
  dueDate?: string;
  priority?: TaskPriority;
  effort?: EffortEstimate;
  minimumDuration?: DurationEstimate;
  attrs?: TaskAttributes;

  // Phase 4 (GTD) - optional for backward compatibility
  entityType?: EntityType;
  state?: WorkflowState;
  context?: string;
  waitingFor?: string;
};

export type CreateTaskResponse = { task: Task };

export type ListTasksResponse = {
  items: Task[];
  nextToken?: string;
};

export type UpdateTaskRequest = {
  title?: string;
  description?: string;

  /** Legacy status retained for compatibility. Server may ignore if `state` is provided. */
  status?: TaskStatus;

  /** Set to null to clear. */
  dueDate?: string | null;

  /** Set to null to clear. */
  priority?: TaskPriority | null;

  /** Set to null to clear. */
  effort?: EffortEstimate | null;

  /** Set to null to clear. */
  minimumDuration?: DurationEstimate | null;

  /** Set to null to clear. */
  attrs?: TaskAttributes | null;

  // Phase 4 (GTD)
  entityType?: EntityType;
  state?: WorkflowState;

  /** Set to null to clear. */
  context?: string | null;

  /** Set to null to clear. */
  waitingFor?: string | null;

  /** Optional optimistic concurrency guard. */
  expectedRev?: number;
};

export type UpdateTaskResponse = { task: Task };

// ----------------------------------------------------------------------
// Phase 2: Subtasks (tree model)

/**
 * Create a subtask under a parent task node.
 * Parent id is provided by the route.
 */
export type CreateSubtaskRequest = CreateTaskRequest;

export type CreateSubtaskResponse = { task: Task };

export type ListSubtasksResponse = {
  items: Task[];
  nextToken?: string;
};

/**
 * Update a subtask under a parent task node.
 * Parent id and subtask id are provided by the route.
 */
export type UpdateSubtaskRequest = UpdateTaskRequest;

export type UpdateSubtaskResponse = { task: Task };

export type ErrorResponse = {
  error: {
    code: string;
    message: string;
    details?: unknown;
    /** API Gateway request id (useful for support/debugging) */
    requestId?: string;
  };
};

// ----------------------------------------------------------------------
// Phase 3: Sharing

export type ShareMode = "VIEW" | "EDIT";

/**
 * Represents a share grant from an owner to a grantee for a root task.
 * Root-level share implies access to the entire subtree.
 */
export type ShareGrant = {
  rootTaskId: string;
  ownerSub: string;
  granteeSub: string;
  mode: ShareMode;
  createdAt: string; // ISO 8601
  updatedAt?: string; // ISO 8601
};

export type CreateShareRequest = {
  granteeSub: string;
  mode: ShareMode;
};

export type CreateShareResponse = {
  grant: ShareGrant;
};

export type ListSharesResponse = {
  items: ShareGrant[];
  nextToken?: string;
};

export type RevokeShareResponse = { ok: true };

export type SharedTaskPointer = {
  ownerSub: string;
  rootTaskId: string;
  mode: ShareMode;
  grantedAt: string; // ISO 8601
};

export type ListSharedWithMeResponse = {
  items: Array<SharedTaskPointer & { task?: Task }>;
  nextToken?: string;
};


// ----------------------------------------------------------------------
// Phase 8: Today dashboard

export type TodayTaskSource = "owned" | "shared";

export type TodayTask = Task & {
  source: TodayTaskSource;
  sharedMeta?: {
    ownerSub: string;
    rootTaskId: string;
    mode: ShareMode;
  };
};

export type TodayProjectHealthIssue = {
  project: TodayTask;
  issues: Array<"noNext" | "onlySomeday" | "stalledWaiting">;
  nextActions: number;
  stalledWaiting: number;
  openActions: number;
};

export type TodayResponse = {
  generatedAt: string;
  includeShared: boolean;
  overdue: TodayTask[];
  dueToday: TodayTask[];
  waiting: TodayTask[];
  recommended: TodayTask[];
  projectHealth: TodayProjectHealthIssue[];
};

// ----------------------------------------------------------------------
// Phase 9: Review dashboard

export type ReviewMetricKey =
  | "inbox"
  | "projectsWithoutNext"
  | "waitingFollowups"
  | "staleTasks"
  | "oldSomeday"
  | "overdueScheduled";

export type ReviewCounts = {
  inboxCount: number;
  projectsWithoutNext: number;
  waitingFollowups: number;
  staleTasks: number;
  oldSomeday: number;
  overdueScheduled: number;
};

export type ReviewTaskBuckets = {
  inbox: TodayTask[];
  waitingFollowups: TodayTask[];
  staleTasks: TodayTask[];
  oldSomeday: TodayTask[];
  overdueScheduled: TodayTask[];
};

export type ReviewResponse = ReviewCounts & {
  generatedAt: string;
  includeShared: boolean;
  buckets: ReviewTaskBuckets;
  projectsWithoutNextItems: TodayProjectHealthIssue[];
};



// ----------------------------------------------------------------------
// Phase 10: Insights and guided actions

export type InsightSuggestionType =
  | "promoteToNext"
  | "projectMissingNextAction"
  | "waitingFollowUp"
  | "missingContext"
  | "missingEffort"
  | "missingMinimumDuration"
  | "repeatedDeferredLargeBlock"
  | "projectNextMissingMinimumDuration"
  | "scheduledWithoutDueDate"
  | "staleTask"
  | "oldSomeday";

export type InsightReasonCode =
  | "inbox_actionable"
  | "project_no_next"
  | "waiting_stale"
  | "context_missing"
  | "effort_missing"
  | "minimum_duration_missing"
  | "deferred_large_block"
  | "project_next_missing_minimum_duration"
  | "scheduled_no_due_date"
  | "task_stale"
  | "someday_old";

export type InsightRecommendedAction =
  | "set_next"
  | "create_next_action"
  | "set_waiting_followup"
  | "add_context"
  | "add_effort"
  | "add_minimum_duration"
  | "set_due_date"
  | "open_task";

export type InsightScoreBreakdown = {
  urgency: number;
  staleness: number;
  dueDateRisk: number;
  projectBlockage: number;
  missingMetadata: number;
  waitingFollowupRisk: number;
  total: number;
};

export type InsightSuggestion = {
  id: string;
  type: InsightSuggestionType;
  score: number;
  scoreBreakdown?: InsightScoreBreakdown;
  taskId?: string;
  projectId?: string;
  task?: TodayTask;
  project?: TodayTask;
  title: string;
  reason: string;
  reasonCode: InsightReasonCode;
  recommendedAction: InsightRecommendedAction;
};

export type InsightsResponse = {
  generatedAt: string;
  includeShared: boolean;
  suggestions: InsightSuggestion[];
};
