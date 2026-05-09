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
      return lines.slice(i).join('\n').trim();
    }
  }

  // No keyword found anywhere — return the body as-is and let the
  // validator reject it with a clear error.
  return body;
}
