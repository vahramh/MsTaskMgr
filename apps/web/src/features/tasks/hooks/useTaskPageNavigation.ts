import { useCallback, useMemo } from "react";
import type { SetURLSearchParams } from "react-router-dom";
import type { WorkflowState } from "@tm/shared";

export type ViewKey = WorkflowState | "projects";
export type FocusViewKey = WorkflowState | "all";

const VIEW_KEYS: ViewKey[] = [
  "inbox",
  "next",
  "waiting",
  "scheduled",
  "someday",
  "reference",
  "completed",
  "projects",
];

const FOCUS_VIEW_KEYS: FocusViewKey[] = [
  "all",
  "inbox",
  "next",
  "waiting",
  "scheduled",
  "someday",
  "reference",
  "completed",
];

export function useTaskPageNavigation(
  searchParams: URLSearchParams,
  setSearchParams: SetURLSearchParams
) {
  const viewParam = searchParams.get("view") ?? "inbox";
  const focusId = searchParams.get("focus") ?? null;
  const focusViewParam = searchParams.get("pview") ?? "next";
  const scrollToId = searchParams.get("scrollTo") ?? null;
  const editId = searchParams.get("edit") ?? null;

  const view = useMemo<ViewKey>(
    () => (VIEW_KEYS.includes(viewParam as ViewKey) ? (viewParam as ViewKey) : "inbox"),
    [viewParam]
  );

  const focusView = useMemo<FocusViewKey>(
    () => (FOCUS_VIEW_KEYS.includes(focusViewParam as FocusViewKey) ? (focusViewParam as FocusViewKey) : "next"),
    [focusViewParam]
  );

  const setView = useCallback(
    (nextView: ViewKey) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", nextView);
        if (nextView !== "projects") {
          next.delete("focus");
          next.delete("pview");
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const setFocus = useCallback(
    (taskId: string) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "projects");
        next.set("focus", taskId);
        next.set("pview", "next");
        return next;
      });
    },
    [setSearchParams]
  );

  const clearFocus = useCallback(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("focus");
      next.delete("pview");
      next.set("view", "projects");
      return next;
    });
  }, [setSearchParams]);

  const setFocusView = useCallback(
    (nextFocusView: FocusViewKey) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.set("view", "projects");
        if (focusId) next.set("focus", focusId);
        next.set("pview", nextFocusView);
        return next;
      });
    },
    [setSearchParams, focusId]
  );

  const clearDeepLinkEdit = useCallback(() => {
    setSearchParams((prev) => {
      if (!prev.get("edit")) return prev;
      const next = new URLSearchParams(prev);
      next.delete("edit");
      return next;
    });
  }, [setSearchParams]);

  return {
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
  };
}
