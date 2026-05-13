/**
 * `dendrite-wiki doctor` — project-health audit.
 *
 * Aggregates findings from every health-relevant subsystem into one ranked list with
 * severities (`critical`, `warning`, `info`): missing required files, stale benchmark
 * snapshots, accumulated wiki lint findings, contested or unsupported memories, missing
 * telemetry config when sharing is opt-in, etc. The CLI prints a human report by default
 * and a structured `--json` output for scripted health checks.
 *
 * The doctor exits 1 on any `critical` finding so it integrates cleanly with CI gates and
 * pre-commit hooks. Most findings are advisory and live as `warning` so the doctor stays
 * useful without becoming a nag.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { readBenchmarkHistory } from './benchmark.js';
import { reviewProjectMemories, type ProjectMemoryReviewFinding } from '@rarusoft/dendrite-memory';
import { lintWikiPages, listWikiPages, listWikiProposals } from './store.js';
import { writeTelemetryStatusArtifact } from './telemetry.js';

export type DoctorSeverity = 'critical' | 'warning' | 'info';

export interface DoctorFinding {
  severity: DoctorSeverity;
  rule: string;
  title: string;
  detail: string;
  fix?: string;
}

export interface DoctorReport {
  generatedAt: string;
  root: string;
  findings: DoctorFinding[];
  counts: {
    critical: number;
    warning: number;
    info: number;
  };
  status: 'healthy' | 'warnings' | 'critical';
}

export async function runDoctor(options: { root?: string } = {}): Promise<DoctorReport> {
  const root = path.resolve(options.root ?? process.cwd());
  const findings: DoctorFinding[] = [];

  // Critical filesystem checks first — if these fail, deeper checks may throw.
  const wikiDirExists = await pathExists(path.join(root, 'docs', 'wiki'));
  if (!wikiDirExists) {
    findings.push({
      severity: 'critical',
      rule: 'no-wiki-directory',
      title: 'Wiki directory is missing.',
      detail: 'Dendrite expects markdown pages under docs/wiki/. The agent has nothing to read or update.',
      fix: 'npx dendrite-wiki init'
    });
  }

  const indexExists = await pathExists(path.join(root, 'docs', 'index.md'));
  if (!indexExists) {
    findings.push({
      severity: 'critical',
      rule: 'no-index-page',
      title: 'docs/index.md is missing.',
      detail: 'Agents are instructed to read docs/index.md first. Without it, orientation breaks.',
      fix: 'npx dendrite-wiki init'
    });
  }

  const mcpClientPaths = [
    { client: 'Claude Code', file: '.mcp.json' },
    { client: 'VS Code / Copilot', file: '.vscode/mcp.json' },
    { client: 'Cursor', file: '.cursor/mcp.json' },
    { client: 'Codex', file: '.codex/config.toml' },
    { client: 'Continue', file: '.continue/mcpServers/dendrite-wiki-mcp.json' }
  ];
  const presentClients: string[] = [];
  for (const entry of mcpClientPaths) {
    if (await pathExists(path.join(root, entry.file))) {
      presentClients.push(entry.client);
    }
  }
  if (presentClients.length === 0) {
    findings.push({
      severity: 'critical',
      rule: 'no-mcp-client-config',
      title: 'No MCP client config files found.',
      detail: 'No editor or agent client knows how to launch the MCP server. The agent cannot reach Dendrite.',
      fix: 'npx dendrite-wiki init --profile claude  (or --profile cursor / copilot-vscode / codex / continue)'
    });
  } else {
    findings.push({
      severity: 'info',
      rule: 'mcp-clients-configured',
      title: `${presentClients.length} MCP client config${presentClients.length === 1 ? '' : 's'} present.`,
      detail: `Configured: ${presentClients.join(', ')}.`
    });
  }

  // If the basic skeleton is broken, skip deeper checks to avoid noisy errors.
  const skeletonOk = wikiDirExists && indexExists;

  if (skeletonOk) {
    const [pages, lintFindings, proposals, memoryReview, history, telemetryStatus] = await Promise.all([
      listWikiPages().catch(() => []),
      lintWikiPages().catch(() => []),
      listWikiProposals().catch(() => []),
      reviewProjectMemories().catch(() => ({ findings: [] as ProjectMemoryReviewFinding[] })),
      readBenchmarkHistory(root).catch(() => null),
      writeTelemetryStatusArtifact(root).catch(() => null)
    ]);

    if (lintFindings.length > 0) {
      findings.push({
        severity: 'warning',
        rule: 'lint-findings-present',
        title: `${lintFindings.length} wiki lint finding${lintFindings.length === 1 ? '' : 's'}.`,
        detail: 'The wiki has open hygiene issues (oversized guidance, stale claims, orphan pages, etc.). Review the maintenance inbox to triage.',
        fix: 'Open docs/wiki/maintenance-inbox.md or run `npx dendrite-wiki benchmark:snapshot` to refresh state.'
      });
    }

    if (proposals.length > 0) {
      findings.push({
        severity: 'warning',
        rule: 'pending-proposals',
        title: `${proposals.length} pending maintenance proposal${proposals.length === 1 ? '' : 's'}.`,
        detail: 'Generated guidance cleanup proposals are waiting for review.',
        fix: 'Open docs/wiki/maintenance-review.md in the browser, or call wiki_apply_proposal for low-risk items.'
      });
    }

    const contradictionFindings = memoryReview.findings.filter((f) => f.kind === 'contradiction');
    if (contradictionFindings.length > 0) {
      findings.push({
        severity: 'warning',
        rule: 'memory-contradictions',
        title: `${contradictionFindings.length} memory contradiction group${contradictionFindings.length === 1 ? '' : 's'} detected.`,
        detail: 'Two or more memories disagree. The agent may be acting on inconsistent project truth.',
        fix: 'Open the Maintenance Review board in the browser to inspect and resolve.'
      });
    }

    if (history && history.snapshots.length > 0) {
      const latest = history.latest && history.latest.timestamp ? history.latest : history.snapshots.at(-1);
      if (latest && latest.timestamp) {
        const ageDays = Math.floor((Date.now() - new Date(latest.timestamp).getTime()) / (1000 * 60 * 60 * 24));
        if (ageDays > 14) {
          findings.push({
            severity: 'warning',
            rule: 'stale-benchmark',
            title: `Last benchmark snapshot is ${ageDays} days old.`,
            detail: 'Benchmarks should be captured at session boundaries to detect drift. Stale snapshots make trend lines meaningless.',
            fix: 'npx dendrite-wiki benchmark:snapshot --label session-end'
          });
        }
      }
    } else {
      findings.push({
        severity: 'warning',
        rule: 'no-benchmark-history',
        title: 'No benchmark snapshots have been captured.',
        detail: 'Without baseline snapshots there is no way to measure whether Dendrite is helping the project over time.',
        fix: 'npx dendrite-wiki benchmark:snapshot --label baseline'
      });
    }

    const projectLogPath = path.join(root, 'docs', 'wiki', 'project-log.md');
    if (await pathExists(projectLogPath)) {
      const projectLogStat = await fs.stat(projectLogPath);
      const logAgeDays = Math.floor((Date.now() - projectLogStat.mtime.getTime()) / (1000 * 60 * 60 * 24));
      if (logAgeDays > 7) {
        findings.push({
          severity: 'warning',
          rule: 'stale-project-log',
          title: `project-log.md was last touched ${logAgeDays} days ago.`,
          detail: 'No meaningful work has been logged in the past week. The project log is the chronological record agents read for context.',
          fix: 'Append an entry via wiki_log when meaningful work happens.'
        });
      }
    }

    if (!(await pathExists(path.join(root, '.git')))) {
      findings.push({
        severity: 'warning',
        rule: 'no-git-repository',
        title: 'No .git/ directory found.',
        detail: 'Dendrite assumes git for diff-based review. Without git, audit and rollback are weakened.',
        fix: 'git init'
      });
    }

    findings.push({
      severity: 'info',
      rule: 'project-stats',
      title: `${pages.length} wiki page${pages.length === 1 ? '' : 's'} total.`,
      detail: `${lintFindings.length} lint finding${lintFindings.length === 1 ? '' : 's'}, ${proposals.length} proposal${proposals.length === 1 ? '' : 's'}, ${memoryReview.findings.length} memory finding${memoryReview.findings.length === 1 ? '' : 's'}. Telemetry: ${telemetryStatus?.sharingMode ?? 'unknown'}.`
    });
  }

  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length
  };
  const status: DoctorReport['status'] = counts.critical > 0 ? 'critical' : counts.warning > 0 ? 'warnings' : 'healthy';

  return {
    generatedAt: new Date().toISOString(),
    root,
    findings,
    counts,
    status
  };
}

export function formatDoctorReport(report: DoctorReport): string {
  const lines: string[] = [];
  const statusEmoji = report.status === 'healthy' ? 'OK' : report.status === 'warnings' ? 'WARN' : 'FAIL';
  lines.push(`Dendrite Doctor — ${statusEmoji}`);
  lines.push(`Project: ${report.root}`);
  lines.push(`Critical: ${report.counts.critical}  Warnings: ${report.counts.warning}  Info: ${report.counts.info}`);
  lines.push('');

  const sections: Array<{ severity: DoctorSeverity; label: string }> = [
    { severity: 'critical', label: 'CRITICAL' },
    { severity: 'warning', label: 'WARNING' },
    { severity: 'info', label: 'INFO' }
  ];

  for (const section of sections) {
    const sectionFindings = report.findings.filter((f) => f.severity === section.severity);
    if (sectionFindings.length === 0) continue;

    lines.push(`[${section.label}]`);
    for (const finding of sectionFindings) {
      lines.push(`  ${finding.title}`);
      lines.push(`    ${finding.detail}`);
      if (finding.fix) {
        lines.push(`    Fix: ${finding.fix}`);
      }
      lines.push('');
    }
  }

  if (report.findings.length === 0) {
    lines.push('No findings — Dendrite is healthy.');
  }

  return lines.join('\n');
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
