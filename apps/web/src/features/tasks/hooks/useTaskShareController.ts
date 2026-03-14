import { useCallback, useRef, useState } from "react";
import type { CognitoTokens } from "../../../auth/tokenStore";
import { createShare, listShares, revokeShare } from "../api";
import { isAbortError, toUiError, type UiError } from "../taskUi";

export type ShareGrantViewModel = {
  granteeSub: string;
  mode: "VIEW" | "EDIT";
  createdAt: string;
};

export function useTaskShareController(tokens: CognitoTokens | null) {
  const [shareFor, setShareFor] = useState<string | null>(null);
  const [shareGranteeSub, setShareGranteeSub] = useState("");
  const [shareMode, setShareMode] = useState<"VIEW" | "EDIT">("VIEW");
  const [shares, setShares] = useState<ShareGrantViewModel[]>([]);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [sharesError, setSharesError] = useState<UiError | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const openShares = useCallback(async (rootTaskId: string) => {
    if (!tokens) return;
    setShareFor(rootTaskId);
    setShares([]);
    setSharesError(null);
    setSharesLoading(true);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await listShares(tokens, rootTaskId, { limit: 50 }, controller.signal);
      setShares(response.items.map((item) => ({ granteeSub: item.granteeSub, mode: item.mode, createdAt: item.createdAt })));
    } catch (error) {
      if (isAbortError(error)) return;
      setSharesError(toUiError(error));
    } finally {
      setSharesLoading(false);
    }
  }, [tokens]);

  const closeShares = useCallback(() => {
    abortRef.current?.abort();
    setShareFor(null);
    setShares([]);
    setSharesError(null);
    setShareGranteeSub("");
    setShareMode("VIEW");
  }, []);

  const submitShare = useCallback(async (rootTaskId: string) => {
    if (!tokens) return;
    const granteeSub = shareGranteeSub.trim();
    if (!granteeSub) {
      setSharesError({ message: "Enter a grantee sub" });
      return;
    }

    setSharesError(null);
    setSharesLoading(true);
    try {
      await createShare(tokens, rootTaskId, { granteeSub, mode: shareMode });
      await openShares(rootTaskId);
      setShareGranteeSub("");
    } catch (error) {
      if (isAbortError(error)) return;
      setSharesError(toUiError(error));
    } finally {
      setSharesLoading(false);
    }
  }, [tokens, shareGranteeSub, shareMode, openShares]);

  const removeShare = useCallback(async (rootTaskId: string, granteeSub: string) => {
    if (!tokens) return;
    if (!window.confirm(`Revoke access for ${granteeSub}?`)) return;

    setSharesError(null);
    setSharesLoading(true);
    try {
      await revokeShare(tokens, rootTaskId, granteeSub);
      await openShares(rootTaskId);
    } catch (error) {
      if (isAbortError(error)) return;
      setSharesError(toUiError(error));
    } finally {
      setSharesLoading(false);
    }
  }, [tokens, openShares]);

  return {
    shareFor,
    shareGranteeSub,
    shareMode,
    shares,
    sharesLoading,
    sharesError,
    openShares,
    closeShares,
    submitShare,
    removeShare,
    setShareGranteeSub,
    setShareMode,
    setSharesError,
  };
}
