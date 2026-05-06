import { statSync } from 'node:fs';
import path from 'node:path';
import { resolvePromotionTargetSlug } from './memory-promotion.js';
import type { ProjectMemoryReviewFinding, ProjectMemoryReviewKind } from './memory-store.js';
import type { RawObservationCluster } from './raw-observations.js';
import { pagePathFromSlug, type WikiLintFinding, type WikiLintRule, type WikiProposal } from './store.js';

export interface MaintenanceInboxRenderOptions {
  reviewPageExists?: (reviewPath: string) => Promise<boolean>;
  memoryFindings?: ProjectMemoryReviewFinding[];
  observationClusters?: RawObservationCluster[];
}

export interface MaintenanceInboxActionHint {
  id: string;
  kind:
    | 'read-review-page'
    | 'refresh-review-pages'
    | 'apply-proposal'
    | 'archive-memory'
    | 'draft-memory-promotion'
    | 'apply-memory-promotion'
    | 'promote-memory-to-skill'
    | 'read-wiki-page'
    | 'check-proposals'
    | 'rerun-lint';
  label: string;
  tool:
    | 'wiki_read'
    | 'wiki_write_proposals'
    | 'wiki_apply_proposal'
    | 'wiki_proposals'
    | 'wiki_lint'
    | 'memory_forget'
    | 'memory_promote'
    | 'memory_promote_skill';
  arguments: Record<string, string | string[] | boolean>;
  available: boolean;
  reason?: string;
}

export interface MaintenanceProposalReviewMetadata {
  rationale: string;
  affectedPaths: string[];
  beforeSnippet: string;
  afterSnippet: string;
  undoPath: string;
}

export interface MaintenanceInboxSnapshot {
  status: {
    proposalCount: number;
    lintFindingCount: number;
    memoryFindingCount: number;
    observationClusterCount: number;
    proposalGroups: Array<{ kind: WikiProposal['kind']; count: number }>;
    lintRuleGroups: Array<{ bucket: LintBucket; bucketTitle: string; rule: WikiLintRule; count: number }>;
    memoryKindGroups: Array<{ kind: ProjectMemoryReviewKind; title: string; count: number }>;
  };
  nextSteps: string[];
  proposals: Array<{
    kind: WikiProposal['kind'];
    count: number;
    items: Array<{
      summary: string;
      currentStateSummary: string;
      afterApplySummary: string;
      review: MaintenanceProposalReviewMetadata;
      reviewSlug: string;
      reviewPath: string;
      reviewPageExists: boolean;
      actions: MaintenanceInboxActionHint[];
    }>;
  }>;
  lintBuckets: Array<{
    bucket: LintBucket;
    bucketTitle: string;
    count: number;
    rules: Array<{
      rule: WikiLintRule;
      count: number;
      items: Array<{
        slug: string;
        path: string;
        message: string;
        actions: MaintenanceInboxActionHint[];
      }>;
    }>;
  }>;
  memoryBuckets: Array<{
    kind: ProjectMemoryReviewKind;
    title: string;
    count: number;
    items: Array<{
      summary: string;
      reason: string;
      memoryIds: string[];
      records: Array<{
        id: string;
        kind: string;
        text: string;
        recallCount: number;
        updatedAt: string;
        sources: string[];
        relatedFiles: string[];
        relatedPages: string[];
      }>;
      actions: MaintenanceInboxActionHint[];
    }>;
  }>;
  observationClusters: Array<{
    kind: RawObservationCluster['kind'];
    target: string;
    observationCount: number;
    distinctSessionCount: number;
    firstSeen: string;
    lastSeen: string;
    outcomeCounts: RawObservationCluster['outcomeCounts'];
    suggestedSourceLink: string;
  }>;
}

export interface ResolvedMaintenanceInboxAction {
  action: MaintenanceInboxActionHint;
  source:
    | { type: 'proposal'; kind: WikiProposal['kind']; reviewSlug: string }
    | { type: 'lint'; bucket: LintBucket; rule: WikiLintRule; path: string }
    | { type: 'memory'; kind: ProjectMemoryReviewKind; memoryIds: string[] };
}

export async function buildMaintenanceInboxSnapshot(
  findings: WikiLintFinding[],
  proposals: WikiProposal[],
  options: MaintenanceInboxRenderOptions = {}
): Promise<MaintenanceInboxSnapshot> {
  const reviewPageExists = options.reviewPageExists ?? (async () => false);
  const memoryFindings = options.memoryFindings ?? [];
  const observationClusters = options.observationClusters ?? [];
  const proposalGroups = summarizeProposalKinds(proposals);
  const lintRuleGroups = summarizeLintRules(findings).map(({ rule, count }) => ({
    bucket: lintRuleBucket[rule],
    bucketTitle: lintBucketTitles[lintRuleBucket[rule]],
    rule,
    count
  }));
  const memoryKindGroups = summarizeMemoryReviewKinds(memoryFindings).map(({ kind, count }) => ({
    kind,
    title: memoryReviewKindTitles[kind],
    count
  }));
  const nextSteps = renderNextSteps(findings, proposals, memoryFindings, observationClusters).map((line) => line.replace(/^\-\s*/, ''));
  const groupedProposals = groupBy(proposals, (proposal) => proposal.kind);
  const groupedFindings = groupBy(findings, (finding) => lintRuleBucket[finding.rule]);
  const groupedMemoryFindings = groupBy(memoryFindings, (finding) => finding.kind);

  return {
    status: {
      proposalCount: proposals.length,
      lintFindingCount: findings.length,
      proposalGroups,
      lintRuleGroups,
      memoryFindingCount: memoryFindings.length,
      memoryKindGroups,
      observationClusterCount: observationClusters.length
    },
    nextSteps,
    proposals: await Promise.all(
      [...groupedProposals.keys()].sort().map(async (kind) => {
        const items = (groupedProposals.get(kind) ?? []).sort((left, right) => left.summary.localeCompare(right.summary));
        return {
          kind,
          count: items.length,
          items: await Promise.all(
            items.map(async (proposal) => {
              const hasReviewPage = await reviewPageExists(proposal.reviewPath);
              return {
                summary: proposal.summary,
                currentStateSummary: proposal.currentStateSummary,
                afterApplySummary: proposal.afterApplySummary,
                review: buildProposalReviewMetadata(proposal),
                reviewSlug: proposal.reviewSlug,
                reviewPath: proposal.reviewPath,
                reviewPageExists: hasReviewPage,
                actions: buildProposalActions(proposal.reviewSlug, hasReviewPage)
              };
            })
          )
        };
      })
    ),
    lintBuckets: lintBucketOrder
      .filter((bucket) => groupedFindings.has(bucket))
      .map((bucket) => {
        const bucketFindings = groupedFindings.get(bucket) ?? [];
        const ruleGroups = groupBy(bucketFindings, (finding) => finding.rule);
        const orderedRules = [...ruleGroups.keys()].sort((left, right) => {
          const countDelta = (ruleGroups.get(right)?.length ?? 0) - (ruleGroups.get(left)?.length ?? 0);
          return countDelta !== 0 ? countDelta : left.localeCompare(right);
        });

        return {
          bucket,
          bucketTitle: lintBucketTitles[bucket],
          count: bucketFindings.length,
          rules: orderedRules.map((rule) => ({
            rule,
            count: ruleGroups.get(rule)?.length ?? 0,
            items: (ruleGroups.get(rule) ?? [])
              .sort((left, right) => left.path.localeCompare(right.path))
              .map((finding) => ({
                slug: finding.slug,
                path: finding.path,
                message: finding.message,
                actions: buildLintActions(finding)
              }))
          }))
        };
      })
    ,
    memoryBuckets: memoryReviewKindOrder
      .filter((kind) => groupedMemoryFindings.has(kind))
      .map((kind) => {
        const bucketFindings = (groupedMemoryFindings.get(kind) ?? []).sort((left, right) => left.summary.localeCompare(right.summary));
        return {
          kind,
          title: memoryReviewKindTitles[kind],
          count: bucketFindings.length,
          items: bucketFindings.map((finding) => ({
            summary: finding.summary,
            reason: finding.reason,
            memoryIds: finding.memoryIds,
            // Only include inferredScope when actually present so existing snapshot
            // consumers that deep-compare against fixtures don't see an undefined field.
            ...(finding.inferredScope ? { inferredScope: finding.inferredScope } : {}),
            records: finding.records.map((record) => ({
              id: record.id,
              kind: record.kind,
              text: record.text,
              recallCount: record.recallCount,
              updatedAt: record.updatedAt,
              sources: record.sources.map((source) => `${source.kind}:${source.slug}`),
              relatedFiles: record.relatedFiles,
              relatedPages: record.relatedPages
            })),
            actions: buildMemoryActions(finding)
          }))
        };
      }),
    observationClusters: observationClusters.map((cluster) => ({
      kind: cluster.kind,
      target: cluster.target,
      observationCount: cluster.observationCount,
      distinctSessionCount: cluster.distinctSessionCount,
      firstSeen: cluster.firstSeen,
      lastSeen: cluster.lastSeen,
      outcomeCounts: cluster.outcomeCounts,
      suggestedSourceLink: buildClusterSourceLink(cluster)
    }))
  };
}

function buildClusterSourceLink(cluster: RawObservationCluster): string {
  if (cluster.kind === 'edit' || cluster.kind === 'read') {
    return `file:${cluster.target}`;
  }
  if (cluster.kind === 'command') {
    return `command:${cluster.target}`;
  }
  return cluster.target;
}

export async function buildMaintenanceInboxPage(
  findings: WikiLintFinding[],
  proposals: WikiProposal[],
  options: MaintenanceInboxRenderOptions = {}
): Promise<string> {
  const reviewPageExists = options.reviewPageExists ?? (async () => false);
  const memoryFindings = options.memoryFindings ?? [];
  const observationClusters = options.observationClusters ?? [];
  const proposalCounts = summarizeProposalKinds(proposals);
  const lintCounts = summarizeLintRules(findings);
  const memoryCounts = summarizeMemoryReviewKinds(memoryFindings);

  return [
    '# Maintenance Inbox',
    '',
    'This page shows the current deterministic maintenance items for the project.',
    '',
    '## Status',
    `- Active proposals: ${proposals.length}`,
    `- Active lint findings: ${findings.length}`,
    `- Active memory findings: ${memoryFindings.length}`,
    `- Active observation clusters: ${observationClusters.length}`,
    proposalCounts.length > 0
      ? `- Proposal groups: ${proposalCounts.map(({ kind, count }) => `\`${kind}\` (${count})`).join(', ')}`
      : '- Proposal groups: none.',
    lintCounts.length > 0
      ? `- Lint rule groups: ${lintCounts.map(({ rule, count }) => `\`${rule}\` (${count})`).join(', ')}`
      : '- Lint rule groups: none.',
    memoryCounts.length > 0
      ? `- Memory review groups: ${memoryCounts.map(({ kind, count }) => `\`${kind}\` (${count})`).join(', ')}`
      : '- Memory review groups: none.',
    proposals.length > 0
      ? '- Run `wiki_write_proposals` when you want to materialize review pages for the active proposals.'
      : '- There are no active proposals right now.',
    findings.length > 0
      ? '- Review the lint findings below before they turn into stale project guidance.'
      : '- There are no active lint findings right now.',
    memoryFindings.length > 0
      ? '- Review the memory findings below before stale or duplicated project lessons mislead future agents.'
      : '- There are no active memory review findings right now.',
    observationClusters.length > 0
      ? '- Review the observation clusters below; each represents repeating activity that may deserve a curated memory.'
      : '- No raw observation clusters have crossed the promotion threshold yet.',
    '',
    '## What To Do Next',
    ...renderNextSteps(findings, proposals, memoryFindings, observationClusters),
    '',
    '## Proposal Queue Summary',
    ...renderProposalSummarySection(proposalCounts),
    '',
    '## Active Proposals',
    ...(await renderProposalSection(proposals, reviewPageExists)),
    '',
    '## Lint Queue Summary',
    ...renderLintSummarySection(lintCounts),
    '',
    '## Active Lint Findings',
    ...renderLintSection(findings),
    '',
    '## Memory Review Summary',
    ...renderMemoryReviewSummarySection(memoryCounts),
    '',
    '## Active Memory Review Findings',
    ...renderMemoryReviewSection(memoryFindings),
    '',
    '## Active Observation Clusters',
    ...renderObservationClusterSection(observationClusters),
    ''
  ].join('\n');
}

function renderObservationClusterSection(clusters: RawObservationCluster[]): string[] {
  if (clusters.length === 0) {
    return [
      'No raw observation clusters have crossed the promotion threshold yet.',
      '',
      'Clusters are detected from `local-data/raw-observations.jsonl` (captured automatically by the PostToolUse hook). A cluster surfaces here when the same `(kind, target)` pair recurs at least 3 times across at least 2 distinct sessions.'
    ];
  }
  const lines: string[] = [
    'Each row is a recurring `(kind, target)` activity pattern that may deserve a curated memory. Use `memory_remember` with the `Suggested Source` link below to capture why this target keeps coming up.',
    '',
    '| Kind | Target | Observations | Sessions | Last Seen | Outcomes (ok/error/unknown) | Suggested Source |',
    '|---|---|---:|---:|---|---|---|'
  ];
  for (const cluster of clusters) {
    const outcomes = `${cluster.outcomeCounts.ok}/${cluster.outcomeCounts.error}/${cluster.outcomeCounts.unknown}`;
    lines.push(
      `| \`${cluster.kind}\` | ${escapeCell(cluster.target)} | ${cluster.observationCount} | ${cluster.distinctSessionCount} | ${cluster.lastSeen} | ${outcomes} | \`${buildClusterSourceLink(cluster)}\` |`
    );
  }
  return lines;
}

export async function findMaintenanceInboxAction(
  actionId: string,
  findings: WikiLintFinding[],
  proposals: WikiProposal[],
  options: MaintenanceInboxRenderOptions = {}
): Promise<ResolvedMaintenanceInboxAction | undefined> {
  const snapshot = await buildMaintenanceInboxSnapshot(findings, proposals, options);

  for (const proposalGroup of snapshot.proposals) {
    for (const item of proposalGroup.items) {
      const action = item.actions.find((candidate) => candidate.id === actionId);
      if (action) {
        return {
          action,
          source: {
            type: 'proposal',
            kind: proposalGroup.kind,
            reviewSlug: item.reviewSlug
          }
        };
      }
    }
  }

  for (const lintBucket of snapshot.lintBuckets) {
    for (const ruleGroup of lintBucket.rules) {
      for (const item of ruleGroup.items) {
        const action = item.actions.find((candidate) => candidate.id === actionId);
        if (action) {
          return {
            action,
            source: {
              type: 'lint',
              bucket: lintBucket.bucket,
              rule: ruleGroup.rule,
              path: item.path
            }
          };
        }
      }
    }
  }

  for (const memoryBucket of snapshot.memoryBuckets) {
    for (const item of memoryBucket.items) {
      const action = item.actions.find((candidate) => candidate.id === actionId);
      if (action) {
        return {
          action,
          source: {
            type: 'memory',
            kind: memoryBucket.kind,
            memoryIds: item.memoryIds
          }
        };
      }
    }
  }

  return undefined;
}

function renderNextSteps(
  findings: WikiLintFinding[],
  proposals: WikiProposal[],
  memoryFindings: ProjectMemoryReviewFinding[],
  observationClusters: RawObservationCluster[] = []
): string[] {
  const steps = ['- Read [Proposal Workflow](./proposal-workflow.md) for the review and apply flow.'];

  if (proposals.length > 0) {
    steps.push('- Run `wiki_write_proposals` to materialize review pages under `docs/wiki/pending-review/`.');
    steps.push('- Review the proposal group tables below and open any linked review pages before applying changes.');
  } else {
    steps.push('- No proposal pages need to be generated right now.');
  }

  if (findings.length > 0) {
    steps.push('- Resolve the lint buckets below, starting with the `review-now` rules before the cleanup-only rules.');
    steps.push('- Rerun `npm run wiki:refresh` or `npm run check` after fixes so the inbox reflects the current state.');
  } else {
    steps.push('- The lint queue is clear right now.');
  }

  if (memoryFindings.length > 0) {
    steps.push('- Review stale, unsupported, and contradictory memories first, then archive or consolidate duplicates with `memory_forget` where appropriate.');
    steps.push('- Promote repeated source-backed lessons into canonical wiki pages once the memory findings confirm they are stable enough to keep.');
  } else {
    steps.push('- The memory review queue is clear right now.');
  }

  if (observationClusters.length > 0) {
    steps.push('- Inspect the observation clusters below; for each one, decide whether the recurring activity deserves a curated `memory_remember` capture (lesson, fact, or skill).');
    steps.push('- Run `dendrite-wiki observations:list` to see the underlying raw observations behind any cluster.');
  } else {
    steps.push('- No raw observation clusters have crossed the promotion threshold yet.');
  }

  return steps;
}

function renderProposalSummarySection(
  proposalCounts: Array<{ kind: WikiProposal['kind']; count: number }>
): string[] {
  if (proposalCounts.length === 0) {
    return ['No active proposal groups.'];
  }

  return [
    '| Kind | Count |',
    '|---|---:|',
    ...proposalCounts.map(({ kind, count }) => `| \`${kind}\` | ${count} |`)
  ];
}

async function renderProposalSection(
  proposals: WikiProposal[],
  reviewPageExists: (reviewPath: string) => Promise<boolean>
): Promise<string[]> {
  if (proposals.length === 0) {
    return ['No active proposals.'];
  }

  const lines: string[] = [];
  const groupedProposals = groupBy(proposals, (proposal) => proposal.kind);

  for (const kind of [...groupedProposals.keys()].sort()) {
    const group = groupedProposals.get(kind) ?? [];
    lines.push(`### \`${kind}\` (${group.length})`, '');
    lines.push('| Summary | Rationale | Affected Paths | Current State | After Apply | Undo Path | Review Page |');
    lines.push('|---|---|---|---|---|---|---|');

    for (const proposal of group.sort((left, right) => left.summary.localeCompare(right.summary))) {
      const review = buildProposalReviewMetadata(proposal);
      lines.push(
        `| ${escapeCell(proposal.summary)} | ${escapeCell(review.rationale)} | ${escapeCell(review.affectedPaths.join(', '))} | ${escapeCell(review.beforeSnippet)} | ${escapeCell(review.afterSnippet)} | ${escapeCell(review.undoPath)} | ${await formatReviewCell(proposal.reviewSlug, proposal.reviewPath, reviewPageExists)} |`
      );
    }

    lines.push('');
  }

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

function renderLintSummarySection(lintCounts: Array<{ rule: WikiLintRule; count: number }>): string[] {
  if (lintCounts.length === 0) {
    return ['No active lint groups.'];
  }

  return [
    '| Bucket | Rule | Count |',
    '|---|---|---:|',
    ...lintCounts.map(
      ({ rule, count }) => `| ${lintBucketTitles[lintRuleBucket[rule]]} | \`${rule}\` | ${count} |`
    )
  ];
}

function renderLintSection(findings: WikiLintFinding[]): string[] {
  if (findings.length === 0) {
    return ['No active lint findings.'];
  }

  const lines: string[] = [];
  const groupedFindings = groupBy(findings, (finding) => lintRuleBucket[finding.rule]);

  for (const bucket of lintBucketOrder.filter((candidate) => groupedFindings.has(candidate))) {
    const bucketFindings = groupedFindings.get(bucket) ?? [];
    lines.push(`### ${lintBucketTitles[bucket]} (${bucketFindings.length})`, '');

    const ruleGroups = groupBy(bucketFindings, (finding) => finding.rule);
    const orderedRules = [...ruleGroups.keys()].sort((left, right) => {
      const countDelta = (ruleGroups.get(right)?.length ?? 0) - (ruleGroups.get(left)?.length ?? 0);
      return countDelta !== 0 ? countDelta : left.localeCompare(right);
    });

    for (const rule of orderedRules) {
      const ruleFindings = (ruleGroups.get(rule) ?? []).sort((left, right) => left.path.localeCompare(right.path));
      lines.push(`#### \`${rule}\` (${ruleFindings.length})`, '');
      lines.push('| Path | Message |');
      lines.push('|---|---|');
      lines.push(...ruleFindings.map((finding) => `| ${formatPathCell(finding.path)} | ${escapeCell(finding.message)} |`));
      lines.push('');
    }
  }

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

function renderMemoryReviewSummarySection(
  memoryCounts: Array<{ kind: ProjectMemoryReviewKind; count: number }>
): string[] {
  if (memoryCounts.length === 0) {
    return ['No active memory review groups.'];
  }

  return [
    '| Kind | Count |',
    '|---|---:|',
    ...memoryCounts.map(({ kind, count }) => `| ${memoryReviewKindTitles[kind]} | ${count} |`)
  ];
}

function renderMemoryReviewSection(memoryFindings: ProjectMemoryReviewFinding[]): string[] {
  if (memoryFindings.length === 0) {
    return ['No active memory review findings.'];
  }

  const lines: string[] = [];
  const groupedFindings = groupBy(memoryFindings, (finding) => finding.kind);

  for (const kind of memoryReviewKindOrder.filter((candidate) => groupedFindings.has(candidate))) {
    const group = (groupedFindings.get(kind) ?? []).sort((left, right) => left.summary.localeCompare(right.summary));
    lines.push(`### ${memoryReviewKindTitles[kind]} (${group.length})`, '');

    for (const finding of group) {
      lines.push(`#### ${escapeMarkdownForVue(finding.summary)}`, '');
      lines.push(`**Why this surfaced:** ${finding.reason}`, '');
      if (finding.memoryIds.length > 1) {
        lines.push(`**Memory IDs covered:** ${finding.memoryIds.join(', ')}`, '');
      }

      for (const record of finding.records) {
        lines.push(`- **Memory ID:** \`${record.id}\` (kind: \`${record.kind}\`, recalled ${record.recallCount}x)`);
        if (record.sources.length > 0) {
          lines.push(`- **Sources:** ${record.sources.map((source) => `\`${source.kind}:${source.slug}\``).join(', ')}`);
        } else {
          lines.push('- **Sources:** none');
        }
        if (record.relatedPages.length > 0) {
          lines.push(`- **Related pages:** ${record.relatedPages.map((page) => `\`${page}\``).join(', ')}`);
        }
        if (record.relatedFiles.length > 0) {
          lines.push(`- **Related files:** ${record.relatedFiles.map((file) => `\`${file}\``).join(', ')}`);
        }
        lines.push('', '> ' + escapeMarkdownForVue(record.text).replace(/\n/g, '\n> '), '');
      }

      const actions = buildMemoryActions(finding);
      if (actions.length > 0) {
        lines.push('**Actions:**', '');
        for (const action of actions) {
          if (action.available) {
            lines.push(`- ${action.label} — run from the repo root:`);
            lines.push('');
            lines.push('  ```bash');
            lines.push(`  npm run wiki:action -- "${action.id}"`);
            lines.push('  ```');
          } else {
            lines.push(`- ${action.label} (blocked${action.reason ? `: ${action.reason}` : ''})`);
          }
        }
        lines.push('', 'Or click **Run now** for any of these on the [Maintenance Review](./maintenance-review.md) page once `npm run review-bridge` is running. Apply actions ask for confirmation.', '');
      }
    }
  }

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

async function formatReviewCell(
  reviewSlug: string,
  reviewPath: string,
  reviewPageExists: (reviewPath: string) => Promise<boolean>
): Promise<string> {
  if (await reviewPageExists(reviewPath)) {
    return `[${escapeCell(reviewSlug)}](./${reviewSlug}.md)`;
  }

  return `\`${escapeCell(reviewSlug)}\` (run \`wiki_write_proposals\`)`;
}

function formatPathCell(targetPath: string): string {
  if (!targetPath.startsWith('docs/')) {
    return `\`${escapeCell(targetPath)}\``;
  }

  const relativePath = path.posix.relative('docs/wiki', targetPath.replace(/\\/g, '/')) || '.';
  return `[${escapeCell(targetPath)}](${relativePath})`;
}

function summarizeProposalKinds(
  activeProposals: WikiProposal[]
): Array<{ kind: WikiProposal['kind']; count: number }> {
  return [...groupBy(activeProposals, (proposal) => proposal.kind).entries()]
    .map(([kind, group]) => ({ kind, count: group.length }))
    .sort((left, right) => right.count - left.count || left.kind.localeCompare(right.kind));
}

function summarizeLintRules(activeFindings: WikiLintFinding[]): Array<{ rule: WikiLintRule; count: number }> {
  return [...groupBy(activeFindings, (finding) => finding.rule).entries()]
    .map(([rule, group]) => ({ rule, count: group.length }))
    .sort((left, right) => {
      const bucketDelta = lintBucketOrder.indexOf(lintRuleBucket[left.rule]) - lintBucketOrder.indexOf(lintRuleBucket[right.rule]);
      return bucketDelta !== 0 ? bucketDelta : right.count - left.count || left.rule.localeCompare(right.rule);
    });
}

function summarizeMemoryReviewKinds(
  activeFindings: ProjectMemoryReviewFinding[]
): Array<{ kind: ProjectMemoryReviewKind; count: number }> {
  return [...groupBy(activeFindings, (finding) => finding.kind).entries()]
    .map(([kind, group]) => ({ kind, count: group.length }))
    .sort((left, right) => memoryReviewKindOrder.indexOf(left.kind) - memoryReviewKindOrder.indexOf(right.kind));
}

function buildProposalActions(reviewSlug: string, reviewPageExists: boolean): MaintenanceInboxActionHint[] {
  return [
    {
      id: buildProposalActionId(reviewSlug, 'refresh-review-pages'),
      kind: 'refresh-review-pages',
      label: 'Refresh review pages',
      tool: 'wiki_write_proposals',
      arguments: {},
      available: true
    },
    {
      id: buildProposalActionId(reviewSlug, 'read-review-page'),
      kind: 'read-review-page',
      label: 'Read review page',
      tool: 'wiki_read',
      arguments: { slug: reviewSlug },
      available: reviewPageExists,
      reason: reviewPageExists ? undefined : 'Run wiki_write_proposals first to materialize the pending-review page.'
    },
    {
      id: buildProposalActionId(reviewSlug, 'apply-proposal'),
      kind: 'apply-proposal',
      label: 'Apply proposal',
      tool: 'wiki_apply_proposal',
      arguments: { reviewSlug },
      available: true
    }
  ];
}

function buildProposalReviewMetadata(proposal: WikiProposal): MaintenanceProposalReviewMetadata {
  if (proposal.kind === 'merge-guidance') {
    return {
      rationale: proposal.rationale,
      affectedPaths: proposal.duplicatePaths,
      beforeSnippet: proposal.currentStateSummary,
      afterSnippet: proposal.afterApplySummary,
      undoPath: `Before committing, inspect the changed duplicate files with git diff and restore ${proposal.duplicatePaths.join(', ')} from version control if the merge is not wanted.`
    };
  }

  return {
    rationale: proposal.rationale,
    affectedPaths: [proposal.guidancePath],
    beforeSnippet: proposal.currentStateSummary,
    afterSnippet: proposal.afterApplySummary,
    undoPath: `Before committing, inspect the changed guidance file with git diff and restore ${proposal.guidancePath} from version control if the route is not wanted.`
  };
}

function buildLintActions(finding: WikiLintFinding): MaintenanceInboxActionHint[] {
  const actions: MaintenanceInboxActionHint[] = [
    {
      id: buildLintActionId(finding, 'rerun-lint'),
      kind: 'rerun-lint',
      label: 'Re-run lint',
      tool: 'wiki_lint',
      arguments: {},
      available: true
    }
  ];
  const wikiSlug = pathToWikiSlug(finding.path);

  if (wikiSlug) {
    actions.unshift({
      id: buildLintActionId(finding, 'read-wiki-page'),
      kind: 'read-wiki-page',
      label: 'Read wiki page',
      tool: 'wiki_read',
      arguments: { slug: wikiSlug },
      available: true
    });
  }

  if (proposalRelatedLintRules.has(finding.rule)) {
    actions.push({
      id: buildLintActionId(finding, 'check-proposals'),
      kind: 'check-proposals',
      label: 'Check related proposals',
      tool: 'wiki_proposals',
      arguments: {},
      available: true
    });
  }

  return actions;
}

function buildMemoryActions(finding: ProjectMemoryReviewFinding): MaintenanceInboxActionHint[] {
  if (finding.kind === 'stale' || finding.kind === 'unsupported') {
    return finding.memoryIds.slice(0, 1).map((memoryId) => ({
      id: buildMemoryActionId(finding, 'archive-memory', memoryId),
      kind: 'archive-memory',
      label: 'Archive memory',
      tool: 'memory_forget',
      arguments: {
        id: memoryId,
        mode: 'archive'
      },
      available: true
    }));
  }

  if (finding.kind === 'duplicate') {
    const duplicateIds = finding.records.slice(1).map((record) => record.id);
    const archiveIds = duplicateIds.length > 0 ? duplicateIds : finding.memoryIds.slice(1);

    return archiveIds.map((memoryId) => ({
      id: buildMemoryActionId(finding, 'archive-memory', memoryId),
      kind: 'archive-memory',
      label: 'Archive older duplicate',
      tool: 'memory_forget',
      arguments: {
        id: memoryId,
        mode: 'archive'
      },
      available: true
    }));
  }

  if (finding.kind === 'skill-promotion-ready') {
    // Each skill-promotion-ready finding wraps a single memory; use the first id and let
    // the executor read the rest of the scope from the memory record itself. Passing no
    // explicit scope here means promoteMemoryToSkill re-runs inferSkillScopeFromMemory at
    // apply time — which is the same scope the inbox surfaced at finding time, and stays
    // current if the memory was edited between review and apply.
    const targetMemoryId = finding.memoryIds[0];
    if (!targetMemoryId) {
      return [];
    }
    return [
      {
        id: buildMemoryActionId(finding, 'promote-memory-to-skill', targetMemoryId),
        kind: 'promote-memory-to-skill',
        label: 'Promote to skill (inferred scope)',
        tool: 'memory_promote_skill',
        arguments: {
          memoryId: targetMemoryId
        },
        available: true
      },
      {
        id: buildMemoryActionId(finding, 'archive-memory', targetMemoryId),
        kind: 'archive-memory',
        label: 'Archive memory (decline promotion)',
        tool: 'memory_forget',
        arguments: {
          id: targetMemoryId,
          mode: 'archive'
        },
        available: true
      }
    ];
  }

  if (finding.kind !== 'promotion-ready') {
    return [];
  }

  const applyAvailability = resolveMemoryPromotionAvailability(finding);

  return [
    {
      id: buildMemoryActionId(finding, 'draft-memory-promotion'),
      kind: 'draft-memory-promotion',
      label: 'Draft promotion',
      tool: 'memory_promote',
      arguments: {
        memoryIds: finding.memoryIds,
        mode: 'draft'
      },
      available: true
    },
    {
      id: buildMemoryActionId(finding, 'apply-memory-promotion'),
      kind: 'apply-memory-promotion',
      label: 'Apply promotion',
      tool: 'memory_promote',
      arguments: {
        memoryIds: finding.memoryIds,
        mode: 'apply'
      },
      available: applyAvailability.available,
      reason: applyAvailability.reason
    }
  ];
}

function resolveMemoryPromotionAvailability(
  finding: ProjectMemoryReviewFinding
): Pick<MaintenanceInboxActionHint, 'available' | 'reason'> {
  // Use the same target-resolution logic the draft and apply paths use, so the inbox gate
  // matches the actual behavior. If the target page exists on disk, apply is safe.
  const targetSlug = resolvePromotionTargetSlug(finding.records);

  try {
    statSync(pagePathFromSlug(targetSlug));
    return { available: true };
  } catch {
    return {
      available: false,
      reason: `The target wiki page ${targetSlug} does not exist yet. Draft the promotion first and create or choose a canonical target before applying it.`
    };
  }
}

function pathToWikiSlug(targetPath: string): string | undefined {
  const normalizedPath = targetPath.replace(/\\/g, '/');
  const match = normalizedPath.match(/^docs\/wiki\/(.+)\.md$/);
  return match?.[1];
}

function buildProposalActionId(
  reviewSlug: string,
  actionKind: 'refresh-review-pages' | 'read-review-page' | 'apply-proposal'
): string {
  return `proposal:${reviewSlug}:${actionKind}`;
}

function buildLintActionId(
  finding: WikiLintFinding,
  actionKind: 'read-wiki-page' | 'check-proposals' | 'rerun-lint'
): string {
  return `lint:${finding.rule}:${finding.path}:${actionKind}`;
}

function buildMemoryActionId(
  finding: ProjectMemoryReviewFinding,
  actionKind: 'archive-memory' | 'draft-memory-promotion' | 'apply-memory-promotion' | 'promote-memory-to-skill',
  memoryId = finding.memoryIds.join('+')
): string {
  return `memory:${finding.kind}:${memoryId}:${actionKind}`;
}

function groupBy<T, K>(items: T[], keySelector: (item: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();

  for (const item of items) {
    const key = keySelector(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }

  return groups;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

function escapeMarkdownForVue(value: string): string {
  return value.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const lintBucketOrder = ['review-now', 'cleanup'] as const;
export type LintBucket = (typeof lintBucketOrder)[number];

const lintBucketTitles: Record<LintBucket, string> = {
  'review-now': 'Review Now',
  cleanup: 'Cleanup Queue'
};

const lintRuleBucket: Record<WikiLintRule, LintBucket> = {
  'missing-h1': 'cleanup',
  'missing-summary': 'cleanup',
  'orphan-page': 'cleanup',
  'stale-claim': 'review-now',
  'unsupported-claim': 'review-now',
  'dormant-skill': 'cleanup',
  'oversized-guidance': 'cleanup',
  'duplicate-guidance': 'cleanup',
  'stale-guidance-reference': 'review-now',
  'conflicting-guidance': 'review-now',
  'unrouted-guidance': 'cleanup',
  'page-drift': 'review-now'
};

const proposalRelatedLintRules = new Set<WikiLintRule>(['duplicate-guidance', 'oversized-guidance']);

const memoryReviewKindOrder = ['stale', 'unsupported', 'duplicate', 'contradiction', 'promotion-ready', 'skill-promotion-ready'] as const;

const memoryReviewKindTitles: Record<ProjectMemoryReviewKind, string> = {
  stale: 'Stale',
  unsupported: 'Unsupported',
  duplicate: 'Duplicate',
  contradiction: 'Contradiction',
  'promotion-ready': 'Promotion Ready',
  'skill-promotion-ready': 'Skill Promotion Ready'
};