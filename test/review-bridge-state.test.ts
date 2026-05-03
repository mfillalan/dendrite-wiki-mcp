import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatReviewBridgeError,
  hasSavedTokenForDifferentBridgeSession,
  isReviewBridgeTokenExpired,
  parseSavedReviewBridgeAuth,
  reconcileReviewBridgeHealth,
  serializeSavedReviewBridgeAuth
} from '../docs/.vitepress/theme/components/reviewBridgeState.js';

test('review bridge state parses saved auth values and preserves legacy plain-token storage', () => {
  assert.deepEqual(parseSavedReviewBridgeAuth(null), { token: '', sessionId: '' });
  assert.deepEqual(parseSavedReviewBridgeAuth('legacy-token'), { token: 'legacy-token', sessionId: '' });
  assert.deepEqual(
    parseSavedReviewBridgeAuth('{"token":"saved-token","sessionId":"bridge-session"}'),
    { token: 'saved-token', sessionId: 'bridge-session' }
  );
});

test('review bridge state serializes saved auth values for board storage', () => {
  assert.equal(
    serializeSavedReviewBridgeAuth({ token: 'saved-token', sessionId: 'bridge-session' }),
    '{"token":"saved-token","sessionId":"bridge-session"}'
  );
});

test('review bridge state detects saved tokens from older bridge sessions', () => {
  assert.equal(hasSavedTokenForDifferentBridgeSession('saved-token', 'old-session', 'new-session'), true);
  assert.equal(hasSavedTokenForDifferentBridgeSession('', 'old-session', 'new-session'), false);
  assert.equal(hasSavedTokenForDifferentBridgeSession('saved-token', '', 'new-session'), false);
  assert.equal(hasSavedTokenForDifferentBridgeSession('saved-token', 'same-session', 'same-session'), false);
});

test('review bridge state detects token expiry from health metadata', () => {
  const nowMs = Date.parse('2026-05-03T12:00:00.000Z');
  assert.equal(isReviewBridgeTokenExpired('', nowMs), false);
  assert.equal(isReviewBridgeTokenExpired('2026-05-03T12:00:01.000Z', nowMs), false);
  assert.equal(isReviewBridgeTokenExpired('2026-05-03T11:59:59.000Z', nowMs), true);
});

test('review bridge state reconciles health payloads without clearing same-session tokens', () => {
  assert.deepEqual(
    reconcileReviewBridgeHealth(
      { token: 'saved-token', sessionId: 'bridge-session' },
      {
        ok: true,
        bridge: 'dendrite-wiki-review-bridge',
        sessionId: 'bridge-session',
        executePath: '/actions/execute',
        auth: {
          type: 'header-token',
          headerName: 'x-dendrite-review-token',
          issuedAt: '2026-05-03T12:00:00.000Z',
          expiresAt: '2026-05-03T12:30:00.000Z',
          ttlMs: 1800000
        }
      }
    ),
    {
      bridgeAvailable: true,
      bridgeSessionId: 'bridge-session',
      bridgeTokenHeaderName: 'x-dendrite-review-token',
      bridgeTokenIssuedAt: '2026-05-03T12:00:00.000Z',
      bridgeTokenExpiresAt: '2026-05-03T12:30:00.000Z',
      nextSavedAuth: { token: 'saved-token', sessionId: 'bridge-session' },
      bridgeError: ''
    }
  );
});

test('review bridge state reconciles health payloads by clearing tokens from older sessions', () => {
  assert.deepEqual(
    reconcileReviewBridgeHealth(
      { token: 'saved-token', sessionId: 'old-session' },
      {
        ok: true,
        bridge: 'dendrite-wiki-review-bridge',
        sessionId: 'new-session',
        executePath: '/actions/execute',
        auth: {
          type: 'header-token',
          headerName: 'x-dendrite-review-token',
          issuedAt: '2026-05-03T12:00:00.000Z',
          expiresAt: null,
          ttlMs: null
        }
      }
    ),
    {
      bridgeAvailable: true,
      bridgeSessionId: 'new-session',
      bridgeTokenHeaderName: 'x-dendrite-review-token',
      bridgeTokenIssuedAt: '2026-05-03T12:00:00.000Z',
      bridgeTokenExpiresAt: '',
      nextSavedAuth: { token: '', sessionId: '' },
      bridgeError: 'The saved review bridge token belongs to an older bridge session. Paste the fresh token from the review-bridge terminal and save it again.'
    }
  );
});

test('review bridge state formats structured bridge errors for the board', () => {
  assert.equal(
    formatReviewBridgeError({ errorCode: 'missing-review-bridge-token', headerName: 'x-bridge-token' }, 'x-fallback-token'),
    'Paste the review bridge token from the review-bridge terminal into x-bridge-token before running actions.'
  );
  assert.equal(
    formatReviewBridgeError({ errorCode: 'invalid-review-bridge-token' }, 'x-fallback-token'),
    'The saved review bridge token was rejected. Paste the latest x-fallback-token value from the review-bridge terminal and try again.'
  );
  assert.equal(
    formatReviewBridgeError({ errorCode: 'expired-review-bridge-token' }, 'x-fallback-token'),
    'The review bridge token expired. Restart npm run review-bridge to print a fresh token, then paste and save it here.'
  );
  assert.equal(
    formatReviewBridgeError({ errorCode: 'confirmation-required', actionId: 'proposal:abc' }, 'x-fallback-token'),
    'The bridge refused proposal:abc because it still requires explicit confirmation.'
  );
  assert.equal(
    formatReviewBridgeError({ errorCode: 'unknown-maintenance-action', actionId: 'lint:missing' }, 'x-fallback-token'),
    'The bridge could not resolve lint:missing. Refresh the board and try again.'
  );
  assert.equal(
    formatReviewBridgeError({ error: 'Custom bridge failure' }, 'x-fallback-token'),
    'Custom bridge failure'
  );
});