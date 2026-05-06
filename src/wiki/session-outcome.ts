// Session-outcome classifier — the "synaptic tag" layer that turns the raw observation
// stream into per-session verdicts the maintenance inbox can use to up-weight clusters
// born from verified work and down-weight clusters born from unresolved debugging dead-ends.
//
// Why this exists: today every observation cluster competes for operator attention equally,
// regardless of whether the session ended with `npm test` green or with a string of errors
// and an abandonment. The biological analogy is synaptic tagging and capture (Frey & Morris,
// 1997): a transient memory trace is consolidated into long-term memory only when a tagging
// event (here, a verified success) marks it. Clusters whose contributing sessions earned a
// success tag are more likely to represent learned-and-verified knowledge, so they should
// surface first for crystallization into curated memory or wiki pages.
//
// Pure deterministic, no LLM. Matches the project's principle: explainable signals only.

import type { RawObservation } from './raw-observations.js';

export type SessionOutcomeTag = 'verified-success' | 'likely-error' | 'inconclusive';

export interface SessionOutcome {
  sessionId: string;
  tag: SessionOutcomeTag;
  reason: string;
  observationCount: number;
  successCommandCount: number;
  errorObservationCount: number;
}

// Verification commands that, when run with outcome=ok, are evidence the agent's work
// reached a verified success state. These are the same kinds of commands a human would
// recognize as "the tests pass" or "the build is green". Pattern-matched against the
// observation target (typically the bash command head) — case-insensitive, substring.
const VERIFICATION_COMMAND_PATTERNS = [
  /\bnpm (test|run test|run check|run build|run typecheck|run lint)\b/i,
  /\byarn (test|build|check|typecheck|lint)\b/i,
  /\bpnpm (test|build|check|typecheck|lint)\b/i,
  /\bbun (test|build|check)\b/i,
  /\bpytest\b/i,
  /\bpython -m (pytest|unittest)\b/i,
  /\bcargo (test|check|build|clippy)\b/i,
  /\bgo (test|build|vet)\b/i,
  /\bmvn (test|verify|package)\b/i,
  /\bgradle (test|check|build)\b/i,
  /\bdotnet (test|build)\b/i,
  /\btsc(\s|$)/i,
  /\beslint(\s|$)/i,
  /\bjest(\s|$)/i,
  /\bvitest(\s|$)/i,
  /\bgit commit\b/i
];

export function isVerificationCommand(target: string): boolean {
  if (!target) {
    return false;
  }
  return VERIFICATION_COMMAND_PATTERNS.some((pattern) => pattern.test(target));
}

// Group observations by session and produce one verdict per session. The verdict is the
// signal the cluster ranker uses; its semantics are deliberately conservative so the
// "verified-success" tag is only assigned when there is positive evidence (a successful
// verification command), not merely the absence of errors.
export function classifySessionOutcomes(observations: RawObservation[]): Map<string, SessionOutcome> {
  const grouped = new Map<string, RawObservation[]>();
  for (const observation of observations) {
    if (!observation.sessionId) {
      continue;
    }
    const existing = grouped.get(observation.sessionId) ?? [];
    existing.push(observation);
    grouped.set(observation.sessionId, existing);
  }

  const verdicts = new Map<string, SessionOutcome>();
  for (const [sessionId, items] of grouped) {
    verdicts.set(sessionId, classifySingleSession(sessionId, items));
  }
  return verdicts;
}

function classifySingleSession(sessionId: string, observations: RawObservation[]): SessionOutcome {
  const sortedAscending = [...observations].sort(
    (left, right) => Date.parse(left.ts) - Date.parse(right.ts)
  );

  let successCommandCount = 0;
  let errorObservationCount = 0;
  let lastVerificationOutcome: 'ok' | 'error' | undefined;

  for (const observation of sortedAscending) {
    if (observation.outcome === 'error') {
      errorObservationCount += 1;
    }
    if (observation.kind === 'command' && isVerificationCommand(observation.target)) {
      if (observation.outcome === 'ok') {
        successCommandCount += 1;
        lastVerificationOutcome = 'ok';
      } else if (observation.outcome === 'error') {
        lastVerificationOutcome = 'error';
      }
    }
  }

  if (lastVerificationOutcome === 'ok' && successCommandCount > 0) {
    return {
      sessionId,
      tag: 'verified-success',
      reason: `${successCommandCount} successful verification command${successCommandCount === 1 ? '' : 's'}; last verification ended ok`,
      observationCount: observations.length,
      successCommandCount,
      errorObservationCount
    };
  }

  // If the session's last verification command failed, OR the session has errors and no
  // successful verification commands at all, treat it as a likely-error session. The cluster
  // ranker uses this to push these clusters down (they may still be promotable, but they're
  // less likely to represent verified knowledge).
  if (lastVerificationOutcome === 'error' || (errorObservationCount > 0 && successCommandCount === 0)) {
    const reason = lastVerificationOutcome === 'error'
      ? `last verification command ended in error (${errorObservationCount} error observation${errorObservationCount === 1 ? '' : 's'} in session)`
      : `${errorObservationCount} error observation${errorObservationCount === 1 ? '' : 's'}, no successful verification command`;
    return {
      sessionId,
      tag: 'likely-error',
      reason,
      observationCount: observations.length,
      successCommandCount,
      errorObservationCount
    };
  }

  return {
    sessionId,
    tag: 'inconclusive',
    reason: 'no verification command observed and no error outcomes',
    observationCount: observations.length,
    successCommandCount,
    errorObservationCount
  };
}

// Per-cluster aggregate of contributing sessions' outcomes. A cluster carries this so the
// inbox ranker can re-order without reclassifying — classification happens once per inbox
// build, the ranker just reads the aggregate.
export interface ClusterSynapticTag {
  successSessionCount: number;
  errorSessionCount: number;
  inconclusiveSessionCount: number;
  synapticTag: SessionOutcomeTag;
  reason: string;
}

export function aggregateClusterTag(
  contributingSessionIds: string[],
  sessionOutcomes: Map<string, SessionOutcome>
): ClusterSynapticTag {
  let successSessionCount = 0;
  let errorSessionCount = 0;
  let inconclusiveSessionCount = 0;

  for (const sessionId of contributingSessionIds) {
    const outcome = sessionOutcomes.get(sessionId);
    if (!outcome) {
      inconclusiveSessionCount += 1;
      continue;
    }
    if (outcome.tag === 'verified-success') {
      successSessionCount += 1;
    } else if (outcome.tag === 'likely-error') {
      errorSessionCount += 1;
    } else {
      inconclusiveSessionCount += 1;
    }
  }

  // Cluster-level tag rule: if at least one contributing session reached verified-success
  // AND success sessions outnumber error sessions, the cluster inherits the success tag.
  // If error sessions strictly outnumber success sessions, it's likely-error. Otherwise
  // inconclusive. This is intentionally conservative — the success tag is hard to earn,
  // which is the whole point of the synaptic-tagging analogy.
  let synapticTag: SessionOutcomeTag;
  let reason: string;
  if (successSessionCount > 0 && successSessionCount >= errorSessionCount) {
    synapticTag = 'verified-success';
    reason = `${successSessionCount} session${successSessionCount === 1 ? '' : 's'} reached verified success`;
  } else if (errorSessionCount > successSessionCount) {
    synapticTag = 'likely-error';
    reason = `${errorSessionCount} session${errorSessionCount === 1 ? '' : 's'} ended in errors without verified success`;
  } else {
    synapticTag = 'inconclusive';
    reason = 'no contributing session reached a verification command';
  }

  return {
    successSessionCount,
    errorSessionCount,
    inconclusiveSessionCount,
    synapticTag,
    reason
  };
}

// Sort priority for cluster ordering. Higher = surface first. Used by the maintenance
// inbox to push verified-success clusters to the top so reviewer attention compounds on
// learned-and-verified knowledge instead of dead-end debugging firehoses.
export function synapticTagSortPriority(tag: SessionOutcomeTag): number {
  switch (tag) {
    case 'verified-success':
      return 2;
    case 'inconclusive':
      return 1;
    case 'likely-error':
      return 0;
  }
}
