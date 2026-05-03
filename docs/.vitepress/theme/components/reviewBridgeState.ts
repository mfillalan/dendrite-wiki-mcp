export interface SavedReviewBridgeAuth {
  token: string;
  sessionId: string;
}

export interface ReviewBridgeHealth {
  ok: boolean;
  bridge: string;
  sessionId: string;
  executePath: string;
  auth: {
    type: string;
    headerName: string;
    issuedAt: string;
    expiresAt: string | null;
    ttlMs: number | null;
  };
}

export interface ReconciledReviewBridgeHealth {
  bridgeAvailable: boolean;
  bridgeSessionId: string;
  bridgeTokenHeaderName: string;
  bridgeTokenIssuedAt: string;
  bridgeTokenExpiresAt: string;
  nextSavedAuth: SavedReviewBridgeAuth;
  bridgeError: string;
}

export interface ReviewBridgeErrorPayload {
  error?: string;
  errorCode?: string;
  actionId?: string;
  actionKind?: string;
  authRequired?: boolean;
  headerName?: string;
  expiredAt?: string;
  restartRequired?: boolean;
  confirmationRequired?: boolean;
}

export function parseSavedReviewBridgeAuth(storedValue: string | null): SavedReviewBridgeAuth {
  if (!storedValue) {
    return { token: '', sessionId: '' };
  }

  try {
    const parsed = JSON.parse(storedValue) as Partial<SavedReviewBridgeAuth>;
    return {
      token: typeof parsed.token === 'string' ? parsed.token : '',
      sessionId: typeof parsed.sessionId === 'string' ? parsed.sessionId : ''
    };
  } catch {
    return { token: storedValue, sessionId: '' };
  }
}

export function serializeSavedReviewBridgeAuth(auth: SavedReviewBridgeAuth): string {
  return JSON.stringify(auth);
}

export function hasSavedTokenForDifferentBridgeSession(token: string, savedSessionId: string, currentSessionId: string): boolean {
  return token.trim().length > 0 && savedSessionId.length > 0 && savedSessionId !== currentSessionId;
}

export function reconcileReviewBridgeHealth(savedAuth: SavedReviewBridgeAuth, health: ReviewBridgeHealth): ReconciledReviewBridgeHealth {
  const sessionChanged = hasSavedTokenForDifferentBridgeSession(savedAuth.token, savedAuth.sessionId, health.sessionId);

  return {
    bridgeAvailable: health.ok,
    bridgeSessionId: health.sessionId,
    bridgeTokenHeaderName: health.auth.headerName,
    bridgeTokenIssuedAt: health.auth.issuedAt,
    bridgeTokenExpiresAt: health.auth.expiresAt ?? '',
    nextSavedAuth: sessionChanged ? { token: '', sessionId: '' } : savedAuth,
    bridgeError: sessionChanged
      ? 'The saved review bridge token belongs to an older bridge session. Paste the fresh token from the review-bridge terminal and save it again.'
      : ''
  };
}

export function isReviewBridgeTokenExpired(expiresAt: string, nowMs = Date.now()): boolean {
  return expiresAt.length > 0 && nowMs >= Date.parse(expiresAt);
}

export function formatReviewBridgeError(payload: ReviewBridgeErrorPayload, fallbackHeaderName: string): string {
  switch (payload.errorCode) {
    case 'missing-review-bridge-token':
      return `Paste the review bridge token from the review-bridge terminal into ${payload.headerName ?? fallbackHeaderName} before running actions.`;
    case 'invalid-review-bridge-token':
      return `The saved review bridge token was rejected. Paste the latest ${payload.headerName ?? fallbackHeaderName} value from the review-bridge terminal and try again.`;
    case 'expired-review-bridge-token':
      return 'The review bridge token expired. Restart npm run review-bridge to print a fresh token, then paste and save it here.';
    case 'confirmation-required':
      return `The bridge refused ${payload.actionId ?? 'this action'} because it still requires explicit confirmation.`;
    case 'unknown-maintenance-action':
      return `The bridge could not resolve ${payload.actionId ?? 'that action'}. Refresh the board and try again.`;
    default:
      return payload.error ?? 'Bridge execution failed.';
  }
}