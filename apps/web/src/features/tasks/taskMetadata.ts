import type { TaskAttributes } from "@tm/shared";

export const SYSTEM_ATTR_KEYS = [
  "_egsDeferCount",
  "_egsLastDeferredAt",
  "_egsLastRecommendedAt",
  "_egsRecommendationFatigue",
  "_egsLastReviewedAt",
] as const;

export const STRUCTURED_ATTR_KEYS = ["_egsCaptureSource"] as const;

export function splitTaskAttributes(attrs?: TaskAttributes | null) {
  const source = typeof attrs?._egsCaptureSource === "string" ? attrs._egsCaptureSource : "";
  const system: TaskAttributes = {};
  const advanced: TaskAttributes = {};

  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (key === "_egsCaptureSource") continue;
    if (key.startsWith("_egs")) system[key] = value;
    else advanced[key] = value;
  }

  return { source, system, advanced };
}

export function buildTaskAttributes(input: {
  captureSource?: string;
  advanced?: Record<string, unknown> | null;
  existing?: TaskAttributes | null;
}) {
  const next: TaskAttributes = {};
  const capture = input.captureSource?.trim();
  if (capture) next._egsCaptureSource = capture;

  for (const [key, value] of Object.entries(input.existing ?? {})) {
    if (key.startsWith("_egs") && key !== "_egsCaptureSource") next[key] = value;
  }

  for (const [key, value] of Object.entries(input.advanced ?? {})) {
    if (key.startsWith("_egs")) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      next[key] = value;
    } else if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      next[key] = value;
    }
  }

  return Object.keys(next).length ? next : null;
}

export function safeAdvancedJson(attrs?: TaskAttributes | null): string {
  const { advanced } = splitTaskAttributes(attrs);
  return JSON.stringify(advanced, null, 2);
}
