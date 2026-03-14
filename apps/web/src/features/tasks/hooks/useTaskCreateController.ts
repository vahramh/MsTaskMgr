import { useEffect, useMemo, useRef, useState } from "react";
import type { CreateTaskRequest, EntityType, WorkflowState } from "@tm/shared";
import { useSpeechToText } from "../../../hooks/useSpeechToText";
import { parseVoiceTaskCapture } from "../voiceTaskCapture";

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
  const [minimumDurationValue, setMinimumDurationValue] = useState("");
  const [minimumDurationUnit, setMinimumDurationUnit] = useState<"minutes" | "hours">("minutes");
  const [attrsJson, setAttrsJson] = useState(INITIAL_ATTRS_JSON);
  const [showCreate, setShowCreate] = useState(false);
  const [createEntityType, setCreateEntityType] = useState<EntityType>("action");
  const [createState, setCreateState] = useState<WorkflowState>("inbox");
  const [createContext, setCreateContext] = useState("");
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
        return "Attributes must be a JSON object";
      }
      return null;
    } catch {
      return "Attributes must be valid JSON";
    }
  }, [attrsJsonTrim]);

  const gtdCreateError = useMemo(() => {
    const waitingFor = createWaitingFor.trim();
    const context = createContext.trim();
    if (createEntityType === "project" && createState === "next") return "Projects cannot be in Next";
    if (createState === "next" && createEntityType !== "action") return "Only actions can be in Next";
    if (createState === "waiting" && !waitingFor) return "Waiting requires 'Waiting for…'";
    if (createState === "scheduled" && !dueDate) return "Scheduled requires a due date";
    if (createState === "inbox" && dueDate) return "Inbox items cannot have a due date";
    if (context.length > 40) return "Context is too long (max 40 characters)";
    if (waitingFor.length > 200) return "Waiting for is too long (max 200 characters)";
    return null;
  }, [createContext, createEntityType, createState, createWaitingFor, dueDate]);

  const canCreate = !titleError && !descriptionError && !attrsError && !gtdCreateError && titleTrim.length > 0 && !creating;

  const reset = () => {
    setTitle("");
    setDescription("");
    setDueDate("");
    setPriority("");
    setEffortValue("");
    setEffortUnit("hours");
    setMinimumDurationValue("");
    setMinimumDurationUnit("minutes");
    setAttrsJson(INITIAL_ATTRS_JSON);
    setCreateEntityType("action");
    setCreateState("inbox");
    setCreateContext("");
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
      window.setTimeout(() => titleRef.current?.focus(), 0);
    },
  });

  useEffect(() => {
    if (showCreate) titleRef.current?.focus();
  }, [showCreate]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canCreate) return;

    await onCreate({
      title: titleTrim,
      description: descTrim || undefined,
      entityType: createEntityType,
      state: createState,
      context: createContext.trim() || undefined,
      waitingFor: createState === "waiting" ? createWaitingFor.trim() : undefined,
      dueDate: createState === "inbox" ? undefined : dueDate || undefined,
      priority: priority ? Number(priority) as CreateTaskRequest["priority"] : undefined,
      effort: effortValue ? { unit: effortUnit, value: Number(effortValue) } : undefined,
      minimumDuration: minimumDurationValue ? { unit: minimumDurationUnit, value: Number(minimumDurationValue) } : undefined,
      attrs: attrsJsonTrim ? JSON.parse(attrsJsonTrim) : undefined,
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
      minimumDurationValue,
      minimumDurationUnit,
      attrsJson,
      showCreate,
      createEntityType,
      createState,
      createContext,
      createWaitingFor,
    },
    derived: {
      titleTrim,
      descTrim,
      titleError,
      descriptionError,
      attrsError,
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
      setMinimumDurationValue,
      setMinimumDurationUnit,
      setAttrsJson,
      setCreateEntityType,
      setCreateState: (next: WorkflowState) => {
        setCreateState(next);
        if (next === "inbox") setDueDate("");
        if (next !== "waiting") setCreateWaitingFor("");
      },
      setCreateContext,
      setCreateWaitingFor,
      submit,
      reset,
    },
    speech,
  };
}
