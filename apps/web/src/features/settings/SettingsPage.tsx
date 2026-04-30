import { useEffect, useState } from "react";
import type { ExecutionContext, UserSettings } from "@tm/shared";
import { useAuth } from "../../auth/AuthContext";
import { useExecutionContexts } from "../contexts/useExecutionContexts";
import { getSettings, sendRecommendationsNow, updateSettings } from "./api";

function defaultSettings(): UserSettings {
  return { notificationEmail: "", notificationSchedule: { enabled: false, timeOfDay: "08:00", timezone: "Australia/Melbourne", topN: 5 } };
}

export default function SettingsPage() {
  const { tokens } = useAuth();
  const contexts = useExecutionContexts(tokens);
  const [settings, setSettings] = useState<UserSettings>(defaultSettings());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    getSettings(ac.signal)
      .then((r) => setSettings({ ...defaultSettings(), ...r.settings, notificationSchedule: { ...defaultSettings().notificationSchedule, ...r.settings.notificationSchedule } }))
      .catch((e) => { if (!(e instanceof DOMException && e.name === "AbortError")) setError(e?.message ?? "Failed to load settings"); })
      .finally(() => setLoading(false));
    return () => ac.abort();
  }, []);

  const schedule = settings.notificationSchedule;

  async function saveSettings() {
    setSaving(true); setMessage(null); setError(null);
    try {
      const r = await updateSettings({
        notificationEmail: settings.notificationEmail?.trim() || null,
        notificationSchedule: schedule,
      });
      setSettings(r.settings); setMessage("Settings saved.");
    } catch (e: any) { setError(e?.message ?? "Failed to save settings"); }
    finally { setSaving(false); }
  }

  async function toggleSignificant(context: ExecutionContext) {
    await contexts.update(context.contextId, { significant: !context.significant });
  }

  async function sendNow() {
    setSending(true); setMessage(null); setError(null);
    try { const r = await sendRecommendationsNow(); setMessage(r.message); }
    catch (e: any) { setError(e?.message ?? "Failed to send recommendation email"); }
    finally { setSending(false); }
  }

  if (loading) return <section className="card"><h1>Settings</h1><p className="muted">Loading settings…</p></section>;

  return (
    <section className="stack settings-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Configuration</p>
          <h1>Settings</h1>
          <p className="muted">Configure significant contexts and scheduled execution guidance emails.</p>
        </div>
        <button className="btn btn-primary" onClick={saveSettings} disabled={saving}>{saving ? "Saving…" : "Save settings"}</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}
      {message && <div className="alert alert-success">{message}</div>}

      <div className="card stack">
        <h2>Significant execution contexts</h2>
        <p className="muted">Recommendation emails are grouped by contexts marked as significant.</p>
        <div className="settings-context-list">
          {contexts.items.filter((c) => !c.archived).map((context) => (
            <label key={context.contextId} className="settings-context-row">
              <input type="checkbox" checked={Boolean(context.significant)} onChange={() => void toggleSignificant(context)} />
              <span>{context.name}</span>
              <span className="pill">{context.kind}</span>
            </label>
          ))}
          {!contexts.items.filter((c) => !c.archived).length && <p className="muted">No execution contexts have been configured yet.</p>}
        </div>
      </div>

      <div className="card stack">
        <h2>Email notifications</h2>
        <p className="muted">EGS sends notifications through the system AWS SES configuration. Users only need to choose the recipient address.</p>
        <div className="form-grid two-col">
          <label>To email<input type="email" value={settings.notificationEmail ?? ""} onChange={(e) => setSettings((s) => ({ ...s, notificationEmail: e.target.value }))} placeholder="you@example.com" /></label>
        </div>
      </div>

      <div className="card stack">
        <h2>Notification schedule</h2>
        <div className="form-grid two-col">
          <label className="checkbox-line"><input type="checkbox" checked={schedule.enabled} onChange={(e) => setSettings((s) => ({ ...s, notificationSchedule: { ...schedule, enabled: e.target.checked } }))} /> Enable scheduled recommendation email</label>
          <label>Time of day<input type="time" value={schedule.timeOfDay} onChange={(e) => setSettings((s) => ({ ...s, notificationSchedule: { ...schedule, timeOfDay: e.target.value } }))} /></label>
          <label>Timezone<input value={schedule.timezone} onChange={(e) => setSettings((s) => ({ ...s, notificationSchedule: { ...schedule, timezone: e.target.value } }))} /></label>
          <label>Tasks per significant context<input type="number" min={1} max={20} value={schedule.topN} onChange={(e) => setSettings((s) => ({ ...s, notificationSchedule: { ...schedule, topN: Number(e.target.value) } }))} /></label>
        </div>
        {schedule.nextRunAt && <p className="muted">Next scheduled run: {new Date(schedule.nextRunAt).toLocaleString()}</p>}
        {schedule.lastSentAt && <p className="muted">Last sent: {new Date(schedule.lastSentAt).toLocaleString()}</p>}
        <div><button className="btn btn-secondary" onClick={sendNow} disabled={sending}>{sending ? "Sending…" : "Send recommendation email now"}</button></div>
      </div>
    </section>
  );
}
