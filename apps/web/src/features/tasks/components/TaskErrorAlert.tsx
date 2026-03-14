import InlineAlert from "../../../components/InlineAlert";

export function TaskErrorAlert({
  error,
  onDismiss,
  onRetry,
  onCopyRequestId,
}: {
  error: { message: string; requestId?: string };
  onDismiss: () => void;
  onRetry?: (() => void) | undefined;
  onCopyRequestId?: ((requestId: string) => void) | undefined;
}) {
  return (
    <div style={{ marginTop: 12 }}>
      <InlineAlert
        tone="error"
        title="Task error"
        message={error.requestId ? `${error.message} (requestId: ${error.requestId})` : error.message}
        actions={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {onRetry ? (
              <button type="button" className="btn btn-secondary" onClick={onRetry}>
                Retry
              </button>
            ) : null}
            {error.requestId && onCopyRequestId ? (
              <button type="button" className="btn btn-secondary" onClick={() => onCopyRequestId(error.requestId!)}>
                Copy request ID
              </button>
            ) : null}
            <button type="button" className="btn btn-secondary" onClick={onDismiss}>
              Dismiss
            </button>
          </div>
        }
      />
    </div>
  );
}
