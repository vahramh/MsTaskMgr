export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogContext = Record<string, unknown>;

/**
 * Minimal structured logger.
 * - Uses console.* so CloudWatch preserves timestamps & correlation.
 * - Always logs JSON so it is queryable.
 */
export function log(level: LogLevel, message: string, ctx: LogContext = {}): void {
  const entry = {
    level,
    message,
    ...ctx,
  };

  if (level === "error") console.error(JSON.stringify(entry));
  else if (level === "warn") console.warn(JSON.stringify(entry));
  else console.log(JSON.stringify(entry));
}

export function toErrorInfo(err: unknown): { name?: string; message: string; stack?: string } {
  if (err && typeof err === "object") {
    const e = err as any;
    return { name: e.name, message: e.message ?? String(err), stack: e.stack };
  }
  return { message: String(err) };
}
