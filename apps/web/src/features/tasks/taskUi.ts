import { ApiError } from "../../api/http";

export type UiError = {
  message: string;
  requestId?: string;
  code?: string;
  status?: number;
};

export function isAbortError(e: unknown): boolean {
  if (e instanceof DOMException && e.name === "AbortError") return true;
  if (e && typeof e === "object") {
    const any = e as any;
    if (any.name === "AbortError") return true;
    const msg = typeof any.message === "string" ? any.message : "";
    if (msg.toLowerCase().includes("signal is aborted")) return true;
    if (msg.toLowerCase().includes("aborted")) return true;
  }
  return false;
}

export function toUiError(e: unknown): UiError {
  if (e instanceof ApiError) {
    return {
      message: e.message,
      requestId: e.requestId,
      code: e.code,
      status: e.status,
    };
  }
  if (e && typeof e === "object") {
    const any = e as any;
    return { message: any.message ?? String(e) };
  }
  return { message: String(e) };
}

export async function handleConflict(
  e: unknown,
  reloadFn: () => Promise<void>,
  setErr: (e: UiError) => void
): Promise<boolean> {
  if (e instanceof ApiError && e.status === 409 && typeof (e.details as any)?.expectedRev === "number") {
    setErr({
      message: "This task was updated elsewhere. Reloading…",
      requestId: e.requestId,
      code: e.code,
      status: e.status,
    });
    await reloadFn();
    return true;
  }
  return false;
}
