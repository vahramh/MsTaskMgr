import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateTaskRequest, EntityType, ExecutionContextOption, WorkflowState } from "@tm/shared";
import { useSpeechToText } from "../../../hooks/useSpeechToText";
import { parseVoiceTaskCapture } from "../voiceTaskCapture";
import { buildTaskAttributes } from "../taskMetadata";
import { parseContextTokens, serializeContextTokens } from "../contextOptions";

export type CreateTaskController = ReturnType<typeof useTaskCreateController>;

type UseTaskCreateControllerArgs = {
  creating: boolean;
  onCreate: (request: CreateTaskRequest) => Promise<void>;
  onAfterCreate?: () => Promise<void> | void;
};

const INITIAL_ATTRS_JSON = "{}";

export function useTaskCreateController({ creating, onCreate, onAfterCreate }: UseTaskCreateControllerArgs) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState("");
  const [effortValue, setEffortValue] = useState("");
  const [effortUnit, setEffortUnit] = useState<"hours" | "days">("hours");
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [remainingMinutes, setRemainingMinutes] = useState("");
  const [timeSpentMinutes, setTimeSpentMinutes] = useState("");
  const [minimumDurationValue, setMinimumDurationValue] = useState("");
  const [minimumDurationUnit, setMinimumDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [attrsJson, setAttrsJson] = useState(INITIAL_ATTRS_JSON);
  const [captureSource, setCaptureSource] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [createEntityType, setCreateEntityType] = useState<EntityType>("action");
  const [createState, setCreateState] = useState<WorkflowState>("inbox");
  const [createContextTokens, setCreateContextTokens] = useState<ExecutionContextOption[]>([]);
  const [createWaitingFor, setCreateWaitingFor] = useState("");

  const titleRef = useRef<HTMLInputElement | null>(null);

  const titleTrim = title.trim();
  const descTrim = description.trim();
  const attrsJsonTrim = attrsJson.trim();

  const titleError = useMemo(() => {
    if (title.length === 0) return null;
    if (titleTrim.length === 0) return "Title cannot be blank";
    if (titleTrim.length > 200) return "Title is too long (max 200 characters)";
    return null;
  }, [title, titleTrim]);

  const descriptionError = useMemo(() => {
    if (descTrim.length > 2000) return "Description is too long (max 2000 characters)";
    return null;
  }, [descTrim]);

  const attrsError = useMemo(() => {
    if (!attrsJsonTrim) return null;
    try {
      const parsed = JSON.parse(attrsJsonTrim);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return "Advanced attributes must be a JSON object";
      }
      return null;
    } catch {
      return "Advanced attributes must be valid JSON";
    }
  }, [attrsJsonTrim]);

  const estimatedNumber = estimatedMinutes.trim() ? Number(estimatedMinutes) : undefined;
  const remainingNumber = remainingMinutes.trim() ? Number(remainingMinutes) : undefined;
  const spentNumber = timeSpentMinutes.trim() ? Number(timeSpentMinutes) : undefined;

  const progressError = useMemo(() => {
    if (estimatedNumber !== undefined && (!Number.isFinite(estimatedNumber) || estimatedNumber < 0)) return "Estimated minutes must be 0 or more";
    if (remainingNumber !== undefined && (!Number.isFinite(remainingNumber) || remainingNumber < 0)) return "Remaining minutes must be 0 or more";
    if (spentNumber !== undefined && (!Number.isFinite(spentNumber) || spentNumber < 0)) return "Time spent must be 0 or more";
    if (estimatedNumber !== undefined && remainingNumber !== undefined && remainingNumber > estimatedNumber) return "Remaining cannot exceed estimated";
    return null;
  }, [estimatedNumber, remainingNumber, spentNumber]);

  const gtdCreateError = useMemo(() => {
    const waitingFor = createWaitingFor.trim();
    if (createEntityType === "project" && createState === "next") return "Projects cannot be in Next";
    if (createState === "next" && createEntityType !== "action") return "Only actions can be in Next";
    if (createState === "waiting" && !waitingFor) return "Waiting requires 'Waiting for…'";
    if (createState === "scheduled" && !dueDate) return "Scheduled requires a due date";
    if (createState === "inbox" && dueDate) return "Inbox items cannot have a due date";
    if (waitingFor.length > 200) return "Waiting for is too long (max 200 characters)";
    if (captureSource.trim().length > 80) return "Capture source is too long (max 80 characters)";
    return null;
  }, [captureSource, createEntityType, createState, createWaitingFor, dueDate]);

  const canCreate = !titleError && !descriptionError && !attrsError && !progressError && !gtdCreateError && titleTrim.length > 0 && !creating;

  const reset = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("");
    setEffortValue("");
    setEffortUnit("hours");
    setEstimatedMinutes("");
    setRemainingMinutes("");
    setTimeSpentMinutes("");
    setMinimumDurationValue("");
    setMinimumDurationUnit("minutes");
    setAttrsJson(INITIAL_ATTRS_JSON);
    setCaptureSource("");
    setAdvancedOpen(false);
    setCreateEntityType("action");
    setCreateState("inbox");
    setCreateContextTokens([]);
    setCreateWaitingFor("");
    setShowCreate(false);
  };

  const speech = useSpeechToText({
    lang: "en-AU",
    onResult: (text) => {
      const parsed = parseVoiceTaskCapture(text);
      setTitle((previous) => {
        const nextTitle = parsed.cleanTitle;
        return previous.trim() ? `${previous.trim()} ${nextTitle}`.trim() : nextTitle;
      });

      if (parsed.priority) setPriority(String(parsed.priority));
      if (parsed.state === "waiting") setCreateState("waiting");
      else if (parsed.state === "scheduled") setCreateState((previous) => (previous === "inbox" ? "scheduled" : previous));
      else if (parsed.state === "next") setCreateState((previous) => (previous === "inbox" ? "next" : previous));

      if (parsed.waitingFor) setCreateWaitingFor(parsed.waitingFor);
      if (parsed.dueDate) setDueDate(parsed.dueDate);
      if (parsed.context) setCreateContextTokens(parseContextTokens(parsed.context));
      window.setTimeout(() => titleRef.current?.focus(), 0);
    },
  });

  useEffect(() => {
    if (showCreate) titleRef.current?.focus();
  }, [showCreate]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;

    const advancedAttrs = attrsJsonTrim ? JSON.parse(attrsJsonTrim) : null;

    await onCreate({
      title: titleTrim,
      description: descTrim || undefined,
      entityType: createEntityType,
      state: createState,
      context: serializeContextTokens(createContextTokens) ?? undefined,
      waitingFor: createState === "waiting" ? createWaitingFor.trim() : undefined,
      dueDate: createState === "inbox" ? undefined : dueDate || undefined,
      priority: priority ? (Number(priority) as CreateTaskRequest["priority"]) : undefined,
      effort: effortValue ? { unit: effortUnit, value: Number(effortValue) } : undefined,
      estimatedMinutes: estimatedNumber,
      remainingMinutes: remainingNumber,
      timeSpentMinutes: spentNumber,
      minimumDuration: minimumDurationValue ? { unit: minimumDurationUnit, value: Number(minimumDurationValue) } : undefined,
      attrs: buildTaskAttributes({
        captureSource,
        advanced: advancedAttrs,
      }) ?? undefined,
    });

    await onAfterCreate?.();
    reset();
  };

  return {
    state: {
      title,
      description,
      dueDate,
      priority,
      effortValue,
      effortUnit,
      estimatedMinutes,
      remainingMinutes,
      timeSpentMinutes,
      minimumDurationValue,
      minimumDurationUnit,
      attrsJson,
      captureSource,
      advancedOpen,
      showCreate,
      createEntityType,
      createState,
      createContextTokens,
      createWaitingFor,
    },
    derived: {
      titleTrim,
      descTrim,
      titleError,
      descriptionError,
      attrsError,
      progressError,
      gtdCreateError,
      canCreate,
    },
    refs: {
      titleRef,
    },
    actions: {
      setShowCreate,
      setTitle,
      setDescription,
      setDueDate,
      setPriority,
      setEffortValue,
      setEffortUnit,
      setEstimatedMinutes,
      setRemainingMinutes,
      setTimeSpentMinutes,
      setMinimumDurationValue,
      setMinimumDurationUnit,
      setAttrsJson,
      setCaptureSource,
      setAdvancedOpen,
      setCreateEntityType,
      setCreateState: (next: WorkflowState) => {
        setCreateState(next);
        if (next === "inbox") setDueDate("");
        if (next !== "waiting") setCreateWaitingFor("");
      },
      toggleContextToken: (token: ExecutionContextOption) => {
        setCreateContextTokens((previous) =>
          previous.includes(token) ? previous.filter((value) => value !== token) : [...previous, token]
        );
      },
      setCreateWaitingFor,
      submit,
      reset,
    },
    speech,
  };
}
