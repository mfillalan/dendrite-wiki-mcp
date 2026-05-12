#!/usr/bin/env node
/**
 * Dendrite Wiki CLI — the `dendrite-wiki` binary.
 *
 * The operator-facing companion to the MCP server. Handles workspace setup (`init`),
 * benchmark snapshots, the `docs:api` API reference generator, observation capture and
 * inspection, the doctor health audit, telemetry consent, skill export/import, the
 * diff-context aggregator, and a handful of hook entry points (`ritual:hook`,
 * `skills:hook`, `observations:capture`) the IDE clients call as Pre/PostToolUse hooks.
 *
 * Each subcommand maps to a topic-specific module under `./wiki/`, plus the installer in
 * `./install.ts`. Output is human-readable by default; subcommands that have a JSON shape
 * accept `--json` or `--format json`. Hook subcommands always emit silent stdout on
 * non-applicable cases so they never block the editor's tool-call flow on a Dendrite
 * issue.
 */
import { installDendriteWorkspace, type DendriteInstallMode, type DendriteInstallProfile } from './install.js';
import { writeBenchmarkSnapshot } from './wiki/benchmark.js';
import { bootstrapRecallProbeFile } from '@dendrite/memory';
import { formatDoctorReport, runDoctor } from './wiki/doctor.js';
import {
  captureRawObservation,
  detectRawObservationClusters,
  isRawObservationsCaptureEnabled,
  readRawObservations,
  importSkillFromFile,
  SkillPortabilityError,
  writeSkillExport,
  compressObservationClusters,
  computeRemindersForState,
  readPersistedRitualState,
  formatOperatorPhraseNudges,
  matchOperatorPhrases
} from '@dendrite/memory';
import { buildDiffContext, renderDiffContextMarkdown } from './wiki/diff-context.js';
import { writeBenchmarkReportHtml } from './wiki/report-export.js';
import { exportBinderHtml, type BinderTheme } from './wiki/binder-export.js';
import { recallProjectSkills } from '@dendrite/memory';
import { setTelemetrySharingMode, uploadTelemetry, writeTelemetryStatusArtifact } from './wiki/telemetry.js';

// Map friendlier --ide names to existing install profiles. The --ide flag is the
// preferred surface (matches how other agent-memory tools market install paths);
// --profile remains supported as the underlying mechanism. New aliases here become
// visible in help text and README without changing the installer's profile model.
const ideAliasToProfile: Record<string, DendriteInstallProfile> = {
  'claude-code': 'claude',
  'claude': 'claude',
  'cursor': 'cursor',
  'codex': 'codex',
  'continue': 'continue',
  'windsurf': 'windsurf',
  'antigravity': 'antigravity',
  'gemini': 'antigravity',
  'gemini-cli': 'antigravity',
  'copilot-vscode': 'copilot-vscode',
  'copilot': 'copilot-vscode',
  'vscode': 'copilot-vscode'
};

const [command, ...args] = process.argv.slice(2);

try {
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printHelp();
  } else if (command === 'init') {
    const mode = readMode(args);
    const profile = readProfile(args);
    const result = await installDendriteWorkspace({ mode, profile });
    console.log(`Dendrite Wiki MCP initialized in ${result.root}`);
    console.log(`Mode: ${result.mode}`);
    console.log(`Profile: ${result.profile}`);
    console.log(`Written: ${result.written.length === 0 ? 'none' : result.written.join(', ')}`);
    console.log(`Unchanged: ${result.unchanged.length === 0 ? 'none' : result.unchanged.join(', ')}`);
  } else if (command === 'benchmark:snapshot') {
    const label = readValue(args, '--label') ?? 'manual';
    const query = readValue(args, '--query');
    const snapshot = await writeBenchmarkSnapshot({ label, query });
    console.log(`Wrote benchmark snapshot for ${snapshot.metrics.pageCount} pages.`);
    console.log(`Latest artifact: docs/public/dendrite-benchmark-latest.json`);
    console.log(`History artifact: docs/public/dendrite-benchmark-history.json`);
    console.log(`Benchmark log: docs/wiki/benchmark-log.md`);
  } else if (command === 'ritual:cursor-hook') {
    // Cursor's beforeMCPExecution hook protocol differs from Claude Code's:
    // it expects { permission: 'allow'|'deny'|'ask', userMessage?, agentMessage? }
    // rather than { hookSpecificOutput: { additionalContext: ... } }.
    // We always allow (never block — heavy-handed for a documentation tool)
    // and surface ritual reminders via agentMessage when state shows gaps.
    //
    // B3: best-effort operator phrasebook matching. Cursor's beforeMCPExecution
    // payload does not generally carry the user prompt, so matchOperatorPhrases
    // silently returns 0 matches and only ritual-state reminders surface. If a
    // future Cursor hook protocol exposes the prompt, this hook will start
    // emitting phrasebook nudges automatically.
    const snapshot = await readPersistedRitualState();
    let promptText = '';
    try {
      const stdin = await readStdin();
      if (stdin.trim()) {
        const payload = JSON.parse(stdin) as { prompt?: unknown };
        if (typeof payload.prompt === 'string') {
          promptText = payload.prompt;
        }
      }
    } catch {
      // No-op on protocol/JSON failure — never block the call.
    }
    const phraseMatches = matchOperatorPhrases(promptText);
    const reminders = snapshot ? computeRemindersForState(snapshot) : [];
    if (reminders.length === 0 && phraseMatches.length === 0) {
      process.exit(0);
    }
    const lines: string[] = [];
    if (reminders.length > 0) {
      lines.push('[DENDRITE RITUAL CHECKPOINT]');
      for (const r of reminders) {
        const tag = r.severity === 'urgent' ? 'URGENT' : r.severity === 'nudge' ? 'NUDGE' : 'INFO';
        lines.push(`${tag} (${r.rule}): ${r.text}`);
      }
    }
    const phrasebookBlock = formatOperatorPhraseNudges(phraseMatches);
    if (phrasebookBlock) {
      if (lines.length > 0) lines.push('');
      lines.push(phrasebookBlock);
    }
    console.log(JSON.stringify({
      permission: 'allow',
      agentMessage: lines.join('\n')
    }));
  } else if (command === 'ritual:hook') {
    // Designed to be called from a Claude Code UserPromptSubmit / Codex hook.
    // Reads the persisted ritual state and emits Claude-Code/Codex-compatible
    // JSON with `additionalContext` when reminders are active. Empty stdout
    // when no reminders apply, so it stays quiet on healthy sessions.
    //
    // B3: also scans the user prompt (from stdin payload.prompt) against the
    // operator phrasebook and surfaces matching nudges so high-signal phrases
    // like "from now on" or "wrapping up" point the agent at the right MCP tool.
    const snapshot = await readPersistedRitualState();
    let promptText = '';
    try {
      const stdin = await readStdin();
      if (stdin.trim()) {
        const payload = JSON.parse(stdin) as { prompt?: unknown };
        if (typeof payload.prompt === 'string') {
          promptText = payload.prompt;
        }
      }
    } catch {
      // Hook protocol violation or non-JSON stdin — silently skip phrasebook
      // matching. Ritual reminders from persisted state still fire below.
    }
    const phraseMatches = matchOperatorPhrases(promptText);
    const reminders = snapshot ? computeRemindersForState(snapshot) : [];
    if (reminders.length === 0 && phraseMatches.length === 0) {
      process.exit(0);
    }
    const lines: string[] = [];
    if (reminders.length > 0) {
      lines.push('[DENDRITE RITUAL CHECKPOINT]');
      for (const r of reminders) {
        const tag = r.severity === 'urgent' ? 'URGENT' : r.severity === 'nudge' ? 'NUDGE' : 'INFO';
        lines.push(`${tag} (${r.rule}): ${r.text}`);
      }
      if (snapshot) {
        lines.push(`Session ${snapshot.sessionId} · ${snapshot.toolCallCount} tool calls so far · wiki_context: ${snapshot.wikiContextCalled ? 'called' : 'NOT YET'} · last memory_remember: ${snapshot.lastMemoryRememberAt ?? 'never this session'}.`);
      }
    }
    const phrasebookBlock = formatOperatorPhraseNudges(phraseMatches);
    if (phrasebookBlock) {
      if (lines.length > 0) lines.push('');
      lines.push(phrasebookBlock);
    }
    const additionalContext = lines.join('\n');
    console.log(JSON.stringify({ hookSpecificOutput: { additionalContext } }));
  } else if (command === 'skills:hook') {
    // PreToolUse hook on Edit/Write/MultiEdit. Reads JSON tool input from stdin
    // (Claude Code passes { tool_name, tool_input: { file_path, ... } }) and
    // returns hookSpecificOutput.additionalContext with matching skill summaries
    // so the agent sees relevant skills before editing.
    //
    // Per design: hook failures must never block the user's Edit/Write — exit 0
    // with empty stdout on any error so the file edit proceeds normally.
    try {
      const stdin = await readStdin();
      const payload = stdin.trim() ? JSON.parse(stdin) : {};
      const toolInput = (payload.tool_input ?? payload.input ?? {}) as { file_path?: string; query?: string; description?: string };
      const filePath = typeof toolInput.file_path === 'string' ? toolInput.file_path : '';
      if (!filePath) {
        process.exit(0);
      }
      const taskHint = typeof toolInput.description === 'string' && toolInput.description.trim()
        ? toolInput.description
        : `editing ${filePath}`;
      const skills = await recallProjectSkills({ query: taskHint, relatedFiles: [filePath], maxItems: 3 });
      if (skills.length === 0) {
        process.exit(0);
      }
      const lines: string[] = ['[DENDRITE SKILLS]'];
      lines.push(`The following project-local skills match ${filePath}. Call mcp__dendrite-wiki-mcp__wiki_skill_load(id) to read full content.`);
      for (const skill of skills) {
        lines.push('');
        lines.push(`- ${skill.id}: ${skill.summary}`);
        lines.push(`  reasons: ${skill.reasons.slice(0, 3).join('; ')}`);
      }
      console.log(JSON.stringify({ hookSpecificOutput: { additionalContext: lines.join('\n') } }));
    } catch {
      // Silent failure per design — never block Edit/Write on a discovery feature failure.
      process.exit(0);
    }
  } else if (command === 'observations:capture') {
    // PostToolUse hook. Reads JSON from stdin (Claude Code/Codex pass
    // { session_id, tool_name, tool_input, tool_response }) and appends one
    // raw observation. Silent on every error path so a hook failure never
    // breaks the agent's tool call.
    try {
      if (!isRawObservationsCaptureEnabled()) {
        process.exit(0);
      }
      const stdin = await readStdin();
      const payload = stdin.trim() ? JSON.parse(stdin) : {};
      const tool = typeof payload.tool_name === 'string' ? payload.tool_name : '';
      if (!tool) {
        process.exit(0);
      }
      const toolInput = (payload.tool_input ?? {}) as {
        file_path?: string;
        command?: string;
        url?: string;
        pattern?: string;
        query?: string;
        description?: string;
      };
      const target =
        toolInput.file_path ??
        toolInput.command ??
        toolInput.url ??
        toolInput.pattern ??
        toolInput.query ??
        '';
      const summary =
        typeof toolInput.description === 'string' && toolInput.description.trim()
          ? toolInput.description
          : typeof toolInput.command === 'string'
          ? toolInput.command
          : '';
      const sessionId =
        typeof payload.session_id === 'string' ? payload.session_id : undefined;
      const toolResponse = payload.tool_response;
      let outcome: 'ok' | 'error' | 'unknown' = 'unknown';
      if (toolResponse && typeof toolResponse === 'object') {
        const candidate = toolResponse as { is_error?: unknown; error?: unknown };
        outcome = candidate.is_error === true || candidate.error !== undefined ? 'error' : 'ok';
      }
      await captureRawObservation({
        tool,
        target: typeof target === 'string' ? target.split('\n')[0] : '',
        summary,
        outcome,
        sessionId
      });
    } catch {
      // Silent failure per design — never block the agent.
    }
    process.exit(0);
  } else if (command === 'observations:clusters') {
    const minOccArg = readValue(args, '--min');
    const minSessArg = readValue(args, '--sessions');
    const windowArg = readValue(args, '--window-days');
    const clusters = await detectRawObservationClusters({
      minOccurrences: minOccArg ? Math.max(2, Number.parseInt(minOccArg, 10) || 3) : undefined,
      minDistinctSessions: minSessArg ? Math.max(1, Number.parseInt(minSessArg, 10) || 2) : undefined,
      windowDays: windowArg ? Math.max(1, Number.parseInt(windowArg, 10) || 0) : undefined
    });
    if (clusters.length === 0) {
      console.log('No observation clusters meet the threshold.');
      console.log('Defaults: at least 3 occurrences across at least 2 distinct sessions on the same (kind, target).');
      console.log('Tune with --min N --sessions M --window-days D.');
    } else {
      for (const cluster of clusters) {
        const outcomes = `ok=${cluster.outcomeCounts.ok} err=${cluster.outcomeCounts.error} unk=${cluster.outcomeCounts.unknown}`;
        console.log(
          `${cluster.kind.padEnd(7)}  ${String(cluster.observationCount).padStart(3)}x  ${String(cluster.distinctSessionCount).padStart(2)} sess  ${outcomes.padEnd(28)}  ${cluster.target}`
        );
      }
      console.log(`\n(${clusters.length} cluster${clusters.length === 1 ? '' : 's'})`);
    }
  } else if (command === 'observations:compress') {
    // Build deterministic handoff prompts for recent observation clusters that the
    // operator can paste into any LLM (Claude, GPT, local model) to produce a draft
    // candidate memory text. No LLM is called from this command — output is pure
    // structured text. Matches the existing `agent` synthesis-provider pattern.
    const targetFilter = readValue(args, '--target');
    const maxArg = readValue(args, '--max');
    const recentArg = readValue(args, '--recent');
    const minOccArg = readValue(args, '--min');
    const minSessArg = readValue(args, '--sessions');
    const prompts = await compressObservationClusters({
      targetFilter,
      maxClusters: maxArg ? Math.max(1, Number.parseInt(maxArg, 10) || 0) : undefined,
      recentObservationLimit: recentArg ? Math.max(1, Number.parseInt(recentArg, 10) || 0) : undefined,
      minOccurrences: minOccArg ? Math.max(2, Number.parseInt(minOccArg, 10) || 0) : undefined,
      minDistinctSessions: minSessArg ? Math.max(1, Number.parseInt(minSessArg, 10) || 0) : undefined
    });
    if (prompts.length === 0) {
      console.log('No observation clusters meet the threshold.');
      console.log('Defaults: at least 3 occurrences across at least 2 distinct sessions.');
      console.log('Tune with --min N --sessions M --target <substring> --max N --recent N.');
    } else {
      for (const item of prompts) {
        console.log(`# Cluster: ${item.clusterKind} ${item.target}`);
        console.log(`# observations=${item.observationCount} sessions=${item.distinctSessionCount} last=${item.lastSeen}`);
        console.log('');
        console.log(item.prompt);
        console.log('');
        console.log('-----');
        console.log('');
      }
      console.log(`(${prompts.length} compression prompt${prompts.length === 1 ? '' : 's'})`);
      console.log('Paste each prompt into your preferred LLM. Use the returned draft text with mcp__dendrite-wiki-mcp__memory_remember (kind=lesson, sources=[file:/command: link to target]).');
    }
  } else if (command === 'observations:list') {
    const limitArg = readValue(args, '--limit');
    const limit = limitArg ? Math.max(1, Number.parseInt(limitArg, 10) || 50) : 50;
    const observations = await readRawObservations({ limit });
    if (observations.length === 0) {
      console.log('No raw observations captured yet.');
      console.log('They are recorded automatically via the PostToolUse hook when the installer wires it.');
      console.log('Opt out with DENDRITE_RAW_OBSERVATIONS=off.');
    } else {
      for (const observation of observations) {
        console.log(
          `${observation.ts}  ${observation.kind.padEnd(7)}  ${observation.tool.padEnd(12)}  ${observation.outcome.padEnd(7)}  ${observation.target}`
        );
      }
      console.log(`\n(${observations.length} observation${observations.length === 1 ? '' : 's'})`);
    }
  } else if (command === 'skill:export') {
    const skillId = args[0];
    if (!skillId || skillId.startsWith('--')) {
      throw new Error('skill:export requires a skill memory id as the first argument.');
    }
    const outputPath = readValue(args, '--output');
    try {
      const bundle = await writeSkillExport(skillId, { outputPath });
      console.log(`Wrote skill export to ${bundle.filename}`);
      console.log('Share this file with another project and run `dendrite-wiki skill:import` there to install it.');
    } catch (error) {
      if (error instanceof SkillPortabilityError) {
        throw new Error(`${error.code}: ${error.message}`);
      }
      throw error;
    }
  } else if (command === 'skill:import') {
    const inputPath = args[0];
    if (!inputPath || inputPath.startsWith('--')) {
      throw new Error('skill:import requires a path to a skill export markdown file as the first argument.');
    }
    try {
      const result = await importSkillFromFile(inputPath);
      console.log(`Imported skill ${result.record.id}: ${result.record.summary}`);
      console.log(`Provenance: ${result.importedFromUri}`);
      const scope = result.inferredScope;
      const dims: string[] = [];
      if (scope.filePatterns.length > 0) dims.push(`filePatterns: ${scope.filePatterns.join(', ')}`);
      if (scope.languages.length > 0) dims.push(`languages: ${scope.languages.join(', ')}`);
      if (scope.frameworks.length > 0) dims.push(`frameworks: ${scope.frameworks.join(', ')}`);
      if (scope.taskKeywords.length > 0) dims.push(`taskKeywords: ${scope.taskKeywords.join(', ')}`);
      if (dims.length > 0) console.log(`Scope: ${dims.join(' · ')}`);
    } catch (error) {
      if (error instanceof SkillPortabilityError) {
        throw new Error(`${error.code}: ${error.message}`);
      }
      throw error;
    }
  } else if (command === 'context-for-diff') {
    // Aggregate Dendrite's wiki/memory/skill context for a list of changed files. Pipe
    // a list of file paths via --files OR via stdin (one path per line). Output is markdown
    // suitable for a PR comment, terminal review, or any other surface.
    let files: string[] = [];
    const filesIndex = args.indexOf('--files');
    if (filesIndex !== -1) {
      // Consume all positional args after --files until the next flag.
      let cursor = filesIndex + 1;
      while (cursor < args.length && !args[cursor].startsWith('--')) {
        files.push(args[cursor]);
        cursor += 1;
      }
    }
    if (files.length === 0 && !process.stdin.isTTY) {
      const stdin = await readStdin();
      files = stdin.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    }
    if (files.length === 0) {
      throw new Error(
        'context-for-diff requires file paths. Pass --files <path> [<path>...] or pipe paths via stdin (one per line). Example: git diff --name-only main...HEAD | dendrite-wiki context-for-diff'
      );
    }
    const query = readValue(args, '--query');
    const result = await buildDiffContext({ files, query });
    console.log(renderDiffContextMarkdown(result));
  } else if (command === 'docs:api') {
    // Generate or refresh API reference markdown pages from TSDoc/JSDoc comments in the
    // project's source tree. Pages land under docs/wiki/api/ and a manifest at
    // docs/public/api-reference-manifest.json tracks ownership for orphan cleanup.
    const dryRun = args.includes('--dry-run');
    const format = readValue(args, '--format') ?? 'human';
    if (format !== 'human' && format !== 'json') {
      throw new Error(`docs:api --format must be "human" or "json", got "${format}"`);
    }

    const paths: string[] = [];
    const pathsIndex = args.indexOf('--paths');
    if (pathsIndex !== -1) {
      let cursor = pathsIndex + 1;
      while (cursor < args.length && !args[cursor].startsWith('--')) {
        paths.push(args[cursor]);
        cursor += 1;
      }
    }

    const { refreshApiReference } = await import('./wiki/api-reference.js');
    const result = await refreshApiReference({
      dryRun,
      walkOptions: paths.length > 0 ? { include: paths } : undefined
    });

    if (format === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      const summary: string[] = [];
      summary.push(`Sources scanned: ${result.sourcesScanned}`);
      summary.push(`Pages written: ${result.pagesWritten}${dryRun ? ' (dry run — nothing written)' : ''}`);
      summary.push(`Pages changed: ${result.pagesChanged.length}`);
      summary.push(`Pages deleted: ${result.pagesDeleted.length}`);
      summary.push(`Sources skipped: ${result.sourcesSkipped.length}`);
      summary.push(`Warnings: ${result.warnings.length}`);
      if (result.pagesChanged.length > 0) {
        summary.push('');
        summary.push('Changed pages:');
        for (const slug of result.pagesChanged) summary.push(`  - ${slug}`);
      }
      if (result.pagesDeleted.length > 0) {
        summary.push('');
        summary.push('Deleted pages:');
        for (const slug of result.pagesDeleted) summary.push(`  - ${slug}`);
      }
      if (result.warnings.length > 0) {
        summary.push('');
        summary.push('Warnings:');
        for (const warning of result.warnings) {
          summary.push(`  - [${warning.kind}] ${warning.message}`);
        }
      }
      console.log(summary.join('\n'));
    }

    // Treat extraction failures as a non-zero exit. low-coverage / unresolved-link /
    // ambiguous-link warnings are informational and do not fail the run.
    if (result.warnings.some((warning) => warning.kind === 'extraction-error')) {
      process.exitCode = 1;
    }
  } else if (command === 'doctor') {
    const asJson = args.includes('--json');
    const report = await runDoctor();
    if (asJson) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      console.log(formatDoctorReport(report));
    }
    if (report.status === 'critical') {
      process.exitCode = 1;
    }
  } else if (command === 'report:export') {
    const outputPath = readValue(args, '--output');
    const reportTitle = readValue(args, '--title');
    const result = await writeBenchmarkReportHtml({ outputPath, reportTitle });

    if (!result.hasData) {
      console.log('No benchmark snapshots found yet. Wrote an empty-state report.');
      console.log('Run `npx dendrite-wiki benchmark:snapshot` to capture a snapshot, then re-export.');
    } else {
      console.log(`Wrote benchmark report (${result.snapshotCount} snapshots, ${formatBytes(result.bytesWritten)}).`);
    }
    console.log(`Report: ${result.outputPath}`);
  } else if (command === 'binder:export') {
    // R6 of the retro-editor experiment. Compiles selected wiki pages into a
    // single self-contained, print-ready HTML file (binder workflow).
    const outputPath = readValue(args, '--output');
    const title = readValue(args, '--title');
    const themeArg = readValue(args, '--theme');
    const pagesArg = readValue(args, '--pages');
    const all = args.includes('--all') || !pagesArg;
    const theme: BinderTheme = (() => {
      if (themeArg === 'amber' || themeArg === 'wordperfect' || themeArg === 'modern' || themeArg === 'selectric') {
        return themeArg;
      }
      return 'selectric';
    })();
    const slugs = pagesArg
      ? pagesArg.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;

    const result = await exportBinderHtml({ outputPath, title, theme, slugs, all });
    console.log(`Wrote binder (${result.pageCount} pages, ${formatBytes(result.bytesWritten)}, ${result.theme} theme).`);
    console.log(`Binder: ${result.outputPath}`);
    console.log(`Open it in a browser, then File → Print → Save as PDF for the binder workflow.`);
  } else if (command === 'memory:auto-promote') {
    // Trust-gated auto-promotion: scan project-local memories, find ones whose quality
    // signals (recall count, typed sources, target page exists, no contradiction) are
    // overwhelming, and promote them to wiki page sections without operator review.
    // --dry-run prints candidates without writing. Without --dry-run, applies promotions
    // (which still produce a normal git diff for the operator to inspect).
    const dryRun = args.includes('--dry-run');
    const { autoPromoteMemories, isAutoPromoteEnabled } = await import('./wiki/auto-promote.js');
    if (!isAutoPromoteEnabled() && !dryRun) {
      console.log('DENDRITE_AUTO_PROMOTE is not set to "on". Refusing to apply.');
      console.log('Either set DENDRITE_AUTO_PROMOTE=on for this command, or run with --dry-run to preview candidates.');
      process.exit(1);
    }
    const result = await autoPromoteMemories({ dryRun });
    if (result.candidates.length === 0) {
      console.log('No memories currently meet the auto-promotion gate (recall ≥ 20, typed source, target page exists, no contradiction).');
    } else {
      console.log(`${result.candidates.length} candidate${result.candidates.length === 1 ? '' : 's'}:`);
      for (const candidate of result.candidates) {
        console.log(`- ${candidate.record.id} → ${candidate.targetPageSlug}: ${candidate.reason}`);
        console.log(`    summary: ${candidate.record.summary.slice(0, 120)}`);
      }
      if (dryRun) {
        console.log('Dry run — no writes performed. Drop --dry-run to apply (requires DENDRITE_AUTO_PROMOTE=on).');
      } else {
        console.log(`Applied ${result.applied.length} of ${result.candidates.length} promotions.`);
        for (const r of result.applied) {
          const verb = r.applied ? 'wrote' : 'skipped (page already had text)';
          console.log(`  ${verb} ${r.targetPage.slug}: memories ${r.memoryIds.join(', ')} marked superseded.`);
        }
        console.log('Run `git diff` to review the auto-promoted pages and project-log entries.');
      }
    }
  } else if (command === 'consolidate') {
    // B9: sleep-cycle consolidation. Groups memory_review findings, auto-promote
    // candidates, and auto-archive candidates into clusters by shared relatedFiles /
    // relatedPages / tags overlap. Default mode is dry-run (read-only report). --apply
    // additionally orchestrates auto-promote and auto-archive sweeps under a shared cap
    // (requires DENDRITE_AUTO_CONSOLIDATE=on plus the per-sweep env vars).
    const apply = args.includes('--apply');
    const maxClustersRaw = readValue(args, '--max-clusters');
    const maxClusters = maxClustersRaw ? Number(maxClustersRaw) : undefined;
    const { runConsolidatePass, isAutoConsolidateEnabled } = await import('./wiki/consolidate.js');
    if (apply && !isAutoConsolidateEnabled()) {
      console.log('DENDRITE_AUTO_CONSOLIDATE is not set to "on". Refusing to apply.');
      console.log('Either set DENDRITE_AUTO_CONSOLIDATE=on for this command (and DENDRITE_AUTO_PROMOTE / DENDRITE_AUTO_ARCHIVE for the sub-sweeps), or omit --apply to preview the cluster report.');
      process.exit(1);
    }
    const result = await runConsolidatePass({
      dryRun: !apply,
      maxClusters: Number.isFinite(maxClusters) ? maxClusters : undefined
    });
    const { report } = result;
    console.log(`Consolidation report: ${report.totalFindings} finding${report.totalFindings === 1 ? '' : 's'} grouped into ${report.clusters.length} cluster${report.clusters.length === 1 ? '' : 's'} (${report.orphans.length} orphan${report.orphans.length === 1 ? '' : 's'} without anchors).`);
    if (report.omittedClusters > 0) {
      console.log(`(${report.omittedClusters} additional cluster${report.omittedClusters === 1 ? '' : 's'} omitted by --max-clusters cap.)`);
    }
    for (const [index, cluster] of report.clusters.entries()) {
      console.log('');
      console.log(`#${index + 1} cluster: ${cluster.findings.length} finding${cluster.findings.length === 1 ? '' : 's'} on ${cluster.anchors.slice(0, 3).join(', ')}${cluster.anchors.length > 3 ? '…' : ''}`);
      for (const finding of cluster.findings) {
        console.log(`  - [${finding.kind}] ${finding.memoryIds.join(', ')}: ${finding.summary.slice(0, 100)}${finding.summary.length > 100 ? '…' : ''}`);
      }
    }
    if (report.orphans.length > 0) {
      console.log('');
      console.log(`Anchor-less findings (no relatedFiles/relatedPages/tags):`);
      for (const finding of report.orphans.slice(0, 10)) {
        console.log(`  - [${finding.kind}] ${finding.memoryIds.join(', ')}: ${finding.summary.slice(0, 100)}`);
      }
      if (report.orphans.length > 10) {
        console.log(`  … ${report.orphans.length - 10} more.`);
      }
    }
    if (apply) {
      if (result.applied.skippedBecauseDisabled) {
        console.log('');
        console.log('Apply phase skipped — DENDRITE_AUTO_CONSOLIDATE was not set when the sweep ran.');
      } else {
        console.log('');
        console.log(`Apply phase: promoted ${result.applied.promoteCount}, archived ${result.applied.archiveCount}. Run \`git diff\` to review.`);
      }
    } else {
      console.log('');
      console.log('Dry run — no writes performed. Pass --apply (with DENDRITE_AUTO_CONSOLIDATE=on, plus DENDRITE_AUTO_PROMOTE=on and DENDRITE_AUTO_ARCHIVE=on for the sub-sweeps) to apply the bundled cleanup.');
    }
  } else if (command === 'memory:auto-archive') {
    // B6: synaptic-pruning auto-archive. Scans for active non-skill/non-handoff memories
    // with zero recalls, zero sources, age >= 30 days, and unset salience. Archives them
    // (reversibly via memory_restore). --dry-run prints candidates without writing. Apply
    // mode requires DENDRITE_AUTO_ARCHIVE=on (mirrors DENDRITE_AUTO_PROMOTE gate).
    const dryRun = args.includes('--dry-run');
    const { autoArchiveMemories, isAutoArchiveEnabled } = await import('./wiki/memory-auto-archive.js');
    if (!isAutoArchiveEnabled() && !dryRun) {
      console.log('DENDRITE_AUTO_ARCHIVE is not set to "on". Refusing to apply.');
      console.log('Either set DENDRITE_AUTO_ARCHIVE=on for this command, or run with --dry-run to preview candidates.');
      process.exit(1);
    }
    const result = await autoArchiveMemories({ dryRun });
    if (result.candidates.length === 0) {
      console.log('No memories currently meet the auto-archive gate (active non-skill non-handoff with recall=0, sources=0, age >= 30 days, unpinned).');
    } else {
      console.log(`${result.candidates.length} candidate${result.candidates.length === 1 ? '' : 's'} (max per sweep is 25):`);
      for (const candidate of result.candidates) {
        console.log(`- ${candidate.record.id}: ${candidate.reason}`);
        console.log(`    summary: ${candidate.record.summary.slice(0, 120)}`);
      }
      if (dryRun) {
        console.log('Dry run — no writes performed. Drop --dry-run to apply (requires DENDRITE_AUTO_ARCHIVE=on).');
      } else {
        console.log(`Archived ${result.archived.length} of ${result.candidates.length} candidates.`);
        console.log('Use mcp__dendrite-wiki-mcp__memory_restore <id> to reverse any archive that was wrong.');
      }
    }
  } else if (command === 'recall:bootstrap') {
    const force = args.includes('--force');
    const outputPath = readValue(args, '--output');
    const result = await bootstrapRecallProbeFile({ force, outputPath });

    if (result.written) {
      const verb = result.reason === 'overwritten' ? 'Overwrote' : 'Wrote';
      console.log(`${verb} ${result.outputPath}`);
      console.log(`Probes: ${result.probeCount} (source: ${result.source})`);
      if (result.source === 'template') {
        console.log('No active project-local memories were found, so the file ships placeholder probes you should edit before running the benchmark.');
      }
    } else {
      console.log(`Skipped: ${result.outputPath} already exists. Re-run with --force to overwrite.`);
      process.exitCode = 1;
    }
  } else if (command === 'telemetry') {
    const subcommand = args[0] ?? 'status';

    if (subcommand === 'status') {
      const status = await writeTelemetryStatusArtifact();
      console.log(`Telemetry sharing: ${status.sharingEnabled ? 'opt-in' : 'off'}`);
      console.log(`Explicit consent recorded: ${status.consent.isExplicit ? 'yes' : 'no'}`);
      console.log(`Captured local benchmark events: ${status.benchmarkEvents.eventCount}`);
      console.log(`Status artifact: ${status.paths.statusArtifactPath}`);
      console.log(`Config: ${status.paths.configPath}`);
      console.log(`Upload audit: ${status.paths.uploadAuditPath}`);
    } else if (subcommand === 'opt-in') {
      const status = await setTelemetrySharingMode('opt-in');
      console.log('Telemetry sharing consent recorded as opt-in.');
      console.log(`Status artifact: ${status.paths.statusArtifactPath}`);
      console.log(`Config: ${status.paths.configPath}`);
    } else if (subcommand === 'opt-out') {
      const status = await setTelemetrySharingMode('off');
      console.log('Telemetry sharing set to off. Local benchmark artifacts remain available.');
      console.log(`Status artifact: ${status.paths.statusArtifactPath}`);
      console.log(`Config: ${status.paths.configPath}`);
    } else if (subcommand === 'upload') {
      const result = await uploadTelemetry();
      console.log(result.message);
      console.log(`Destination: ${result.destination ?? 'not configured'}`);
      console.log(`Upload audit: ${result.auditPath}`);
      console.log(`Status artifact: ${result.status.paths.statusArtifactPath}`);
      if (!result.ok) {
        process.exitCode = 1;
      }
    } else {
      throw new Error(`Unknown telemetry command: ${subcommand}`);
    }
  } else if (command === 'telemetry:report') {
    // T5: project-owner-only aggregate view of the shared cohort. Reads DENDRITE_WIKI_TELEMETRY_REPORT_URL
    // + _REPORT_TOKEN (separate from the upload-side env vars so the report token is read-scoped) and
    // emits text or JSON. The JSON output is the canonical shape for docs/public/aggregate-learnings.json (T6).
    const { buildTelemetryReport, formatTelemetryReportAsText } = await import('./wiki/telemetry-report.js');
    const url = process.env.DENDRITE_WIKI_TELEMETRY_REPORT_URL?.trim() ?? '';
    const token = process.env.DENDRITE_WIKI_TELEMETRY_REPORT_TOKEN?.trim() ?? '';
    const table = process.env.DENDRITE_WIKI_TELEMETRY_REPORT_TABLE?.trim() || undefined;
    const format = readValue(args, '--format') ?? 'text';
    const sinceArg = readValue(args, '--since') ?? '30d';
    const sinceMatch = /^(\d+)d$/.exec(sinceArg);
    if (!sinceMatch) {
      throw new Error(`Invalid --since value "${sinceArg}". Expected format: <days>d (e.g. 30d, 90d).`);
    }
    const sinceDays = Number(sinceMatch[1]);
    if (!url || !token) {
      throw new Error(
        'telemetry:report requires DENDRITE_WIKI_TELEMETRY_REPORT_URL and DENDRITE_WIKI_TELEMETRY_REPORT_TOKEN. The report token must be READ-SCOPED on the shared destination — do not reuse the package-baked write-scoped token.'
      );
    }
    const report = await buildTelemetryReport({ url, token, table, sinceDays });
    if (format === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else if (format === 'text') {
      console.log(formatTelemetryReportAsText(report));
    } else {
      throw new Error(`Invalid --format value "${format}". Expected one of: text, json.`);
    }
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

function readMode(args: string[]): DendriteInstallMode {
  const explicitMode = readValue(args, '--mode') as DendriteInstallMode | undefined;
  if (explicitMode) {
    if (!['package', 'dev', 'built'].includes(explicitMode)) {
      throw new Error(`Unsupported init mode: ${explicitMode}`);
    }
    return explicitMode;
  }

  if (args.includes('--dev')) {
    return 'dev';
  }

  if (args.includes('--built')) {
    return 'built';
  }

  return 'package';
}

function readProfile(args: string[]): DendriteInstallProfile {
  const explicitIde = readValue(args, '--ide');
  if (explicitIde) {
    const normalized = explicitIde.trim().toLowerCase();
    const mapped = ideAliasToProfile[normalized];
    if (!mapped) {
      throw new Error(
        `Unsupported --ide value: ${explicitIde}. Known IDEs: ${Object.keys(ideAliasToProfile).sort().join(', ')}.`
      );
    }
    return mapped;
  }

  const explicitProfile = readValue(args, '--profile') as DendriteInstallProfile | undefined;
  if (!explicitProfile) {
    return 'all';
  }

  if (!['all', 'claude', 'copilot-vscode', 'cursor', 'codex', 'continue', 'windsurf', 'antigravity'].includes(explicitProfile)) {
    throw new Error(`Unsupported init profile: ${explicitProfile}`);
  }

  return explicitProfile;
}

function readValue(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) {
    return undefined;
  }

  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value.`);
  }

  return value;
}

function printHelp(): void {
  console.log(`Dendrite Wiki MCP\n\nCommands:\n  dendrite-wiki init [--mode package|dev|built] [--ide claude-code|cursor|codex|continue|windsurf|gemini-cli|copilot-vscode|...] [--profile all|claude|copilot-vscode|cursor|codex|continue|windsurf|antigravity]\n  dendrite-wiki benchmark:snapshot [--label value] [--query value]\n  dendrite-wiki doctor [--json]\n  dendrite-wiki report:export [--output path] [--title text]\n  dendrite-wiki binder:export [--all | --pages slug1,slug2] [--theme selectric|amber|wordperfect|modern] [--output path] [--title text]\n  dendrite-wiki ritual:hook  (designed for Claude Code / Codex UserPromptSubmit hooks; outputs JSON)\n  dendrite-wiki ritual:cursor-hook  (designed for Cursor beforeMCPExecution hook; outputs Cursor-shaped JSON)\n  dendrite-wiki skills:hook  (designed for Claude Code PreToolUse hooks on Edit/Write; reads JSON tool input from stdin and outputs matching skill summaries)\n  dendrite-wiki observations:capture  (designed for Claude Code/Codex PostToolUse hooks; reads JSON tool payload from stdin and appends one raw observation to local-data/raw-observations.jsonl)\n  dendrite-wiki observations:list [--limit N]\n  dendrite-wiki observations:clusters [--min N] [--sessions M] [--window-days D]\n  dendrite-wiki observations:compress [--target substring] [--max N] [--recent N] [--min N] [--sessions M]  (deterministic LLM handoff prompts; no LLM is called from this command)\n  dendrite-wiki skill:export <skill-id> [--output path]\n  dendrite-wiki skill:import <path-to-export.skill.md>\n  dendrite-wiki context-for-diff [--files <path>...] [--query text]   (or pipe newline-delimited paths via stdin: \`git diff --name-only main...HEAD | dendrite-wiki context-for-diff\`)\n  dendrite-wiki docs:api [--dry-run] [--paths <glob>...] [--format human|json]
  dendrite-wiki recall:bootstrap [--force] [--output path]\n  dendrite-wiki telemetry [status|opt-in|opt-out|upload]\n\nInstall modes:\n  package  Configure clients to run npx -y dendrite-wiki-mcp.\n  dev      Configure this workspace to run npm run dev.\n  built    Configure this workspace to run node dist/src/index.js.\n\nInstall profiles:\n  all             Write all workspace-local client configs and guidance files.\n  claude          Write the Claude Code project config shared by the CLI and VS Code extension, plus the Claude command, starter wiki seed, and benchmark log.\n  copilot-vscode  Write VS Code Copilot MCP config plus VS Code and GitHub guidance files.\n  cursor          Write only Cursor MCP config, Cursor rule, starter wiki seed, and benchmark log.\n  codex           Write only Codex CLI/IDE project config, starter wiki seed, and benchmark log.\n  continue        Write only Continue workspace MCP config, starter wiki seed, and benchmark log.\n  windsurf        Write only the Windsurf user MCP config in ~/.codeium/windsurf.\n  antigravity     Write only the Antigravity user MCP config in ~/.gemini/antigravity.\n\nIDE aliases (--ide):\n  claude-code, cursor, codex, continue, windsurf, gemini-cli, copilot-vscode, vscode\n  (--ide is a friendlier surface for the same profile mapping; either flag works.)\n\nReports and audits:\n  doctor          Audit project health (missing files, stale benchmarks, lint findings, etc.). Exits 1 on critical findings.\n  report:export   Generate a self-contained HTML report from local benchmark history. Default output: docs/public/benchmark-report.html.\n  binder:export   Compile selected wiki pages into a single print-ready HTML file (cover + TOC + page-break rules). Default output: docs/public/binder.html. Open in a browser, then File → Print → Save as PDF.\n`);
}

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    return '';
  }
  return new Promise((resolve, reject) => {
    let buffer = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk: string) => {
      buffer += chunk;
    });
    process.stdin.on('end', () => resolve(buffer));
    process.stdin.on('error', (error) => reject(error));
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}