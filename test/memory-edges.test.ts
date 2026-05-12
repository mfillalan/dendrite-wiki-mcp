import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  buildMemoryTrailReason,
  computeEffectiveWeight,
  computeQueryFingerprint,
  loadBipartiteProjectionShadowLookup,
  loadMemoryTrailBonusLookup,
  reinforceQueryEdges,
  reinforceSkillLoadEdge,
  resolveProjectMemoryEdgesPath,
  type ProjectMemoryEdge
} from '@dendrite/memory';

async function makeTempRoot(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), 'dendrite-edges-'));
}

async function readEdges(root: string): Promise<ProjectMemoryEdge[]> {
  const content = await fs.readFile(resolveProjectMemoryEdgesPath(root), 'utf8').catch(() => '');
  if (!content.trim()) return [];
  return JSON.parse(content).edges as ProjectMemoryEdge[];
}

test('computeQueryFingerprint produces order-insensitive normalized token string', () => {
  const a = computeQueryFingerprint('Fix the auth bug in login flow');
  const b = computeQueryFingerprint('login auth bug fix flow the in');
  assert.equal(a, b, 'token order should not affect fingerprint');
  assert.match(a, /auth/);
  assert.match(a, /login/);
});

test('reinforceQueryEdges creates a new edge with weight = amount', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);
  const edges = await readEdges(root);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].fromKind, 'memory');
  assert.equal(edges[0].fromId, 'mem_a');
  assert.equal(edges[0].weight, 0.05);
  assert.equal(edges[0].reinforcementCount, 1);
});

test('reinforceQueryEdges accumulates weight on repeated calls but caps at 5', async () => {
  const root = await makeTempRoot();
  for (let i = 0; i < 200; i += 1) {
    await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);
  }
  const edges = await readEdges(root);
  assert.equal(edges.length, 1);
  assert.ok(edges[0].weight <= 5, `weight must be clamped to 5, got ${edges[0].weight}`);
  assert.equal(edges[0].reinforcementCount, 200);
});

test('reinforceSkillLoadEdge uses the heavier skill-load amount (0.10)', async () => {
  const root = await makeTempRoot();
  await reinforceSkillLoadEdge('skill_a', 'fix the auth bug', root);
  const edges = await readEdges(root);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].fromKind, 'skill');
  assert.equal(edges[0].weight, 0.10);
});

test('reinforceQueryEdges with same fromIds + similar query reuses edge (single key)', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug today', {}, root);
  await reinforceQueryEdges('memory', ['mem_a'], 'auth bug fix the today', {}, root);
  const edges = await readEdges(root);
  assert.equal(edges.length, 1, 'token-set-equal queries should map to same edge');
  assert.equal(edges[0].reinforcementCount, 2);
});

test('lookupMemoryTrailBonus returns bonus for matching query (Jaccard >= 0.3)', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug in login', {}, root);

  const lookup = await loadMemoryTrailBonusLookup('memory', 'auth bug in the login flow', root);
  const bonus = lookup('mem_a');
  assert.ok(bonus, 'similar query should produce a trail bonus');
  assert.ok(bonus.totalBonus > 0, 'bonus weight should be positive');
  assert.equal(bonus.reinforcementCount, 1);
  assert.equal(bonus.similarEdgeCount, 1);
  assert.ok(bonus.bestSimilarity >= 0.3);
});

test('lookupMemoryTrailBonus returns undefined for unrelated query', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);

  const lookup = await loadMemoryTrailBonusLookup('memory', 'render dashboard chart in vue', root);
  assert.equal(lookup('mem_a'), undefined, 'no overlapping tokens should yield no bonus');
});

test('lookupMemoryTrailBonus returns undefined when fromKind does not match', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);

  const lookup = await loadMemoryTrailBonusLookup('skill', 'fix the auth bug', root);
  assert.equal(lookup('mem_a'), undefined);
});

test('computeEffectiveWeight decays weight by elapsed hours via lazy formula', () => {
  const edge: ProjectMemoryEdge = {
    id: 'x',
    fromKind: 'memory',
    fromId: 'mem_a',
    queryFingerprint: 'fix bug',
    queryText: 'fix the bug',
    weight: 1.0,
    reinforcementCount: 1,
    lastReinforcedAt: new Date(Date.now() - 100 * 3_600_000).toISOString(),
    createdAt: new Date().toISOString()
  };
  // 100 hours at 0.005/hr → weight × 0.995^100 ≈ 0.606
  const decayed = computeEffectiveWeight(edge, new Date());
  assert.ok(decayed > 0.5 && decayed < 0.7, `expected ~0.606, got ${decayed}`);
});

test('computeEffectiveWeight returns full weight when reinforced now', () => {
  const edge: ProjectMemoryEdge = {
    id: 'x',
    fromKind: 'memory',
    fromId: 'mem_a',
    queryFingerprint: 'fix bug',
    queryText: 'fix the bug',
    weight: 2.5,
    reinforcementCount: 5,
    lastReinforcedAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };
  const fresh = computeEffectiveWeight(edge, new Date());
  assert.ok(Math.abs(fresh - 2.5) < 0.01, `expected ~2.5, got ${fresh}`);
});

test('lazy evaporation applies during reinforcement so frequency matters more than burst', async () => {
  const root = await makeTempRoot();
  // First reinforce many times to build up weight, then backdate the file via fs to
  // simulate 100 hours of elapsed time. The second reinforcement will compute decay
  // against the backdated timestamp, then add the new amount.
  for (let i = 0; i < 40; i += 1) {
    await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);
  }
  let edges = await readEdges(root);
  assert.equal(edges.length, 1);
  const accumulatedWeight = edges[0].weight;
  assert.ok(accumulatedWeight > 1.5, `40 reinforcements should accumulate substantially, got ${accumulatedWeight}`);

  // Backdate lastReinforcedAt by 100 hours so the next reinforcement sees decay.
  const filePath = resolveProjectMemoryEdgesPath(root);
  edges[0].lastReinforcedAt = new Date(Date.now() - 100 * 3_600_000).toISOString();
  await fs.writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, edges }, null, 2)}\n`, 'utf8');

  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);
  edges = await readEdges(root);
  // After 100h decay at 0.005/hr: weight × 0.995^100 ≈ 0.606. Then +0.05 reinforcement.
  // Should be lower than the pre-decay weight but higher than the reinforcement alone.
  assert.ok(
    edges[0].weight < accumulatedWeight,
    `decayed weight should be lower than pre-decay (${accumulatedWeight}), got ${edges[0].weight}`
  );
  assert.ok(edges[0].weight > 0.05, `weight should retain decayed value plus reinforcement, got ${edges[0].weight}`);
  assert.equal(edges[0].reinforcementCount, 41);
});

test('buildMemoryTrailReason produces a human-readable explanation', () => {
  const reason = buildMemoryTrailReason({
    totalBonus: 1.5,
    reinforcementCount: 7,
    similarEdgeCount: 3,
    newestReinforcedAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    bestSimilarity: 0.6
  });
  assert.match(reason, /memory trail/i);
  assert.match(reason, /reinforced 7/);
  assert.match(reason, /3 matching queries/);
  assert.match(reason, /2 days ago/);
});

test('reinforceQueryEdges silently ignores empty query (no fingerprint)', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], '', {}, root);
  const edges = await readEdges(root);
  assert.equal(edges.length, 0, 'empty query should not create an edge');
});

test('reinforceQueryEdges silently ignores empty fromIds', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', [], 'fix the auth bug', {}, root);
  const edges = await readEdges(root);
  assert.equal(edges.length, 0);
});

test('bipartite projection shadow surfaces peer-anchored bonuses', async () => {
  const root = await makeTempRoot();
  // Two memories that BOTH anchor to the same query fingerprint via separate calls.
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth login bug', {}, root);
  await reinforceQueryEdges('memory', ['mem_b'], 'fix the auth login bug', {}, root);
  // A third memory that anchors to an unrelated fingerprint.
  await reinforceQueryEdges('memory', ['mem_c'], 'render dashboard chart', {}, root);

  // Now ask: "auth login session bug" — similar to the first fingerprint.
  const lookup = await loadBipartiteProjectionShadowLookup('memory', 'auth login session bug', root);

  const shadowA = lookup('mem_a');
  assert.ok(shadowA, 'mem_a should see a projection bonus from mem_b co-anchoring on auth/login');
  assert.equal(shadowA.peerCount, 1);
  assert.equal(shadowA.topContributions[0].peerId, 'mem_b');
  assert.ok(shadowA.totalShadowBonus > 0);

  const shadowC = lookup('mem_c');
  assert.equal(shadowC, undefined, 'mem_c has no peer anchored on the matching fingerprint');
});

test('bipartite projection shadow caps total bonus at MAX_PROJECTION_BONUS', async () => {
  const root = await makeTempRoot();
  // Many peers all anchoring to the same fingerprint as mem_a, all reinforced heavily.
  for (let i = 0; i < 10; i += 1) {
    for (let j = 0; j < 50; j += 1) {
      await reinforceQueryEdges('memory', [`peer_${i}`], 'fix the auth login bug', {}, root);
    }
  }
  for (let j = 0; j < 50; j += 1) {
    await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth login bug', {}, root);
  }

  const lookup = await loadBipartiteProjectionShadowLookup('memory', 'auth login bug', root);
  const shadow = lookup('mem_a');
  assert.ok(shadow);
  assert.ok(shadow.totalShadowBonus <= 3, `totalShadowBonus should be capped at 3, got ${shadow.totalShadowBonus}`);
  assert.equal(shadow.peerCount, 10);
});

test('bipartite projection shadow ignores peers when query fingerprints fall below similarity threshold', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);
  await reinforceQueryEdges('memory', ['mem_b'], 'fix the auth bug', {}, root);

  const lookup = await loadBipartiteProjectionShadowLookup('memory', 'render dashboard chart with vue', root);
  assert.equal(lookup('mem_a'), undefined, 'no fingerprint similarity → no projection bonus');
});

test('bipartite projection shadow does not project a memory onto itself', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);
  // mem_a is the only memory anchored to this fingerprint.

  const lookup = await loadBipartiteProjectionShadowLookup('memory', 'auth bug fix today', root);
  assert.equal(lookup('mem_a'), undefined, 'a memory cannot be its own peer');
});

test('bipartite projection shadow respects fromKind (memory edges do not project to skills)', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('memory', ['mem_a'], 'fix the auth bug', {}, root);
  await reinforceQueryEdges('skill', ['skill_a'], 'fix the auth bug', {}, root);

  const memoryLookup = await loadBipartiteProjectionShadowLookup('memory', 'auth bug fix', root);
  assert.equal(memoryLookup('mem_a'), undefined, 'memory side should not see skill peers');

  const skillLookup = await loadBipartiteProjectionShadowLookup('skill', 'auth bug fix', root);
  assert.equal(skillLookup('skill_a'), undefined, 'skill side should not see memory peers');
});

test('page-kind edges round-trip: reinforcement creates a page edge and lookup returns its bonus', async () => {
  const root = await makeTempRoot();
  await reinforceQueryEdges('page', ['architecture'], 'how does the search index rank pages', {}, root);
  const edges = await readEdges(root);
  assert.equal(edges.length, 1);
  assert.equal(edges[0].fromKind, 'page');
  assert.equal(edges[0].fromId, 'architecture');

  const lookup = await loadMemoryTrailBonusLookup('page', 'how the search index ranks pages today', root);
  const bonus = lookup('architecture');
  assert.ok(bonus, 'similar query on a page edge should produce a trail bonus');
  assert.equal(bonus.similarEdgeCount, 1);

  // page edges must not bleed into memory or skill recall paths
  const memoryLookup = await loadMemoryTrailBonusLookup('memory', 'how does the search index rank pages', root);
  assert.equal(memoryLookup('architecture'), undefined, 'page edges should not surface as memory bonuses');
  const skillLookup = await loadMemoryTrailBonusLookup('skill', 'how does the search index rank pages', root);
  assert.equal(skillLookup('architecture'), undefined, 'page edges should not surface as skill bonuses');
});
