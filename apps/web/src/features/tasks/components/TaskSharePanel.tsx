import InlineAlert from "../../../components/InlineAlert";
import type { UiError } from "../taskUi";
import type { ShareGrantViewModel } from "../hooks/useTaskShareController";

export function TaskSharePanel({
  shares,
  sharesLoading,
  sharesError,
  shareGranteeSub,
  shareMode,
  onClose,
  onDismissError,
  onShareGranteeSubChange,
  onShareModeChange,
  onSubmitShare,
  onRemoveShare,
}: {
  shares: ShareGrantViewModel[];
  sharesLoading: boolean;
  sharesError: UiError | null;
  shareGranteeSub: string;
  shareMode: "VIEW" | "EDIT";
  onClose: () => void;
  onDismissError: () => void;
  onShareGranteeSubChange: (value: string) => void;
  onShareModeChange: (value: "VIEW" | "EDIT") => void;
  onSubmitShare: () => void;
  onRemoveShare: (granteeSub: string) => void;
}) {
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e5e7eb" }}>
      <div className="row space-between" style={{ alignItems: "center" }}>
        <div style={{ fontWeight: 900 }}>Sharing</div>
        <button className="btn btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      {sharesError ? (
        <div style={{ marginTop: 10 }}>
          <InlineAlert
            tone="error"
            title="Share error"
            message={sharesError.requestId ? `${sharesError.message} (requestId: ${sharesError.requestId})` : sharesError.message}
            actions={
              <button className="btn btn-secondary" onClick={onDismissError}>
                Dismiss
              </button>
            }
          />
        </div>
      ) : null}

      <div className="row" style={{ gap: 8, marginTop: 10, alignItems: "center" }}>
        <input
          className="input"
          placeholder="Grantee sub (Cognito user sub)"
          value={shareGranteeSub}
          onChange={(event) => onShareGranteeSubChange(event.target.value)}
          style={{ flex: 1, minWidth: 240 }}
        />
        <select className="input" value={shareMode} onChange={(event) => onShareModeChange(event.target.value as "VIEW" | "EDIT")} style={{ width: 120 }}>
          <option value="VIEW">VIEW</option>
          <option value="EDIT">EDIT</option>
        </select>
        <button className="btn" onClick={onSubmitShare} disabled={sharesLoading || !shareGranteeSub.trim()}>
          {sharesLoading ? "Saving…" : "Grant"}
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        {sharesLoading && shares.length === 0 ? (
          <div className="help">Loading…</div>
        ) : shares.length === 0 ? (
          <div className="help">Not shared with anyone.</div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {shares.map((share) => (
              <div key={share.granteeSub} className="row space-between" style={{ alignItems: "center" }}>
                <div style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 }}>
                  {share.granteeSub}
                  <span className="pill" style={{ marginLeft: 8 }}>{share.mode}</span>
                </div>
                <button className="btn btn-danger" onClick={() => onRemoveShare(share.granteeSub)} disabled={sharesLoading}>
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
