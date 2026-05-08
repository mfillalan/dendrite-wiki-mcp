/**
 * Diff-driven context aggregation for PR and local-diff reviews.
 *
 * Aggregates the wiki pages, project-local memories, and skills relevant to a set of
 * changed files — the same recall pipeline `wiki_context` uses for the in-editor agent,
 * but driven by file paths from a diff instead of an interactive task. Output is markdown
 * suitable for a GitHub PR comment, a local terminal review, or piping into a chat
 * application.
 *
 * Driven by the CLI's `context-for-diff` subcommand (a list of paths via the `--files`
 * flag, or piped newline-delimited via stdin from `git diff --name-only main...HEAD`).
 * The intended consumer is the future GitHub Action
 * (`dendrite-wiki/context-action`) that auto-comments PRs with relevant project memory
 * when a developer is reviewing a change — exposing the recall moat at exactly the moment
 * a human reviewer cares most.
 */
import { buildWikiContext, type WikiContextResult, type WikiContextPage } from './store.js';
import { recallProjectMemories, type RecalledProjectMemory } from './memory-store.js';
import { recallProjectSkills, type RecalledProjectSkill } from './skill-matching.js';
// into any other surface. The Action manifest that wraps this CLI for GitHub PR auto-
// commenting ships separately when there's a real signal it's wanted.

export interface BuildDiffContextOptions {
  files: string[];
  query?: string;
  maxPagesPerFile?: number;
  maxMemoriesPerFile?: number;
  maxSkillsPerFile?: number;
  // Embed languages/frameworks from the harness when known (e.g., from package.json /
  // language detection); they tighten skill scope matching.
  languages?: string[];
  frameworks?: string[];
}

export interface DiffContextEntry {
  file: string;
  pages: WikiContextPage[];
  memories: RecalledProjectMemory[];
  skills: RecalledProjectSkill[];
}

export interface BuildDiffContextResult {
  files: DiffContextEntry[];
  pageCount: number;
  memoryCount: number;
  skillCount: number;
}

const defaultMaxPagesPerFile = 3;
const defaultMaxMemoriesPerFile = 3;
const defaultMaxSkillsPerFile = 2;

export async function buildDiffContext(options: BuildDiffContextOptions): Promise<BuildDiffContextResult> {
  const files = uniqueFiles(options.files);
  if (files.length === 0) {
    return { files: [], pageCount: 0, memoryCount: 0, skillCount: 0 };
  }

  const query = (options.query ?? '').trim() || `Review changes to ${files.join(', ')}`;
  const maxPages = Math.max(1, options.maxPagesPerFile ?? defaultMaxPagesPerFile);
  const maxMemories = Math.max(1, options.maxMemoriesPerFile ?? defaultMaxMemoriesPerFile);
  const maxSkills = Math.max(1, options.maxSkillsPerFile ?? defaultMaxSkillsPerFile);

  const seenPageSlugs = new Set<string>();
  const seenMemoryIds = new Set<string>();
  const seenSkillIds = new Set<string>();

  const entries: DiffContextEntry[] = [];

  for (const file of files) {
    const [contextResult, memories, skills] = await Promise.all([
      // wiki_context with the file in relatedFiles biases ranking towards memory and page
      // matches that already cite the file.
      buildWikiContext(query, {
        maxPages,
        relatedFiles: [file],
        languages: options.languages,
        frameworks: options.frameworks,
        includeLint: false,
        maxSkills
      }) as Promise<WikiContextResult>,
      recallProjectMemories(query, { relatedFiles: [file], maxItems: maxMemories }),
      recallProjectSkills({ query, relatedFiles: [file], languages: options.languages, frameworks: options.frameworks, maxItems: maxSkills })
    ]);

    const pages = contextResult.pages.filter((page) => {
      if (seenPageSlugs.has(page.slug)) {
        return false;
      }
      seenPageSlugs.add(page.slug);
      return true;
    });
    const dedupedMemories = memories.filter((memory) => {
      if (seenMemoryIds.has(memory.id)) {
        return false;
      }
      seenMemoryIds.add(memory.id);
      return true;
    });
    const dedupedSkills = skills.filter((skill) => {
      if (seenSkillIds.has(skill.id)) {
        return false;
      }
      seenSkillIds.add(skill.id);
      return true;
    });

    entries.push({
      file,
      pages,
      memories: dedupedMemories,
      skills: dedupedSkills
    });
  }

  return {
    files: entries,
    pageCount: seenPageSlugs.size,
    memoryCount: seenMemoryIds.size,
    skillCount: seenSkillIds.size
  };
}

export function renderDiffContextMarkdown(result: BuildDiffContextResult): string {
  if (result.files.length === 0) {
    return '_Dendrite Wiki MCP found no changed files to analyze._';
  }

  const lines: string[] = [
    '## Dendrite Wiki: relevant context for this change',
    '',
    `Reviewed ${result.files.length} file${result.files.length === 1 ? '' : 's'}. Surfaced ${result.pageCount} wiki page${result.pageCount === 1 ? '' : 's'}, ${result.memoryCount} memor${result.memoryCount === 1 ? 'y' : 'ies'}, and ${result.skillCount} skill${result.skillCount === 1 ? '' : 's'}.`,
    ''
  ];

  for (const entry of result.files) {
    if (entry.pages.length === 0 && entry.memories.length === 0 && entry.skills.length === 0) {
      continue;
    }
    lines.push(`### \`${entry.file}\``, '');

    if (entry.skills.length > 0) {
      lines.push('**Matching skills**');
      for (const skill of entry.skills) {
        lines.push(`- \`${skill.id}\` — ${escape(skill.summary)} _(${skill.reasons.slice(0, 2).join('; ')})_`);
      }
      lines.push('');
    }
    if (entry.memories.length > 0) {
      lines.push('**Relevant memories**');
      for (const memory of entry.memories) {
        lines.push(`- \`${memory.id}\` — ${escape(memory.summary)} _(${memory.reasons.slice(0, 2).join('; ')})_`);
      }
      lines.push('');
    }
    if (entry.pages.length > 0) {
      lines.push('**Relevant wiki pages**');
      for (const page of entry.pages) {
        lines.push(`- [\`${page.slug}\`](docs/wiki/${page.slug}.md) — ${escape(page.summary)} _(${escape(page.reason)})_`);
      }
      lines.push('');
    }
  }

  if (result.pageCount === 0 && result.memoryCount === 0 && result.skillCount === 0) {
    lines.push(
      '_No matching wiki pages, memories, or skills were surfaced for the changed files. This usually means the changes touch new territory the wiki has not documented yet._'
    );
  }

  return lines.join('\n');
}

function uniqueFiles(input: string[]): string[] {
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== 'string') continue;
    const normalized = value.trim().replace(/\\/g, '/');
    if (!normalized) continue;
    seen.add(normalized);
  }
  return Array.from(seen);
}

function escape(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/[\r\n]+/g, ' ').trim();
}
