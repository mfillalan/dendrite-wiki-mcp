import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { once } from 'node:events';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import type { Server } from 'node:http';

const execFileAsync = promisify(execFile);

const repoRoot = process.cwd();
const fixtureRoot = path.join(repoRoot, 'test', 'fixtures', 'problem-wiki');
const reviewBridgeToken = 'test-review-bridge-token';
const reviewBridgeIssuedAt = Date.parse('2026-05-03T10:00:00.000Z');
const reviewBridgeSessionId = 'test-review-bridge-session';
const allowedReviewBridgeOrigin = 'http://127.0.0.1:5177';
const disallowedReviewBridgeOrigin = 'https://example.com';

test('review bridge exposes health and executes maintenance actions against an isolated fixture copy', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-review-bridge-'));
  const tempFixtureRoot = path.join(tempRoot, 'problem-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  let server: Server | undefined;
  let currentTimeMs = reviewBridgeIssuedAt;

  try {
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'review-bridge.ts')).href}?fixture=${Date.now()}-${Math.random()}`;
    const { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } = await import(moduleUrl);
    server = createReviewBridgeServer({
      authToken: reviewBridgeToken,
      authTokenTtlMs: 1_000,
      now: () => currentTimeMs,
      sessionId: reviewBridgeSessionId,
      allowedOrigins: [allowedReviewBridgeOrigin]
    });
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
      sessionId: reviewBridgeSessionId,
      executePath: '/actions/execute',
      previewPromotionPath: '/preview/memory-promotion',
      previewProposalPath: '/preview/wiki-proposal',
      previewSkillPromotionPath: '/preview/memory-promote-skill',
      synthesizeDriftPath: '/synthesize/drift',
      ollamaModelsPath: '/ollama/models',
      pageReadPath: '/pages/read',
      pageWritePath: '/pages/write',
      pageListPath: '/pages/list',
      allowedOrigins: [allowedReviewBridgeOrigin],
      auth: {
        type: 'header-token',
        headerName: REVIEW_BRIDGE_TOKEN_HEADER,
        issuedAt: '2026-05-03T10:00:00.000Z',
        expiresAt: '2026-05-03T10:00:01.000Z',
        ttlMs: 1_000
      }
    });

    const allowedOriginHealthResponse = await fetch(`${baseUrl}/health`, {
      headers: { Origin: allowedReviewBridgeOrigin }
    });
    assert.equal(allowedOriginHealthResponse.status, 200);
    assert.equal(allowedOriginHealthResponse.headers.get('access-control-allow-origin'), allowedReviewBridgeOrigin);

    const allowedOriginOptionsResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'OPTIONS',
      headers: {
        Origin: allowedReviewBridgeOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': `Content-Type, ${REVIEW_BRIDGE_TOKEN_HEADER}`
      }
    });
    assert.equal(allowedOriginOptionsResponse.status, 204);
    assert.equal(allowedOriginOptionsResponse.headers.get('access-control-allow-origin'), allowedReviewBridgeOrigin);
    assert.equal(allowedOriginOptionsResponse.headers.get('access-control-allow-methods'), 'GET,POST,OPTIONS');
    assert.equal(
      allowedOriginOptionsResponse.headers.get('access-control-allow-headers'),
      `Content-Type, ${REVIEW_BRIDGE_TOKEN_HEADER}`
    );
    assert.equal(allowedOriginOptionsResponse.headers.get('access-control-max-age'), '600');

    const disallowedOriginHealthResponse = await fetch(`${baseUrl}/health`, {
      headers: { Origin: disallowedReviewBridgeOrigin }
    });
    assert.equal(disallowedOriginHealthResponse.status, 403);
    assert.deepEqual(await disallowedOriginHealthResponse.json(), {
      error: `Origin not allowed: ${disallowedReviewBridgeOrigin}`,
      errorCode: 'disallowed-origin',
      origin: disallowedReviewBridgeOrigin,
      allowedOrigins: [allowedReviewBridgeOrigin]
    });

    const disallowedOriginOptionsResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'OPTIONS',
      headers: {
        Origin: disallowedReviewBridgeOrigin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': `Content-Type, ${REVIEW_BRIDGE_TOKEN_HEADER}`
      }
    });
    assert.equal(disallowedOriginOptionsResponse.status, 403);
    assert.equal(disallowedOriginOptionsResponse.headers.get('access-control-allow-origin'), null);
    assert.equal(disallowedOriginOptionsResponse.headers.get('access-control-max-age'), null);
    assert.deepEqual(await disallowedOriginOptionsResponse.json(), {
      error: `Origin not allowed: ${disallowedReviewBridgeOrigin}`,
      errorCode: 'disallowed-origin',
      origin: disallowedReviewBridgeOrigin,
      allowedOrigins: [allowedReviewBridgeOrigin]
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
      Origin: allowedReviewBridgeOrigin,
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

    assert.equal(artifact.refreshedPageCount, 5);
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

    currentTimeMs = reviewBridgeIssuedAt + 1_500;
    const expiredTokenResponse = await fetch(`${baseUrl}/actions/execute`, {
      method: 'POST',
      headers: executeHeaders,
      body: JSON.stringify({ actionId: 'lint:duplicate-guidance:.github/copilot-instructions.md:check-proposals' })
    });
    assert.equal(expiredTokenResponse.status, 401);
    assert.deepEqual(await expiredTokenResponse.json(), {
      error: 'Review bridge token expired.',
      errorCode: 'expired-review-bridge-token',
      authRequired: true,
      headerName: REVIEW_BRIDGE_TOKEN_HEADER,
      expiredAt: '2026-05-03T10:00:01.000Z',
      restartRequired: true
    });
  } finally {
    process.chdir(originalCwd);

    if (server) {
      server.close();
      await once(server, 'close');
    }

    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('review bridge preview endpoint returns a unified diff for a promotion-ready memory', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-review-bridge-preview-'));
  const tempFixtureRoot = path.join(tempRoot, 'problem-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  let server: Server | undefined;

  try {
    const reviewBridgeModuleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'review-bridge.ts')).href}?fixture=preview-${Date.now()}-${Math.random()}`;
    const memoryStoreModuleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'memory-store.ts')).href}?fixture=preview-${Date.now()}-${Math.random()}`;
    const { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } = await import(reviewBridgeModuleUrl);
    const { rememberProjectMemory } = await import(memoryStoreModuleUrl) as typeof import('../src/wiki/memory-store.js');

    const seeded = await rememberProjectMemory({
      text: 'Architecture pages should always link the project log when project truth changes.',
      kind: 'lesson',
      relatedPages: ['architecture'],
      sources: [{ kind: 'wiki', slug: 'architecture', label: 'Architecture' }]
    });

    server = createReviewBridgeServer({
      authToken: reviewBridgeToken,
      authTokenTtlMs: 1_000,
      now: () => reviewBridgeIssuedAt,
      sessionId: reviewBridgeSessionId,
      allowedOrigins: [allowedReviewBridgeOrigin]
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    // Missing memoryIds yields a clean validation error rather than throwing.
    const missingIdsResponse = await fetch(`${baseUrl}/preview/memory-promotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [REVIEW_BRIDGE_TOKEN_HEADER]: reviewBridgeToken
      },
      body: JSON.stringify({})
    });
    assert.equal(missingIdsResponse.status, 400);
    assert.deepEqual(await missingIdsResponse.json(), {
      error: 'Provide at least one memoryId in the request body.',
      errorCode: 'missing-memory-ids'
    });

    // Token gate fires for the preview path too.
    const missingTokenResponse = await fetch(`${baseUrl}/preview/memory-promotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryIds: [seeded.id] })
    });
    assert.equal(missingTokenResponse.status, 401);
    assert.equal(((await missingTokenResponse.json()) as { errorCode: string }).errorCode, 'missing-review-bridge-token');

    // Happy path: preview returns target metadata + diff + proposed content.
    const previewResponse = await fetch(`${baseUrl}/preview/memory-promotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [REVIEW_BRIDGE_TOKEN_HEADER]: reviewBridgeToken
      },
      body: JSON.stringify({ memoryIds: [seeded.id] })
    });
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()) as {
      mode: string;
      memoryIds: string[];
      targetPage: { slug: string; path: string; title: string; exists: boolean };
      sectionHeading: string;
      proposedSectionAnchor: string;
      proposedText: string;
      currentContent: string;
      proposedContent: string;
      unifiedDiff: string;
      skippedBecauseUnchanged: boolean;
      sourceRefs: string[];
      warnings: string[];
    };

    assert.equal(preview.mode, 'preview');
    assert.deepEqual(preview.memoryIds, [seeded.id]);
    assert.equal(preview.targetPage.slug, 'architecture');
    assert.equal(preview.targetPage.path, 'docs/wiki/architecture.md');
    assert.equal(preview.sectionHeading, '## Promoted Lessons');
    assert.equal(preview.proposedSectionAnchor, 'promoted-lessons');
    assert.equal(preview.skippedBecauseUnchanged, false);
    assert.match(preview.proposedText, /Architecture pages should always link the project log/);
    assert.match(preview.proposedContent, /Architecture pages should always link the project log/);
    // The current content should NOT contain the proposed text yet.
    assert.doesNotMatch(preview.currentContent, /Architecture pages should always link the project log/);
    // Unified diff format from the diff package: starts with `Index:` then `===`/`---`/`+++` headers,
    // hunks (`@@ ... @@`), and `+`-prefixed added lines.
    assert.match(preview.unifiedDiff, /^Index: docs\/wiki\/architecture\.md/);
    assert.match(preview.unifiedDiff, /\+## Promoted Lessons/);
    assert.match(preview.unifiedDiff, /\+- Architecture pages should always link the project log/);

    // A second preview call after no changes should be idempotent — same diff.
    const repeatedPreviewResponse = await fetch(`${baseUrl}/preview/memory-promotion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [REVIEW_BRIDGE_TOKEN_HEADER]: reviewBridgeToken
      },
      body: JSON.stringify({ memoryIds: [seeded.id] })
    });
    assert.equal(repeatedPreviewResponse.status, 200);
    const repeated = (await repeatedPreviewResponse.json()) as { unifiedDiff: string };
    assert.equal(repeated.unifiedDiff, preview.unifiedDiff);
  } finally {
    if (server) {
      server.close();
      await once(server, 'close');
    }
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('embedded review bridge handler skips token auth and reports same-origin health', async () => {
  // Narrowly tests the same-origin auth mode behavior (no token gate, embedded bridge name,
  // confirmation gate still applied). The full runMaintenanceActionAndRefresh execution chain
  // is exercised by the standalone test above; here we only need to prove the auth mode
  // differs correctly.
  let server: Server | undefined;

  try {
    const { createReviewBridgeHandler } = await import(
      `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'review-bridge.ts')).href}?fixture=embedded-${Date.now()}-${Math.random()}`
    ) as typeof import('../src/wiki/review-bridge.js');
    const handler = createReviewBridgeHandler({
      authMode: 'same-origin',
      sessionId: 'embedded-test-session',
      healthPath: '/__review-bridge/health',
      executePath: '/__review-bridge/execute'
    });

    assert.equal(handler.bridge, 'dendrite-wiki-review-bridge-embedded');
    assert.equal(handler.authMode, 'same-origin');

    const { createServer } = await import('node:http');
    server = createServer(async (request, response) => {
      const handled = await handler.handle(request, response);
      if (!handled) {
        response.statusCode = 404;
        response.setHeader('Content-Type', 'application/json; charset=utf-8');
        response.end(JSON.stringify({ error: 'Not found.', errorCode: 'route-not-found' }));
      }
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const healthResponse = await fetch(`${baseUrl}/__review-bridge/health`);
    assert.equal(healthResponse.status, 200);
    const healthPayload = (await healthResponse.json()) as {
      bridge: string;
      executePath: string;
      sessionId: string;
      auth: { type: string };
    };
    assert.equal(healthPayload.bridge, 'dendrite-wiki-review-bridge-embedded');
    assert.equal(healthPayload.executePath, '/__review-bridge/execute');
    assert.equal(healthPayload.sessionId, 'embedded-test-session');
    assert.deepEqual(healthPayload.auth, { type: 'same-origin' });

    // Token gate is skipped. Even with no header at all, the request reaches actionId validation
    // and surfaces "missing-action-id" rather than "missing-review-bridge-token". This is the
    // critical assertion for the embedded mode contract.
    const noTokenNoActionId = await fetch(`${baseUrl}/__review-bridge/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assert.equal(noTokenNoActionId.status, 400);
    assert.deepEqual(await noTokenNoActionId.json(), {
      error: 'Missing actionId.',
      errorCode: 'missing-action-id'
    });

    // Empty body also lands at missing-actionId (proves no token check before body parse).
    const noBody = await fetch(`${baseUrl}/__review-bridge/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    assert.equal(noBody.status, 400);
    assert.equal(((await noBody.json()) as { errorCode: string }).errorCode, 'missing-action-id');
  } finally {
    if (server) {
      server.close();
      await once(server, 'close');
    }
  }
});

test('review bridge preview-proposal endpoint guards on token + missing reviewSlug + unknown slug', async () => {
  // Bridge-level validation only — does not exercise the happy path against a real proposal,
  // because src/wiki/store.ts captures repoRoot at module-load via process.cwd() and is shared
  // across the in-process tests in this file. The first test's fixture root wins for store.ts,
  // so any later test that depends on repoRoot resolving to ITS own fixture must run in a
  // subprocess. The happy-path coverage for previewWikiProposal lives in the isolated test
  // below.

  let server: Server | undefined;

  try {
    const moduleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'review-bridge.ts')).href}?fixture=proposal-preview-validation-${Date.now()}-${Math.random()}`;
    const { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } = await import(moduleUrl);

    server = createReviewBridgeServer({
      authToken: reviewBridgeToken,
      authTokenTtlMs: 1_000,
      now: () => reviewBridgeIssuedAt,
      sessionId: reviewBridgeSessionId,
      allowedOrigins: [allowedReviewBridgeOrigin]
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const headers = {
      'Content-Type': 'application/json',
      [REVIEW_BRIDGE_TOKEN_HEADER]: reviewBridgeToken
    };

    // Missing reviewSlug yields a clean validation error.
    const missingSlugResponse = await fetch(`${baseUrl}/preview/wiki-proposal`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    assert.equal(missingSlugResponse.status, 400);
    assert.deepEqual(await missingSlugResponse.json(), {
      error: 'Provide a reviewSlug in the request body.',
      errorCode: 'missing-review-slug'
    });

    // Token gate fires for this preview path too.
    const missingTokenResponse = await fetch(`${baseUrl}/preview/wiki-proposal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reviewSlug: 'pending-review/route-guidance-agents-md' })
    });
    assert.equal(missingTokenResponse.status, 401);
    assert.equal(((await missingTokenResponse.json()) as { errorCode: string }).errorCode, 'missing-review-bridge-token');

    // Unknown proposal flows through the upstream error from previewWikiProposal.
    const unknownProposalResponse = await fetch(`${baseUrl}/preview/wiki-proposal`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reviewSlug: 'pending-review/does-not-exist' })
    });
    assert.equal(unknownProposalResponse.status, 500);
    const unknownPayload = (await unknownProposalResponse.json()) as { errorCode: string; error: string };
    assert.equal(unknownPayload.errorCode, 'preview-proposal-failed');
    assert.match(unknownPayload.error, /Unknown active proposal/);
  } finally {
    if (server) {
      server.close();
      await once(server, 'close');
    }
  }
});

test('previewWikiProposal returns a unified diff for the route-guidance AGENTS.md fixture (isolated subprocess)', async () => {
  // Runs in a subprocess so src/wiki/store.ts is loaded with the per-test fixture as
  // process.cwd() and its captured repoRoot is correct. Same isolation pattern as the
  // maintenance-actions tests.
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-preview-proposal-isolated-'));
  const tempFixtureRoot = path.join(tempRoot, 'problem-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  try {
    const storeModuleUrl = pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'store.ts')).href;
    const { stdout } = await execFileAsync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--eval',
        [
          'process.chdir(process.argv[1]);',
          'const moduleUrl = process.argv[2];',
          'const reviewSlug = process.argv[3];',
          'const { previewWikiProposal } = await import(moduleUrl);',
          'const preview = await previewWikiProposal(reviewSlug);',
          'process.stdout.write(JSON.stringify(preview));'
        ].join(' '),
        tempFixtureRoot,
        storeModuleUrl,
        'pending-review/route-guidance-agents-md'
      ],
      { cwd: repoRoot }
    );

    const preview = JSON.parse(stdout) as {
      mode: string;
      reviewSlug: string;
      proposalKind: string;
      summary: string;
      rationale: string;
      warnings: string[];
      fileChanges: Array<{
        path: string;
        currentContent: string;
        proposedContent: string;
        unifiedDiff: string;
        skippedBecauseUnchanged: boolean;
      }>;
    };

    assert.equal(preview.mode, 'preview');
    assert.equal(preview.reviewSlug, 'pending-review/route-guidance-agents-md');
    assert.equal(preview.proposalKind, 'route-guidance');
    assert.match(preview.summary, /AGENTS\.md/);
    assert.equal(preview.fileChanges.length, 1);
    const [change] = preview.fileChanges;
    assert.equal(change.path, 'AGENTS.md');
    assert.equal(change.skippedBecauseUnchanged, false);
    assert.notEqual(change.currentContent, change.proposedContent);
    assert.match(change.unifiedDiff, /^Index: AGENTS\.md/);
    assert.ok(change.unifiedDiff.split('\n').some((line) => line.startsWith('+')));

    // The function must be read-only — AGENTS.md on disk is not modified by previewing.
    const onDiskAfter = await fs.readFile(path.join(tempFixtureRoot, 'AGENTS.md'), 'utf8');
    assert.equal(onDiskAfter, change.currentContent);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});

test('review bridge preview-skill-promotion endpoint returns the prospective skill record + effects', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-review-bridge-skill-preview-'));
  const tempFixtureRoot = path.join(tempRoot, 'problem-wiki');
  await fs.cp(fixtureRoot, tempFixtureRoot, { recursive: true });

  const originalCwd = process.cwd();
  process.chdir(tempFixtureRoot);

  let server: Server | undefined;

  try {
    const reviewBridgeModuleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'review-bridge.ts')).href}?fixture=skill-preview-${Date.now()}-${Math.random()}`;
    const memoryStoreModuleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'memory-store.ts')).href}?fixture=skill-preview-${Date.now()}-${Math.random()}`;
    const { REVIEW_BRIDGE_TOKEN_HEADER, createReviewBridgeServer } = await import(reviewBridgeModuleUrl);
    const { rememberProjectMemory } = await import(memoryStoreModuleUrl) as typeof import('../src/wiki/memory-store.js');

    // Seed a memory whose relatedFiles + sources let inferSkillScopeFromMemory infer a scope.
    const seeded = await rememberProjectMemory({
      text: 'When editing TypeScript hooks under src/wiki, also update the matching test under test/.',
      kind: 'lesson',
      tags: ['hooks', 'testing'],
      relatedFiles: ['src/wiki/skills-hook.ts', 'test/skills-hook.test.ts'],
      sources: [{ kind: 'file', slug: 'src/wiki/skills-hook.ts', label: 'src/wiki/skills-hook.ts' }]
    });

    server = createReviewBridgeServer({
      authToken: reviewBridgeToken,
      authTokenTtlMs: 1_000,
      now: () => reviewBridgeIssuedAt,
      sessionId: reviewBridgeSessionId,
      allowedOrigins: [allowedReviewBridgeOrigin]
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const address = server.address();
    assert.notEqual(address, null);
    assert.notEqual(typeof address, 'string');
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const headers = {
      'Content-Type': 'application/json',
      [REVIEW_BRIDGE_TOKEN_HEADER]: reviewBridgeToken
    };

    // Missing memoryId yields a clean validation error.
    const missingIdResponse = await fetch(`${baseUrl}/preview/memory-promote-skill`, {
      method: 'POST',
      headers,
      body: JSON.stringify({})
    });
    assert.equal(missingIdResponse.status, 400);
    assert.deepEqual(await missingIdResponse.json(), {
      error: 'Provide a memoryId in the request body.',
      errorCode: 'missing-memory-id'
    });

    // Token gate fires.
    const missingTokenResponse = await fetch(`${baseUrl}/preview/memory-promote-skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memoryId: seeded.id })
    });
    assert.equal(missingTokenResponse.status, 401);
    assert.equal(((await missingTokenResponse.json()) as { errorCode: string }).errorCode, 'missing-review-bridge-token');

    // Happy path: preview returns source + new skill + effects bullets.
    const previewResponse = await fetch(`${baseUrl}/preview/memory-promote-skill`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ memoryId: seeded.id })
    });
    assert.equal(previewResponse.status, 200);
    const preview = (await previewResponse.json()) as {
      mode: string;
      memoryId: string;
      source: { id: string; status: string; kind: string };
      newSkill: {
        summary: string;
        scope: { filePatterns: string[]; languages: string[]; matchMode: string };
        inferredScope: boolean;
      };
      effects: string[];
      warnings: string[];
    };

    assert.equal(preview.mode, 'preview');
    assert.equal(preview.memoryId, seeded.id);
    assert.equal(preview.source.id, seeded.id);
    assert.equal(preview.source.status, 'active');
    assert.equal(preview.source.kind, 'lesson');
    assert.equal(preview.newSkill.inferredScope, true);
    assert.ok(preview.newSkill.scope.filePatterns.length > 0, 'expected filePatterns to be inferred from relatedFiles');
    // languages should be derived from .ts file extensions
    assert.ok(preview.newSkill.scope.languages.includes('typescript'));
    assert.ok(preview.effects.length >= 1);

    // The endpoint must be read-only — the memory store should still hold the source as active.
    const recallModuleUrl = `${pathToFileURL(path.join(repoRoot, 'src', 'wiki', 'memory-store.ts')).href}?fixture=skill-preview-recall-${Date.now()}-${Math.random()}`;
    const { listProjectMemories } = await import(recallModuleUrl) as typeof import('../src/wiki/memory-store.js');
    const stored = await listProjectMemories();
    const original = stored.find((record) => record.id === seeded.id);
    assert.notEqual(original, undefined);
    assert.equal(original?.status, 'active');
    assert.equal(original?.kind, 'lesson');
    // No new skill record created during preview.
    assert.equal(stored.filter((record) => record.kind === 'skill').length, 0);
  } finally {
    if (server) {
      server.close();
      await once(server, 'close');
    }
    process.chdir(originalCwd);
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});