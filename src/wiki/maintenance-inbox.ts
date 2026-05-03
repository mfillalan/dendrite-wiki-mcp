import path from 'node:path';
import type { WikiLintFinding, WikiLintRule, WikiProposal } from './store.js';

export interface MaintenanceInboxRenderOptions {
  reviewPageExists?: (reviewPath: string) => Promise<boolean>;
}

export interface MaintenanceInboxActionHint {
  kind:
    | 'read-review-page'
    | 'refresh-review-pages'
    | 'apply-proposal'
    | 'read-wiki-page'
    | 'check-proposals'
    | 'rerun-lint';
  label: string;
  tool: 'wiki_read' | 'wiki_write_proposals' | 'wiki_apply_proposal' | 'wiki_proposals' | 'wiki_lint';
  arguments: Record<string, string>;
  available: boolean;
  reason?: string;
}

export interface MaintenanceInboxSnapshot {
  status: {
    proposalCount: number;
    lintFindingCount: number;
    proposalGroups: Array<{ kind: WikiProposal['kind']; count: number }>;
    lintRuleGroups: Array<{ bucket: LintBucket; bucketTitle: string; rule: WikiLintRule; count: number }>;
  };
  nextSteps: string[];
  proposals: Array<{
    kind: WikiProposal['kind'];
    count: number;
    items: Array<{
      summary: string;
      currentStateSummary: string;
      afterApplySummary: string;
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
}

export async function buildMaintenanceInboxSnapshot(
  findings: WikiLintFinding[],
  proposals: WikiProposal[],
  options: MaintenanceInboxRenderOptions = {}
): Promise<MaintenanceInboxSnapshot> {
  const reviewPageExists = options.reviewPageExists ?? (async () => false);
  const proposalGroups = summarizeProposalKinds(proposals);
  const lintRuleGroups = summarizeLintRules(findings).map(({ rule, count }) => ({
    bucket: lintRuleBucket[rule],
    bucketTitle: lintBucketTitles[lintRuleBucket[rule]],
    rule,
    count
  }));
  const nextSteps = renderNextSteps(findings, proposals).map((line) => line.replace(/^-\s*/, ''));
  const groupedProposals = groupBy(proposals, (proposal) => proposal.kind);
  const groupedFindings = groupBy(findings, (finding) => lintRuleBucket[finding.rule]);

  return {
    status: {
      proposalCount: proposals.length,
      lintFindingCount: findings.length,
      proposalGroups,
      lintRuleGroups
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
  };
}

export async function buildMaintenanceInboxPage(
  findings: WikiLintFinding[],
  proposals: WikiProposal[],
  options: MaintenanceInboxRenderOptions = {}
): Promise<string> {
  const reviewPageExists = options.reviewPageExists ?? (async () => false);
  const proposalCounts = summarizeProposalKinds(proposals);
  const lintCounts = summarizeLintRules(findings);

  return [
    '# Maintenance Inbox',
    '',
    'This page shows the current deterministic maintenance items for the project.',
    '',
    '## Status',
    `- Active proposals: ${proposals.length}`,
    `- Active lint findings: ${findings.length}`,
    proposalCounts.length > 0
      ? `- Proposal groups: ${proposalCounts.map(({ kind, count }) => `\`${kind}\` (${count})`).join(', ')}`
      : '- Proposal groups: none.',
    lintCounts.length > 0
      ? `- Lint rule groups: ${lintCounts.map(({ rule, count }) => `\`${rule}\` (${count})`).join(', ')}`
      : '- Lint rule groups: none.',
    proposals.length > 0
      ? '- Run `wiki_write_proposals` when you want to materialize review pages for the active proposals.'
      : '- There are no active proposals right now.',
    findings.length > 0
      ? '- Review the lint findings below before they turn into stale project guidance.'
      : '- There are no active lint findings right now.',
    '',
    '## What To Do Next',
    ...renderNextSteps(findings, proposals),
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
    ''
  ].join('\n');
}

function renderNextSteps(findings: WikiLintFinding[], proposals: WikiProposal[]): string[] {
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
    lines.push('| Summary | Current State | After Apply | Review Page |');
    lines.push('|---|---|---|---|');

    for (const proposal of group.sort((left, right) => left.summary.localeCompare(right.summary))) {
      lines.push(
        `| ${escapeCell(proposal.summary)} | ${escapeCell(proposal.currentStateSummary)} | ${escapeCell(proposal.afterApplySummary)} | ${await formatReviewCell(proposal.reviewSlug, proposal.reviewPath, reviewPageExists)} |`
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

function buildProposalActions(reviewSlug: string, reviewPageExists: boolean): MaintenanceInboxActionHint[] {
  return [
    {
      kind: 'refresh-review-pages',
      label: 'Refresh review pages',
      tool: 'wiki_write_proposals',
      arguments: {},
      available: true
    },
    {
      kind: 'read-review-page',
      label: 'Read review page',
      tool: 'wiki_read',
      arguments: { slug: reviewSlug },
      available: reviewPageExists,
      reason: reviewPageExists ? undefined : 'Run wiki_write_proposals first to materialize the pending-review page.'
    },
    {
      kind: 'apply-proposal',
      label: 'Apply proposal',
      tool: 'wiki_apply_proposal',
      arguments: { reviewSlug },
      available: true
    }
  ];
}

function buildLintActions(finding: WikiLintFinding): MaintenanceInboxActionHint[] {
  const actions: MaintenanceInboxActionHint[] = [
    {
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
      kind: 'read-wiki-page',
      label: 'Read wiki page',
      tool: 'wiki_read',
      arguments: { slug: wikiSlug },
      available: true
    });
  }

  if (proposalRelatedLintRules.has(finding.rule)) {
    actions.push({
      kind: 'check-proposals',
      label: 'Check related proposals',
      tool: 'wiki_proposals',
      arguments: {},
      available: true
    });
  }

  return actions;
}

function pathToWikiSlug(targetPath: string): string | undefined {
  const normalizedPath = targetPath.replace(/\\/g, '/');
  const match = normalizedPath.match(/^docs\/wiki\/(.+)\.md$/);
  return match?.[1];
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
  'unrouted-guidance': 'cleanup'
};

const proposalRelatedLintRules = new Set<WikiLintRule>(['duplicate-guidance', 'oversized-guidance']);