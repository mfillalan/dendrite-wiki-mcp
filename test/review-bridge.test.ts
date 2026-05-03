import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Server } from 'node:http';

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');
const reviewBridgeToken = 'test-review-bridge-token';

test('review bridge exposes health and executes maintenance actions against an isolated fixture copy', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-review-bridge-'));
  const tempFixtureRoot = path.join(tempRoot, 'problem-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  let server: Server | undefined;

  try {
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'review-bridge.ts')).href}?fixture=${Date.now()}-${Math.random()}`;
    const { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } = await import(moduleUrl);
    server = createReviewBridgeServer({ authToken: reviewBridgeToken });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), {
      ok: true,
      bridge: 'dendrite-wiki-review-bridge',
      executePath: '/actions/execute',
      auth: {
        type: 'header-token',
        headerName: REVIEW_BRIDGE_TOKEN_HEADER
      }
    });

    const missingTokenResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(missingTokenResponse.status, 401);
    assert.deepEqual(await missingTokenResponse.json(), {
      error: 'Missing review bridge token.',
      errorCode: 'missing-review-bridge-token',
      authRequired: true,
      headerName: REVIEW_BRIDGE_TOKEN_HEADER
    });

    const executeHeaders = {
      'Content-Type': 'application/json',
      [REVIEW_BRIDGE_TOKEN_HEADER]: reviewBridgeToken
    };

    const invalidTokenResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [REVIEW_BRIDGE_TOKEN_HEADER]: 'wrong-token'
      },
      body: JSON.stringify({ actionId: 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals' })
    });
    assert.equal(invalidTokenResponse.status, 403);
    assert.deepEqual(await invalidTokenResponse.json(), {
      error: 'Invalid review bridge token.',
      errorCode: 'invalid-review-bridge-token',
      authRequired: true,
      headerName: REVIEW_BRIDGE_TOKEN_HEADER
    });

    const missingActionResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'POST',
      headers: executeHeaders,
      body: JSON.stringify({})
    });
    assert.equal(missingActionResponse.status, 400);
    assert.deepEqual(await missingActionResponse.json(), {
      error: 'Missing actionId.',
      errorCode: 'missing-action-id'
    });

    const missingConfirmationResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'POST',
      headers: executeHeaders,
      body: JSON.stringify({ actionId: 'proposal:pending-review/route-guidance-agents-md:apply-proposal' })
    });
    assert.equal(missingConfirmationResponse.status, 409);
    assert.deepEqual(await missingConfirmationResponse.json(), {
      error: 'Confirmation required for maintenance action: proposal:pending-review/route-guidance-agents-md:apply-proposal',
      errorCode: 'confirmation-required',
      actionId: 'proposal:pending-review/route-guidance-agents-md:apply-proposal',
      actionKind: 'apply-proposal',
      confirmationRequired: true
    });

    const executeResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'POST',
      headers: executeHeaders,
      body: JSON.stringify({ actionId: 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals' })
    });
    assert.equal(executeResponse.status, 200);

    const artifact = (await executeResponse.json()) as {
      refreshedPageCount: number;
      execution: {
        actionId: string;
        resultKind: string;
        resultSummary: string;
        result: { proposals: Array<{ reviewSlug: string }> };
      };
    };

    assert.equal(artifact.refreshedPageCount, 4);
    assert.equal(artifact.execution.actionId, 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals');
    assert.equal(artifact.execution.resultKind, 'proposal-list');
    assert.equal(artifact.execution.resultSummary, 'Found 3 active proposals.');
    assert.ok(
      artifact.execution.result.proposals.some(
        (proposal) => proposal.reviewSlug === 'pending-review/merge-guidance-github-copilot-instructions-md'
      )
    );

    const artifactFile = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'maintenance-action-result.json'), 'utf8')
    ) as { execution: { actionId: string } };
    assert.equal(artifactFile.execution.actionId, artifact.execution.actionId);

    const inboxSnapshot = JSON.parse(
      await fs.readFile(path.join(tempFixtureRoot, 'docs', 'public', 'maintenance-inbox.json'), 'utf8')
    ) as {
      status: {
        proposalCount: number;
        lintFindingCount: number;
        proposalGroups: Array<{ kind: string; count: number }>;
      };
    };
    assert.equal(inboxSnapshot.status.proposalCount, 3);
    assert.equal(inboxSnapshot.status.lintFindingCount, 19);
    assert.deepEqual(inboxSnapshot.status.proposalGroups, [
      { kind: 'route-guidance', count: 2 },
      { kind: 'merge-guidance', count: 1 }
    ]);

    const confirmedApplyResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'POST',
      headers: executeHeaders,
      body: JSON.stringify({
        actionId: 'proposal:pending-review/route-guidance-agents-md:apply-proposal',
        confirmActionId: 'proposal:pending-review/route-guidance-agents-md:apply-proposal'
      })
    });
    assert.equal(confirmedApplyResponse.status, 200);
    const confirmedApplyArtifact = (await confirmedApplyResponse.json()) as {
      execution: {
        actionId: string;
        resultKind: string;
        resultSummary: string;
      };
    };
    assert.equal(confirmedApplyArtifact.execution.actionId, 'proposal:pending-review/route-guidance-agents-md:apply-proposal');
    assert.equal(confirmedApplyArtifact.execution.resultKind, 'applied-proposal');
    assert.match(confirmedApplyArtifact.execution.resultSummary, /Applied route-guidance proposal/);
  } finally {
    process.chdir(originalCwd);

    if (server) {
      server.close();
      await once(server, 'close');
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});