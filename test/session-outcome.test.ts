import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateClusterTag,
  classifySessionOutcomes,
  isVerificationCommand,
  synapticTagSortPriority,
  type RawObservation
} from '@rarusoft/dendrite-memory';

function obs(partial: Partial<RawObservation>): RawObservation {
  return {
    ts: partial.ts ?? new Date().toISOString(),
    sessionId: partial.sessionId ?? 'session_a',
    tool: partial.tool ?? 'Bash',
    kind: partial.kind ?? 'command',
    target: partial.target ?? '',
    outcome: partial.outcome ?? 'unknown',
    summary: partial.summary ?? ''
  };
}

test('isVerificationCommand recognizes common test/build commands across ecosystems', () => {
  assert.ok(isVerificationCommand('npm test'));
  assert.ok(isVerificationCommand('npm run check'));
  assert.ok(isVerificationCommand('pytest tests/'));
  assert.ok(isVerificationCommand('cargo test --all'));
  assert.ok(isVerificationCommand('go test ./...'));
  assert.ok(isVerificationCommand('git commit -m "msg"'));
  assert.ok(isVerificationCommand('tsc --noEmit'));
  assert.ok(isVerificationCommand('jest'));

  assert.equal(isVerificationCommand('ls -la'), false);
  assert.equal(isVerificationCommand('cat package.json'), false);
  assert.equal(isVerificationCommand(''), false);
});

test('classifySessionOutcomes tags a session that ran passing tests as verified-success', () => {
  const verdicts = classifySessionOutcomes([
    obs({ sessionId: 's1', tool: 'Edit', kind: 'edit', target: 'src/foo.ts', outcome: 'ok' }),
    obs({ sessionId: 's1', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'ok' })
  ]);
  const verdict = verdicts.get('s1');
  assert.ok(verdict);
  assert.equal(verdict.tag, 'verified-success');
  assert.equal(verdict.successCommandCount, 1);
});

test('classifySessionOutcomes tags a session whose final verification failed as likely-error', () => {
  const t0 = new Date('2026-05-06T10:00:00Z').toISOString();
  const t1 = new Date('2026-05-06T10:05:00Z').toISOString();
  const t2 = new Date('2026-05-06T10:10:00Z').toISOString();
  const verdicts = classifySessionOutcomes([
    obs({ ts: t0, sessionId: 's1', tool: 'Edit', kind: 'edit', target: 'src/foo.ts', outcome: 'ok' }),
    obs({ ts: t1, sessionId: 's1', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'ok' }),
    obs({ ts: t2, sessionId: 's1', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'error' })
  ]);
  const verdict = verdicts.get('s1');
  assert.ok(verdict);
  assert.equal(verdict.tag, 'likely-error', 'last verification failure must override earlier success');
});

test('classifySessionOutcomes tags a session with errors and no verification command as likely-error', () => {
  const verdicts = classifySessionOutcomes([
    obs({ sessionId: 's1', tool: 'Edit', kind: 'edit', target: 'src/foo.ts', outcome: 'error' }),
    obs({ sessionId: 's1', tool: 'Bash', kind: 'command', target: 'ls', outcome: 'ok' })
  ]);
  const verdict = verdicts.get('s1');
  assert.ok(verdict);
  assert.equal(verdict.tag, 'likely-error');
});

test('classifySessionOutcomes tags an unverified session with no errors as inconclusive', () => {
  const verdicts = classifySessionOutcomes([
    obs({ sessionId: 's1', tool: 'Read', kind: 'read', target: 'src/foo.ts', outcome: 'ok' }),
    obs({ sessionId: 's1', tool: 'Grep', kind: 'search', target: 'pattern', outcome: 'ok' })
  ]);
  const verdict = verdicts.get('s1');
  assert.ok(verdict);
  assert.equal(verdict.tag, 'inconclusive');
});

test('classifySessionOutcomes processes multiple sessions independently', () => {
  const verdicts = classifySessionOutcomes([
    obs({ sessionId: 's_pass', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'ok' }),
    obs({ sessionId: 's_fail', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'error' }),
    obs({ sessionId: 's_quiet', tool: 'Read', kind: 'read', target: 'README', outcome: 'ok' })
  ]);
  assert.equal(verdicts.get('s_pass')?.tag, 'verified-success');
  assert.equal(verdicts.get('s_fail')?.tag, 'likely-error');
  assert.equal(verdicts.get('s_quiet')?.tag, 'inconclusive');
});

test('aggregateClusterTag tags a cluster as verified-success when at least one session succeeded and successes >= errors', () => {
  const sessionOutcomes = classifySessionOutcomes([
    obs({ sessionId: 's_pass', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'ok' }),
    obs({ sessionId: 's_quiet', tool: 'Read', kind: 'read', target: 'README', outcome: 'ok' })
  ]);
  const aggregate = aggregateClusterTag(['s_pass', 's_quiet'], sessionOutcomes);
  assert.equal(aggregate.synapticTag, 'verified-success');
  assert.equal(aggregate.successSessionCount, 1);
  assert.equal(aggregate.inconclusiveSessionCount, 1);
  assert.equal(aggregate.errorSessionCount, 0);
});

test('aggregateClusterTag tags a cluster as likely-error when error sessions strictly outnumber success sessions', () => {
  const sessionOutcomes = classifySessionOutcomes([
    obs({ sessionId: 's_fail1', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'error' }),
    obs({ sessionId: 's_fail2', tool: 'Bash', kind: 'command', target: 'npm test', outcome: 'error' })
  ]);
  const aggregate = aggregateClusterTag(['s_fail1', 's_fail2'], sessionOutcomes);
  assert.equal(aggregate.synapticTag, 'likely-error');
  assert.equal(aggregate.errorSessionCount, 2);
});

test('aggregateClusterTag tags a cluster as inconclusive when no session has either tag', () => {
  const sessionOutcomes = classifySessionOutcomes([
    obs({ sessionId: 's_quiet', tool: 'Read', kind: 'read', target: 'README', outcome: 'ok' })
  ]);
  const aggregate = aggregateClusterTag(['s_quiet'], sessionOutcomes);
  assert.equal(aggregate.synapticTag, 'inconclusive');
  assert.equal(aggregate.successSessionCount, 0);
  assert.equal(aggregate.errorSessionCount, 0);
});

test('synapticTagSortPriority orders verified-success > inconclusive > likely-error', () => {
  assert.ok(synapticTagSortPriority('verified-success') > synapticTagSortPriority('inconclusive'));
  assert.ok(synapticTagSortPriority('inconclusive') > synapticTagSortPriority('likely-error'));
});
