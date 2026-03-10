import type { CognitoTokens } from "../auth/tokenStore";
import type { ErrorResponse } from "@tm/shared";
import { ensureValidTokens } from "../auth/ensureValidToken";

function mustGetEnv(name: string): string {
  const v = import.meta.env[name];
  if (!v || typeof v !== "string") throw new Error(`Missing env ${name}`);
  return v;
}

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly details?: unknown;

  constructor(args: { status: number; code: string; message: string; requestId?: string; details?: unknown }) {
    super(args.message);
    this.name = "ApiError";
    this.status = args.status;
    this.code = args.code;
    this.requestId = args.requestId;
    this.details = args.details;
  }
}

async function readError(r: Response): Promise<ApiError> {
  const text = await r.text().catch(() => "");
  // Prefer structured {error:{...}} from the backend, fall back to plain text.
  try {
    const parsed = JSON.parse(text) as Partial<ErrorResponse>;
    const e = parsed?.error;
    if (e && typeof e.code === "string" && typeof e.message === "string") {
      return new ApiError({ status: r.status, code: e.code, message: e.message, requestId: e.requestId, details: e.details });
    }
  } catch {
    // ignore
  }
  return new ApiError({ status: r.status, code: "HttpError", message: text || `HTTP ${r.status}` });
}

type FetchOpts = {
  tokens?: CognitoTokens;
  method?: string;
  path: string;
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  signal?: AbortSignal;
};

export async function apiFetchJson<T>(opts: FetchOpts): Promise<T> {
  const apiBase = mustGetEnv("VITE_API_BASE");
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v === undefined) continue;
    qs.set(k, String(v));
  }
  const url = joinUrl(apiBase, opts.path) + (qs.toString() ? `?${qs.toString()}` : "");

  const headers: Record<string, string> = { "content-type": "application/json" };

  const validTokens = await ensureValidTokens();

  if (validTokens) {
    headers.Authorization = `Bearer ${validTokens.id_token}`;
  }

  const r = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (!r.ok) throw await readError(r);
  return (await r.json()) as T;
}

export async function apiFetchVoid(opts: FetchOpts): Promise<void> {
  const apiBase = mustGetEnv("VITE_API_BASE");
  const url = joinUrl(apiBase, opts.path);

  const headers: Record<string, string> = { "content-type": "application/json" };

  const validTokens = await ensureValidTokens();

  if (validTokens) {
    headers.Authorization = `Bearer ${validTokens.id_token}`;
  }

  const r = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    signal: opts.signal,
  });

  if (r.status === 204) return;
  if (!r.ok) throw await readError(r);
}
