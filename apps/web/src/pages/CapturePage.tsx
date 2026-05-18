import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../auth/AuthContext";
import { createTask } from "../features/tasks/api";
import { parseVoiceTaskCapture, speechErrorLabel } from "../features/tasks/voiceTaskCapture";
import { useSpeechToText } from "../hooks/useSpeechToText";
import type { CreateTaskRequest, WorkflowState } from "@tm/shared";

function dueDateForRequest(dueDate?: string, dueTime?: string): string | undefined {
  if (!dueDate) return undefined;
  return dueTime ? `${dueDate}T${dueTime}:00` : dueDate;
}

function contextIdsFromParsedContext(context?: string): string[] | undefined {
  if (!context) return undefined;
  const contextIds = context
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return contextIds.length ? contextIds : undefined;
}

function stateLabel(state?: WorkflowState): string {
  switch (state) {
    case "next":
      return "Next";
    case "scheduled":
      return "Scheduled";
    case "waiting":
      return "Waiting";
    default:
      return "Inbox";
  }
}

function useCaptureManifest() {
  useEffect(() => {
    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!manifest) return;

    const previousHref = manifest.getAttribute("href");

    manifest.setAttribute("href", "/manifest-capture.webmanifest");

    return () => {
      if (previousHref) {
        manifest.setAttribute("href", previousHref);
      }
    };
  }, []);
}

export default function CapturePage() {
  const navigate = useNavigate();
  useCaptureManifest();
  const { tokens, logout } = useAuth();
  const [transcript, setTranscript] = useState("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);

  const speech = useSpeechToText({
    lang: "en-AU",
    onResult: (text) => {
      setTranscript(text);
      setSavedTitle(null);
      setSaveError(null);
    },
  });

  const parsed = useMemo(() => parseVoiceTaskCapture(transcript), [transcript]);
  const title = parsed.cleanTitle.trim();
  const canSave = !!tokens && !!title && !saving;
  const listening = speech.state === "listening";

  useEffect(() => {
    if (speech.transcript) {
      setTranscript(speech.transcript);
    }
  }, [speech.transcript]);

  function resetCapture() {
    speech.reset();
    setTranscript("");
    setSaveError(null);
    setSavedTitle(null);
  }

  async function saveCapture() {
    if (!tokens || !title) return;

    const state = parsed.state ?? "inbox";
    const req: CreateTaskRequest = {
      title,
      entityType: "action",
      state,
      dueDate: dueDateForRequest(parsed.dueDate, parsed.dueTime),
      priority: parsed.priority,
      context: parsed.context,
      contextIds: contextIdsFromParsedContext(parsed.context),
      waitingFor: parsed.waitingFor,
      attrs: {
        _egsCaptureSource: "voice-mobile",
        _egsRawVoiceText: transcript.trim(),
      },
    };

    setSaving(true);
    setSaveError(null);
    setSavedTitle(null);

    try {
      const response = await createTask(tokens, req);
      setSavedTitle(response.task.title);
      setTranscript("");
      speech.reset();
    } catch (error: any) {
      setSaveError(error?.message ?? "Could not save the captured task.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="capture-page">
      <section className="capture-card card">
        <div className="capture-header">
          <div>
            <div className="capture-eyebrow">EGS quick capture</div>
            <h1>Capture a task by voice</h1>
            <p>Speak naturally. EGS will capture the task into your trusted system.</p>
          </div>
          <button className="btn btn-secondary" type="button" onClick={() => navigate("/app/today")}>
            Today
          </button>
        </div>

        <div className="capture-mic-zone">
          <button
            className={`capture-mic-button${listening ? " is-listening" : ""}`}
            type="button"
            onClick={listening ? speech.stop : speech.start}
            disabled={!speech.supported}
            aria-label={listening ? "Stop listening" : "Start voice capture"}
          >
            <span className="capture-mic-icon">{listening ? "■" : "🎙️"}</span>
            <span>{listening ? "Stop" : "Speak"}</span>
          </button>
          <div className="capture-mic-help">
            {speech.supported
              ? listening
                ? "Listening…"
                : "Tap Speak, say the task, then save it."
              : "This browser does not support built-in speech recognition."}
          </div>
        </div>

        {speech.error ? <div className="capture-alert capture-alert-error">{speechErrorLabel(speech.error)}</div> : null}
        {saveError ? <div className="capture-alert capture-alert-error">{saveError}</div> : null}
        {savedTitle ? <div className="capture-alert capture-alert-success">Captured: {savedTitle}</div> : null}

        <label className="capture-label" htmlFor="capture-transcript">
          Captured text
        </label>
        <textarea
          id="capture-transcript"
          className="capture-textarea"
          value={transcript}
          onChange={(event) => {
            setTranscript(event.target.value);
            setSavedTitle(null);
            setSaveError(null);
          }}
          placeholder="Example: Fix the sound output bug in Tango DJ tomorrow priority 2"
          rows={5}
        />

        <div className="capture-preview">
          <div className="capture-preview-title">Parsed preview</div>
          <div className="capture-preview-grid">
            <div>
              <span>Title</span>
              <strong>{title || "—"}</strong>
            </div>
            <div>
              <span>State</span>
              <strong>{stateLabel(parsed.state)}</strong>
            </div>
            <div>
              <span>Due</span>
              <strong>{parsed.dueDate ? `${parsed.dueDate}${parsed.dueTime ? ` ${parsed.dueTime}` : ""}` : "—"}</strong>
            </div>
            <div>
              <span>Priority</span>
              <strong>{parsed.priority ? `P${parsed.priority}` : "—"}</strong>
            </div>
            <div>
              <span>Context</span>
              <strong>{parsed.context || "—"}</strong>
            </div>
            <div>
              <span>Waiting for</span>
              <strong>{parsed.waitingFor || "—"}</strong>
            </div>
          </div>
        </div>

        <div className="capture-actions">
          <button className="btn btn-primary" type="button" onClick={saveCapture} disabled={!canSave}>
            {saving ? "Saving…" : "Save to EGS"}
          </button>
          <button className="btn btn-secondary" type="button" onClick={resetCapture} disabled={saving || (!transcript && !savedTitle)}>
            Clear
          </button>
        </div>

        <div className="capture-footer">
          <Link to="/app/tasks">Open tasks</Link>
          <button className="link-button" type="button" onClick={logout}>
            Sign out
          </button>
        </div>
      </section>
    </main>
  );
}
