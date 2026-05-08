/**
 * Skill portability — export and import skill memories as self-contained markdown.
 *
 * One of Dendrite's structural advantages over opaque-DB memory tools: skills are
 * markdown, so they are inherently shareable. The CLI's `skill:export` subcommand takes
 * a memory id and writes a single self-describing markdown file with frontmatter; the
 * matching `skill:import` subcommand takes a path and round-trips that file into the
 * destination project's memory store. The round trip preserves scope, tags, related
 * files/pages, and sources, but deliberately drops machine-local state (id, recallCount,
 * timestamps) — those are regenerated on import so the imported skill starts at zero
 * recall and earns its rank in the new project.
 *
 * `private: true` memories are refused on export by design; that flag is the project's
 * "do not share" toggle and the export path honors it.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  listProjectMemories,
  rememberProjectMemory,
  type ProjectMemoryRecord,
  type ProjectMemoryScope
} from './memory-store.js';

const exportSchemaVersion = 1;

export interface SkillExportBundle {
  filename: string;
  contents: string;
}

export interface SkillExportOptions {
  outputPath?: string;
  exportedAt?: string;
  exportedFrom?: string;
}

export interface SkillImportResult {
  record: ProjectMemoryRecord;
  inferredScope: ProjectMemoryScope;
  importedFromUri: string;
}

export class SkillPortabilityError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'SkillPortabilityError';
  }
}

export async function exportSkillById(
  id: string,
  options: SkillExportOptions = {},
  root: string = process.cwd()
): Promise<SkillExportBundle> {
  const memories = await listProjectMemories({ root, includeArchived: true });
  const record = memories.find((candidate) => candidate.id === id);
  if (!record) {
    throw new SkillPortabilityError('SKILL_NOT_FOUND', `No memory with id ${id} found in the local store.`);
  }
  if (record.kind !== 'skill') {
    throw new SkillPortabilityError(
      'NOT_A_SKILL',
      `Memory ${id} has kind="${record.kind}", expected "skill". Only skill memories can be exported.`
    );
  }
  if (!record.scope) {
    throw new SkillPortabilityError(
      'SKILL_MISSING_SCOPE',
      `Skill ${id} has no scope; the export format requires at least one scope dimension. Re-create the skill with a scope object before exporting.`
    );
  }
  if (record.private === true) {
    throw new SkillPortabilityError(
      'SKILL_IS_PRIVATE',
      `Skill ${id} is marked private and cannot be exported. Private memories stay local by design. Drop the private flag (re-create the skill without private=true) if you intend to share it.`
    );
  }
  const exportedAt = options.exportedAt ?? new Date().toISOString();
  const exportedFrom = options.exportedFrom ?? 'dendrite-wiki-mcp';

  const filename = options.outputPath ?? buildDefaultFilename(record);
  const contents = buildExportMarkdown(record, exportedAt, exportedFrom);
  return { filename, contents };
}

export async function writeSkillExport(
  id: string,
  options: SkillExportOptions = {},
  root: string = process.cwd()
): Promise<SkillExportBundle> {
  const bundle = await exportSkillById(id, options, root);
  const outputPath = path.resolve(root, bundle.filename);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, bundle.contents, 'utf8');
  return { filename: outputPath, contents: bundle.contents };
}

export async function importSkillFromFile(
  filePath: string,
  root: string = process.cwd()
): Promise<SkillImportResult> {
  const absolutePath = path.resolve(filePath);
  const contents = await fs.readFile(absolutePath, 'utf8');
  const importedFromUri = `file:${path.relative(root, absolutePath).replace(/\\/g, '/')}`;
  return importSkillFromMarkdown(contents, importedFromUri, root);
}

export async function importSkillFromMarkdown(
  markdown: string,
  importedFromUri: string,
  root: string = process.cwd()
): Promise<SkillImportResult> {
  const parsed = parseExportMarkdown(markdown);
  if (parsed.kind !== 'skill') {
    throw new SkillPortabilityError(
      'NOT_A_SKILL_BUNDLE',
      `Bundle frontmatter says kind="${parsed.kind}", expected "skill". This file does not look like a skill export.`
    );
  }
  if (!parsed.metadata.scope) {
    throw new SkillPortabilityError(
      'BUNDLE_MISSING_SCOPE',
      'Bundle metadata.scope is missing or empty. Skill bundles require at least one scope dimension.'
    );
  }
  if (parsed.metadata.scope.filePatterns.length === 0
    && parsed.metadata.scope.frameworks.length === 0
    && parsed.metadata.scope.languages.length === 0
    && parsed.metadata.scope.taskKeywords.length === 0) {
    throw new SkillPortabilityError(
      'BUNDLE_SCOPE_EMPTY',
      'Bundle metadata.scope has no matchers; at least one of filePatterns, frameworks, languages, or taskKeywords is required.'
    );
  }

  const sources = uniqueStrings([...parsed.metadata.sources, importedFromUri]);

  const record = await rememberProjectMemory(
    {
      text: parsed.body,
      kind: 'skill',
      tags: parsed.metadata.tags,
      relatedFiles: parsed.metadata.relatedFiles,
      relatedPages: parsed.metadata.relatedPages,
      sources,
      scope: parsed.metadata.scope
    },
    root
  );

  return {
    record,
    inferredScope: parsed.metadata.scope,
    importedFromUri
  };
}

function buildDefaultFilename(record: ProjectMemoryRecord): string {
  const slug = record.summary
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'skill';
  return path.join('local-data', 'skill-exports', `${slug}.skill.md`);
}

function buildExportMarkdown(record: ProjectMemoryRecord, exportedAt: string, exportedFrom: string): string {
  const frontmatter = [
    '---',
    'kind: skill',
    `summary: ${escapeFrontmatterValue(record.summary)}`,
    `exportedFrom: ${exportedFrom}`,
    `exportedAt: ${exportedAt}`,
    `exportSchemaVersion: ${exportSchemaVersion}`,
    `originalRecallCount: ${record.recallCount}`,
    '---'
  ].join('\n');

  const metadata = {
    scope: record.scope,
    tags: record.tags,
    relatedFiles: record.relatedFiles,
    relatedPages: record.relatedPages,
    sources: record.sources.map((source) => `${source.kind}:${source.slug}`)
  };

  return [
    frontmatter,
    '',
    `# ${record.summary}`,
    '',
    record.text.trim(),
    '',
    '## Skill Metadata',
    '',
    'The fenced JSON block below carries the structured metadata. Do not edit by hand unless you understand the schema; `dendrite-wiki skill:import` parses this block.',
    '',
    '```json',
    JSON.stringify(metadata, null, 2),
    '```',
    ''
  ].join('\n');
}

interface ParsedExportBundle {
  kind: string;
  body: string;
  metadata: {
    scope?: ProjectMemoryScope;
    tags: string[];
    relatedFiles: string[];
    relatedPages: string[];
    sources: string[];
  };
}

function parseExportMarkdown(markdown: string): ParsedExportBundle {
  const frontmatterMatch = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    throw new SkillPortabilityError(
      'BUNDLE_MISSING_FRONTMATTER',
      'Bundle is missing a leading YAML frontmatter block. Skill bundles always start with `---`.'
    );
  }
  const frontmatter = frontmatterMatch[1];
  const remainder = frontmatterMatch[2];
  const fields = new Map(
    frontmatter
      .split(/\r?\n/)
      .map((line) => line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*?)\s*$/))
      .filter((match): match is RegExpMatchArray => Boolean(match))
      .map((match) => [match[1], match[2].replace(/^['"]|['"]$/g, '')])
  );

  const kind = fields.get('kind') ?? '';

  const jsonBlockMatch = remainder.match(/```json\s*\r?\n([\s\S]*?)\r?\n```/);
  if (!jsonBlockMatch) {
    throw new SkillPortabilityError(
      'BUNDLE_MISSING_JSON_BLOCK',
      'Bundle body is missing the structured metadata JSON block (```json ... ```).'
    );
  }
  let metadataJson: unknown;
  try {
    metadataJson = JSON.parse(jsonBlockMatch[1]);
  } catch {
    throw new SkillPortabilityError(
      'BUNDLE_INVALID_JSON',
      'Bundle JSON block is not valid JSON.'
    );
  }
  if (!metadataJson || typeof metadataJson !== 'object') {
    throw new SkillPortabilityError(
      'BUNDLE_INVALID_METADATA',
      'Bundle JSON block did not parse to an object.'
    );
  }

  const candidate = metadataJson as Record<string, unknown>;
  const metadata = {
    scope: parseScope(candidate.scope),
    tags: arrayOfStrings(candidate.tags),
    relatedFiles: arrayOfStrings(candidate.relatedFiles),
    relatedPages: arrayOfStrings(candidate.relatedPages),
    sources: arrayOfStrings(candidate.sources)
  };

  // Strip the JSON metadata block and the H1 (which echoes summary) from the body
  // so the imported skill text is just the human-readable content.
  const withoutJsonBlock = remainder.replace(/```json\s*\r?\n[\s\S]*?\r?\n```\s*\r?\n?/, '');
  const withoutMetadataHeading = withoutJsonBlock.replace(/##\s+Skill Metadata\s*\r?\n[\s\S]*$/, '');
  const withoutPreamble = withoutMetadataHeading.replace(/^The fenced JSON block.*$/m, '');
  const withoutH1 = withoutPreamble.replace(/^#\s+.+\r?\n+/, '');
  const body = withoutH1.trim();

  return {
    kind,
    body,
    metadata
  };
}

function parseScope(raw: unknown): ProjectMemoryScope | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const candidate = raw as Record<string, unknown>;
  return {
    filePatterns: arrayOfStrings(candidate.filePatterns),
    frameworks: arrayOfStrings(candidate.frameworks),
    languages: arrayOfStrings(candidate.languages),
    taskKeywords: arrayOfStrings(candidate.taskKeywords),
    matchMode: candidate.matchMode === 'all' ? 'all' : 'any'
  };
}

function arrayOfStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function escapeFrontmatterValue(value: string): string {
  // Quote the value if it contains special YAML chars; otherwise leave bare.
  if (/[:#"'\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '\\"')}"`;
  }
  return value;
}
