/**
 * Per-chart-kind prompt templates for Mermaid diagram synthesis.
 *
 * M4 of the AI-mermaid-charts roadmap. The operator-side modal in M5 will
 * call `POST /__review-bridge/synthesize/chart`, which calls a local
 * Ollama model with a prompt built from these templates plus the
 * surrounding page content. The model returns Mermaid source which the
 * heuristic validator in `chart-insert.ts` accepts or rejects.
 *
 * Design notes:
 *   - Each template is small. Local models (especially 3B–8B) have short
 *     effective context windows in practice; long preambles hurt output
 *     quality and increase latency. Each prompt is ~200 tokens of
 *     instructions + the page content.
 *   - Each template includes ONE concrete example of valid Mermaid for
 *     that kind. Few-shot prompting works well for diagram syntax.
 *   - Each template ends with an explicit "Output ONLY the Mermaid
 *     source. Do not wrap in code fences. Do not explain." instruction.
 *     We still tolerate fences in the response (the parser strips them)
 *     but telling the model not to produce them gives cleaner output.
 *   - The "context" provided to the model is intentionally just the
 *     section the operator's cursor is in, not the whole page. Local
 *     models do better with focused input — the modal in M5 enforces
 *     this by default.
 */

export type ChartPromptKind = 'flowchart' | 'sequence' | 'state' | 'class' | 'er' | 'gantt';

export interface ChartPromptInput {
  kind: ChartPromptKind;
  /**
   * The text the diagram should illustrate. Typically the section the
   * operator's cursor is in, but the modal also lets the operator pass
   * a free-form prompt instead.
   */
  context: string;
  /**
   * Optional one-line caption / title the diagram should illustrate.
   * Helps the model focus when the surrounding context is broad.
   */
  intent?: string;
}

export function buildChartPrompt(input: ChartPromptInput): string {
  const template = TEMPLATES[input.kind];
  const intentLine = input.intent?.trim()
    ? `What the diagram should illustrate: ${input.intent.trim()}\n\n`
    : '';
  return `${template.instructions}

${intentLine}Source content to draw from:
"""
${input.context.trim()}
"""

Output ONLY the Mermaid source. Do not wrap in code fences. Do not explain. Begin with "${template.firstWord}".`;
}

interface PromptTemplate {
  instructions: string;
  /** The first word the model should emit — lets us tell it where to start. */
  firstWord: string;
}

// Each template's `instructions` field is a short paragraph + one valid
// example. The example is what makes the difference between "model knows
// the syntax abstractly" and "model produces correct output." Keep
// examples minimal — 4-6 nodes/edges max — so the model focuses on
// SHAPE rather than imitating example content.
const TEMPLATES: Record<ChartPromptKind, PromptTemplate> = {
  flowchart: {
    firstWord: 'flowchart',
    instructions: `You produce Mermaid flowchart diagrams. A flowchart shows steps and decisions in a process. Use the source content below to identify the steps and the order they happen in. Use [rectangles] for steps and {curly braces} for yes/no decisions. Label arrows with the condition or action that triggers them.

CRITICAL FORMATTING RULES:
- Put the header ("flowchart TD" or "flowchart LR") on its OWN LINE.
- Put EACH node and EACH edge on its OWN LINE.
- Do NOT use semicolons (;) to separate statements. Mermaid requires NEWLINES.
- Indent each statement two spaces under the header.

Example of valid Mermaid flowchart syntax:

flowchart TD
  A[Read request] --> B{Cache hit?}
  B -->|yes| C[Return cached]
  B -->|no| D[Fetch from DB]
  D --> E[Update cache]
  E --> C`
  },
  sequence: {
    firstWord: 'sequenceDiagram',
    instructions: `You produce Mermaid sequence diagrams. A sequence diagram shows messages flowing between participants over time, top to bottom. Use the source content below to identify the actors and the messages they send. Use --> for synchronous calls, -->> for responses, and -.- for asynchronous notifications.

Example of valid Mermaid sequenceDiagram syntax:

sequenceDiagram
  participant Client
  participant API
  participant DB
  Client->>API: POST /save
  API->>DB: INSERT
  DB-->>API: ok
  API-->>Client: 200 OK`
  },
  state: {
    firstWord: 'stateDiagram-v2',
    instructions: `You produce Mermaid state diagrams. A state diagram shows the lifecycle of a single entity — what states it can be in and what transitions move it between them. Use [*] for the initial and final pseudo-states. Label transitions with the event or condition that triggers them.

Example of valid Mermaid stateDiagram-v2 syntax:

stateDiagram-v2
  [*] --> Idle
  Idle --> Running : start
  Running --> Paused : pause
  Paused --> Running : resume
  Running --> [*] : finish`
  },
  class: {
    firstWord: 'classDiagram',
    instructions: `You produce Mermaid class diagrams. A class diagram shows the structure of a domain — classes (or types), their fields and methods, and the relationships between them. Use the source content below to identify the entities and their relationships.

Example of valid Mermaid classDiagram syntax:

classDiagram
  class Order {
    +String id
    +Date createdAt
    +submit()
  }
  class Customer {
    +String email
    +place(Order)
  }
  Customer "1" --> "*" Order : places`
  },
  er: {
    firstWord: 'erDiagram',
    instructions: `You produce Mermaid entity-relationship diagrams. An ER diagram shows database entities (tables/collections), their fields, and the relationships between them. Use the source content below to identify the entities and how they connect.

Example of valid Mermaid erDiagram syntax:

erDiagram
  USER ||--o{ ORDER : places
  ORDER ||--|{ LINE_ITEM : contains
  USER {
    string id PK
    string email
  }
  ORDER {
    string id PK
    string user_id FK
    date created_at
  }`
  },
  gantt: {
    firstWord: 'gantt',
    instructions: `You produce Mermaid gantt charts. A gantt chart shows tasks scheduled over time. Use the source content below to identify the tasks, their durations, and any dependencies. Group related tasks under "section" headers.

Example of valid Mermaid gantt syntax:

gantt
  title Project plan
  dateFormat YYYY-MM-DD
  section Design
  Wireframes      :a1, 2026-01-01, 5d
  Visual design   :a2, after a1, 7d
  section Build
  Backend         :b1, 2026-01-08, 14d
  Frontend        :b2, after a2, 12d`
  }
};

/**
 * Strip Mermaid code fences from a model response if present. Models
 * sometimes wrap their output in ```mermaid ... ``` despite being told not
 * to; we accept both shapes. Also trims any prose before the diagram-type
 * keyword (e.g., "Here's the diagram:\n\nflowchart TD..." → "flowchart TD...").
 *
 * Final pass: `normalizeMermaidLayout` repairs the common small-model
 * failure mode of producing the entire diagram on a single line with `;`
 * as statement separator (which Mermaid does NOT accept — it requires
 * newlines). Without this, gemma3:4b / phi3:mini / similar sub-8B models
 * regularly produce output the renderer rejects with "Expecting NEWLINE,
 * got NODE_STRING".
 */
export function parseChartResponse(text: string): string {
  let body = text.trim();

  // Strip an outer code fence if present.
  const fenceMatch = body.match(/^```(?:mermaid)?\r?\n([\s\S]*?)\r?\n```$/);
  if (fenceMatch) {
    body = fenceMatch[1].trim();
  }

  // If the model added a preamble, find the first line that looks like a
  // diagram-type keyword and trim everything before it. Same keyword list
  // as chart-insert.ts's validator, kept in sync intentionally.
  const KEYWORDS = [
    'flowchart', 'graph',
    'sequenceDiagram',
    'stateDiagram-v2', 'stateDiagram',
    'classDiagram',
    'erDiagram',
    'gantt', 'pie', 'journey',
    'gitGraph',
    'mindmap', 'timeline',
    'quadrantChart',
    'xychart-beta', 'sankey-beta',
    'requirementDiagram'
  ];
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (KEYWORDS.some((k) => new RegExp(`^${k.replace('-', '\\-')}\\b`, 'i').test(trimmed))) {
      body = lines.slice(i).join('\n').trim();
      return normalizeMermaidLayout(body);
    }
  }

  // No keyword found anywhere — return the body as-is (still normalize, in
  // case the keyword was on the same line as the rest) and let the
  // validator reject it with a clear error if the normalize can't help.
  return normalizeMermaidLayout(body);
}

/**
 * Repair the "all on one line, semicolons as separators" failure mode.
 *
 * Mermaid's flowchart/graph/sequence/state/class/er parsers ALL require a
 * newline after the header keyword and between every subsequent statement.
 * Semicolons inside `[label]` brackets are fine; semicolons OUTSIDE
 * brackets that the model is using as statement separators are not.
 *
 * Detection: the source is "compact" (≤2 newlines) AND contains at least
 * one top-level semicolon. When detected, we split on top-level semicolons
 * (skipping ones inside `[...]`, `(...)`, `{...}`, or quotes), trim each
 * part, and emit them as separate indented lines below the header.
 *
 * If the source is already multi-line, this is a no-op — we don't want to
 * accidentally rewrite hand-authored Mermaid that legitimately uses
 * semicolons inside node labels.
 */
export function normalizeMermaidLayout(source: string): string {
  const trimmed = source.trim();
  const lines = trimmed.split(/\r?\n/);

  // Match the diagram header. If we can't recognize one, we have no anchor
  // for normalization — leave the source alone and let the validator
  // produce a clear error.
  const headerMatch = trimmed.match(/^(flowchart|graph|sequenceDiagram|stateDiagram(?:-v2)?|classDiagram|erDiagram|gantt|pie|journey|gitGraph|mindmap|timeline|quadrantChart|xychart-beta|sankey-beta|requirementDiagram)\b\s*([A-Z]{1,4})?\s*/i);
  if (!headerMatch) return trimmed;
  const header = headerMatch[0].trim();
  const body = trimmed.slice(headerMatch[0].length).trim();
  if (body.length === 0) return header;

  // Process the body line by line so a multi-line input where each line
  // already has just one statement passes through unchanged, while a line
  // (possibly the only line) that has MULTIPLE statements glued together
  // gets split into separate statements.
  //
  // The header may have been on its own line OR fused with the first body
  // line. Either way, `body` is now everything after the header, joined as
  // a single string. Re-split it on existing newlines so each pre-existing
  // line is processed for in-line statement gluing independently.
  const bodyLines = body.split(/\r?\n/);
  const statements: string[] = [];
  for (const line of bodyLines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;
    // Each line: split on top-level semicolons first, then split each
    // resulting chunk on adjacent-statement-without-separator boundaries.
    const semiParts = splitOnTopLevelSemicolons(trimmedLine);
    for (const part of semiParts) {
      const trimmedPart = part.trim();
      if (!trimmedPart) continue;
      const adjacencyParts = splitOnAdjacentStatements(trimmedPart);
      for (const stmt of adjacencyParts) {
        const trimmedStmt = stmt.trim();
        if (trimmedStmt) statements.push(trimmedStmt);
      }
    }
  }

  if (statements.length === 0) return header;

  // Skip normalization entirely when nothing changed — this preserves
  // exact whitespace for already-well-formed input. We compare against the
  // (header on own line + each body line indented) shape we'd emit.
  const emitted = [header, ...statements.map((s) => `  ${s}`)].join('\n');
  return emitted;
}

/**
 * Split a single body line on adjacent-statement boundaries. The failure
 * mode this catches: a small model emits multiple statements glued together
 * with whitespace instead of newlines, like `A[X] --> B[Y] B --> C[Z]`.
 *
 * The pattern: a closing bracket of a node label (`]`, `}`, `)`) followed
 * by whitespace followed by an identifier that itself is followed by a
 * node-shape opener (`[`, `{`, `(`) OR a Mermaid arrow operator. That
 * identifier is the start of a NEW statement and the previous closing
 * bracket was the end of the prior one.
 *
 * Identifiers that are followed by neither a bracket nor an arrow are
 * treated as continuations (e.g., `A --> B` where `B` is just the
 * destination of the arrow — no further statement after it).
 */
function splitOnAdjacentStatements(source: string): string[] {
  const statements: string[] = [];
  let current = '';
  let depth = 0;
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    current += ch;

    if (inQuote) {
      if (ch === inQuote && source[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; continue; }
    if (ch === '[' || ch === '(' || ch === '{') { depth++; continue; }
    if (ch === ']' || ch === ')' || ch === '}') {
      depth--;
      if (depth !== 0) continue;
      // Top-level bracket just closed. Look ahead: leading whitespace +
      // identifier + (another bracket OR an arrow OR a pipe). The
      // identifier is the start of a NEW statement; the closing bracket
      // marked the end of the previous one. Capture the leading
      // whitespace explicitly so we advance `i` past JUST the separator
      // and not the identifier itself (the identifier needs to be
      // emitted by the next loop iteration into the new statement).
      const remainder = source.slice(i + 1);
      const m = remainder.match(
        /^(\s+)[A-Za-z_][A-Za-z0-9_]*\s*(?=[\[\{\(]|--?>|---|-\.\-?>|==>|->>|--?>>|<--|\|)/
      );
      if (m) {
        statements.push(current);
        current = '';
        i += m[1].length;
      }
    }
  }
  if (current.length > 0) statements.push(current);
  return statements;
}

function countTopLevelSemicolons(source: string): number {
  let count = 0;
  let depth = 0;
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuote) {
      if (ch === inQuote && source[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; continue; }
    if (ch === '[' || ch === '(' || ch === '{') depth++;
    else if (ch === ']' || ch === ')' || ch === '}') depth--;
    else if (ch === ';' && depth === 0) count++;
  }
  return count;
}

function splitOnTopLevelSemicolons(source: string): string[] {
  const parts: string[] = [];
  let buffer = '';
  let depth = 0;
  let inQuote: '"' | "'" | null = null;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (inQuote) {
      buffer += ch;
      if (ch === inQuote && source[i - 1] !== '\\') inQuote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { inQuote = ch; buffer += ch; continue; }
    if (ch === '[' || ch === '(' || ch === '{') { depth++; buffer += ch; continue; }
    if (ch === ']' || ch === ')' || ch === '}') { depth--; buffer += ch; continue; }
    if (ch === ';' && depth === 0) {
      parts.push(buffer);
      buffer = '';
      continue;
    }
    buffer += ch;
  }
  if (buffer.length > 0) parts.push(buffer);
  return parts;
}
