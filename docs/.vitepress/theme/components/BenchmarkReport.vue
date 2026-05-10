<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface DendriteBenchmarkSnapshot {
  timestamp: string;
  label: string;
  git: {
    commit: string;
    branch: string;
    dirty: boolean;
  };
  metrics: {
    pageCount: number;
    metadataCoverage: number;
    claimCount: number;
    staleClaimCount: number;
    lintFindingCount: number;
    proposalCount: number;
    guidanceCount: number;
    activeGuidanceCount: number;
    graphNodeCount: number;
    graphEdgeCount: number;
    contextPageCount: number;
    contextOmittedPageCount: number;
  };
  context: {
    selectedSlugs: string[];
    omittedSlugs: string[];
    openQuestionCount: number;
  };
  recall?: {
    probesSource: 'auto-derived' | 'local-file';
    probesPath: string | null;
    probeCount: number;
    evaluatedProbeCount: number;
    top1HitCount: number;
    top5HitCount: number;
    missCount: number;
    meanReciprocalRank: number;
    averageReasonCount: number;
    shadowBipartiteSeenProbeCount?: number;
    shadowBipartiteAverageBonus?: number;
    shadowBipartitePotentialRankChangeCount?: number;
    shadowSemanticSeenProbeCount?: number;
    shadowSemanticAverageCosine?: number;
    shadowSemanticAverageTopCosine?: number;
  };
}

interface DendriteBenchmarkHistoryArtifact {
  schemaVersion: 1;
  generatedAt: string;
  latest: DendriteBenchmarkSnapshot;
  snapshots: DendriteBenchmarkSnapshot[];
}

interface DendriteBenchmarkEventSummary {
  schemaVersion: 1;
  generatedAt: string;
  eventCount: number;
  logPath: string;
  usage: {
    sessionStartedCount: number;
    contextRequestCount: number;
    wikiUpdateCount: number;
    maintenanceStateChangeCount: number;
    sessionSnapshotCount: number;
  };
  orientation: {
    latestContextPageCount: number | null;
    latestContextOmittedPageCount: number | null;
    latestOpenQuestionCount: number | null;
  };
  maintenance: {
    acceptedProposalCount: number;
    latestLintFindingCount: number | null;
    latestProposalCount: number | null;
  };
  recentEvents: Array<{
    timestamp: string;
    event: string;
    trigger: string;
  }>;
}

interface TrendMetric {
  key: string;
  label: string;
  tone: 'improve-up' | 'improve-down' | 'neutral';
  format?: 'percent';
  description: string;
}

const artifact = ref<DendriteBenchmarkHistoryArtifact | null>(null);
const eventSummary = ref<DendriteBenchmarkEventSummary | null>(null);
const loadError = ref('');

const snapshots = computed(() => artifact.value?.snapshots ?? []);
const baseline = computed(() => snapshots.value[0] ?? null);
const latest = computed(() => artifact.value?.latest ?? snapshots.value.at(-1) ?? null);

const summary = computed(() => {
  const first = baseline.value;
  const last = latest.value;
  if (!first || !last) {
    return 'Capture at least one benchmark snapshot to generate a local report.';
  }

  const baselineDebt = first.metrics.lintFindingCount + first.metrics.proposalCount + first.metrics.staleClaimCount;
  const latestDebt = last.metrics.lintFindingCount + last.metrics.proposalCount + last.metrics.staleClaimCount;
  const coverageDelta = last.metrics.metadataCoverage - first.metrics.metadataCoverage;
  const omittedDelta = first.metrics.contextOmittedPageCount - last.metrics.contextOmittedPageCount;

  if (latestDebt < baselineDebt || coverageDelta > 0 || omittedDelta > 0) {
    return 'The wiki is healthier than the baseline: documentation debt dropped or orientation got tighter.';
  }

  if (latestDebt > baselineDebt || coverageDelta < 0 || omittedDelta < 0) {
    return 'Maintenance debt increased versus the baseline. Review stale claims, lint findings, and omitted context pages.';
  }

  return 'The wiki is stable versus the baseline. Capture more snapshots after meaningful sessions to reveal a stronger trend.';
});

const statusTone = computed(() => {
  const first = baseline.value;
  const last = latest.value;
  if (!first || !last) {
    return 'steady';
  }

  const baselineDebt = first.metrics.lintFindingCount + first.metrics.proposalCount + first.metrics.staleClaimCount;
  const latestDebt = last.metrics.lintFindingCount + last.metrics.proposalCount + last.metrics.staleClaimCount;
  if (latestDebt < baselineDebt || last.metrics.metadataCoverage > first.metrics.metadataCoverage) {
    return 'improving';
  }
  if (latestDebt > baselineDebt || last.metrics.metadataCoverage < first.metrics.metadataCoverage) {
    return 'warning';
  }
  return 'steady';
});

const headlineMetrics = computed(() => {
  const first = baseline.value;
  const last = latest.value;
  if (!last) {
    return [];
  }

  const baselineDebt = first ? first.metrics.lintFindingCount + first.metrics.proposalCount + first.metrics.staleClaimCount : 0;
  const latestDebt = last.metrics.lintFindingCount + last.metrics.proposalCount + last.metrics.staleClaimCount;

  return [
    buildHeadlineMetric('Snapshots', snapshots.value.length, null),
    buildHeadlineMetric('Pages', last.metrics.pageCount, first ? last.metrics.pageCount - first.metrics.pageCount : null),
    buildHeadlineMetric(
      'Metadata Coverage',
      formatPercent(last.metrics.metadataCoverage),
      first ? formatSignedPercent(last.metrics.metadataCoverage - first.metrics.metadataCoverage) : null
    ),
    buildHeadlineMetric('Doc Debt', latestDebt, first ? baselineDebt - latestDebt : null)
  ];
});

const orientationMetrics: TrendMetric[] = [
  {
    key: 'contextPageCount',
    label: 'Context pages',
    tone: 'neutral',
    description: 'How many pages wiki_context selected for the briefing it returns to the agent. Neither higher nor lower is automatically good — it tracks how much fits the budget.'
  },
  {
    key: 'contextOmittedPageCount',
    label: 'Omitted pages',
    tone: 'improve-down',
    description: 'Pages that ranked but were cut by the page budget. Lower is better — fewer omissions means the briefing is more comprehensive.'
  },
  {
    key: 'openQuestionCount',
    label: 'Open questions',
    tone: 'improve-down',
    description: 'Open questions tracked across active handoffs. Lower is better — answered questions sharpen direction.'
  }
];

const wikiHealthMetrics: TrendMetric[] = [
  {
    key: 'metadataCoverage',
    label: 'Metadata coverage',
    tone: 'improve-up',
    format: 'percent',
    description: 'Share of pages that declare frontmatter (status, owner, related). Higher is better — closer to 100% means the wiki is more navigable.'
  },
  {
    key: 'claimCount',
    label: 'Claims',
    tone: 'improve-up',
    description: 'Source-backed claims registered across pages. Higher is better — claims are how the wiki stays evidence-linked.'
  },
  {
    key: 'staleClaimCount',
    label: 'Stale claims',
    tone: 'improve-down',
    description: 'Claims whose source files have changed since the claim was recorded. Lower is better — stale claims need review.'
  },
  {
    key: 'lintFindingCount',
    label: 'Lint findings',
    tone: 'improve-down',
    description: 'Lint rule violations across all pages (drift, missing summaries, broken links, etc.). Lower is better.'
  },
  {
    key: 'proposalCount',
    label: 'Proposals',
    tone: 'improve-down',
    description: 'Pending change proposals waiting for review. Lower is better — proposals applied or dismissed clear the queue.'
  },
  {
    key: 'graphEdgeCount',
    label: 'Graph edges',
    tone: 'improve-up',
    description: 'Cross-page links across the wiki graph. Higher is better — more edges means better navigation between related pages.'
  },
  {
    key: 'activeGuidanceCount',
    label: 'Active guidance',
    tone: 'improve-up',
    description: 'Active guidance files (CLAUDE.md, AGENTS.md, prompts, instructions). Higher is better — more guidance helps agents stay aligned.'
  }
];

const recallMetrics: TrendMetric[] = [
  {
    key: 'recall.top1HitCount',
    label: 'Top-1 hits',
    tone: 'improve-up',
    description: 'Probes whose expected memory ranked #1 in recall. Higher is better — perfect retrieval. A probe is a saved query with an expected match (e.g., a tag or page slug).'
  },
  {
    key: 'recall.top5HitCount',
    label: 'Top-5 hits',
    tone: 'improve-up',
    description: 'Probes whose expected memory ranked in the top 5 results. Higher is better — the operator sees the right memory without scrolling.'
  },
  {
    key: 'recall.missCount',
    label: 'Misses',
    tone: 'improve-down',
    description: 'Probes whose expected memory was not returned in the top 5 (or not returned at all). Lower is better.'
  },
  {
    key: 'recall.meanReciprocalRank',
    label: 'Mean reciprocal rank',
    tone: 'improve-up',
    format: 'percent',
    description: 'Average of 1 / rank across all probes (rendered as a percentage). 100% = every expected memory ranked first. 50% = ranked second on average. 0% = none returned. Higher is better.'
  },
  {
    key: 'recall.averageReasonCount',
    label: 'Avg ranking reasons',
    tone: 'improve-up',
    description: 'Average count of human-readable reasons attached to each ranked memory ("matched tag X", "co-occurred with page Y"). Higher is better — explainable rankings build operator trust.'
  }
];

const headlineMetricInfo: Record<string, string> = {
  Snapshots: 'Total benchmark snapshots captured. Each snapshot is a point-in-time measurement of wiki health, orientation, and recall — captured at session-start and session-end.',
  Pages: 'Markdown pages currently in the wiki at docs/wiki/. Includes living pages and generated API references.',
  'Metadata Coverage': 'Share of pages that declare frontmatter (status, owner, related). Higher is better — closer to 100% means pages are easier to triage and navigate.',
  'Doc Debt': 'Lint findings + open proposals + stale claims, summed. Lower is better — a small number means the wiki is in sync with the code and reviewed work is cleared.'
};

const recallStripInfo: Record<string, string> = {
  'Probes evaluated': 'Recall probes that ran in this snapshot. A probe is a saved query with an expected memory match (by id, tags, related files, or related pages); the runner checks whether recall ranks the expected memory in the top results.',
  'Top-1 hits': 'Probes whose expected memory ranked #1 in recall. Higher is better.',
  'Top-5 hits': 'Probes whose expected memory ranked in the top 5. Higher is better.',
  Misses: 'Probes whose expected memory was not in the top 5 (or not returned at all). Lower is better.'
};

const maintenanceStripInfo: Record<string, string> = {
  'Context requests': 'Times wiki_context was called locally. Tracks how often the agent asked for a briefing.',
  'Wiki updates': 'Times wiki_write or wiki_log fired. Tracks how often the agent kept docs current during sessions.',
  'State captures': 'Maintenance state changes recorded (proposals applied, items archived, snoozed, etc.). Tracks operator review activity.',
  'Proposals accepted': 'Cumulative accepted proposal applies across the local event log. Higher means the operator is consistently clearing the inbox.',
  'Lint findings': 'Latest lint findings count from the maintenance pipeline (matches the Wiki Health row above).',
  'Active proposals': 'Latest proposal count from the maintenance pipeline (matches the Wiki Health row above).'
};

const latestSelectedPages = computed(() => latest.value?.context.selectedSlugs ?? []);
const latestOmittedPages = computed(() => latest.value?.context.omittedSlugs ?? []);
const recentBenchmarkEvents = computed(() => eventSummary.value?.recentEvents.slice().reverse().slice(0, 4) ?? []);

const latestRecall = computed(() => latest.value?.recall ?? null);
const hasRecallHistory = computed(() => snapshots.value.some((snapshot) => snapshot.recall !== undefined));
const hasEvaluatedRecallProbes = computed(() => (latestRecall.value?.evaluatedProbeCount ?? 0) > 0);
const hasShadowSemanticData = computed(() => (latestRecall.value?.shadowSemanticSeenProbeCount ?? 0) > 0);

function formatCosine(value: number | undefined): string {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return '—';
  }
  return value.toFixed(3);
}

const recallSourceLabel = computed(() => {
  const recall = latestRecall.value;
  if (!recall) {
    return 'Recall block not present in the latest snapshot.';
  }
  if (recall.probesSource === 'local-file') {
    return `Probes loaded from ${recall.probesPath ?? 'local-data/recall-probes.json'}`;
  }
  return 'Probes auto-derived from active project-local memories.';
});

const shortCommit = computed(() => {
  const commit = latest.value?.git.commit;
  if (!commit) {
    return 'unknown';
  }
  return commit.length > 8 ? commit.slice(0, 8) : commit;
});

const statusLabel = computed(() => {
  switch (statusTone.value) {
    case 'improving':
      return 'Improving';
    case 'warning':
      return 'Regressing';
    default:
      return 'Steady';
  }
});

onMounted(async () => {
  try {
    const cacheBust = Date.now();
    const response = await fetch(`/dendrite-benchmark-history.json?t=${cacheBust}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    artifact.value = (await response.json()) as DendriteBenchmarkHistoryArtifact;

    const eventResponse = await fetch(`/dendrite-benchmark-events-summary.json?t=${cacheBust}`);
    if (eventResponse.ok) {
      eventSummary.value = (await eventResponse.json()) as DendriteBenchmarkEventSummary;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load benchmark history artifact.';
  }
});

function buildHeadlineMetric(label: string, value: number | string, delta: number | string | null) {
  let deltaText = 'Baseline pending';
  let deltaTone = 'steady';

  if (typeof delta === 'number') {
    if (delta > 0) {
      deltaText = `+${delta}`;
      deltaTone = 'improving';
    } else if (delta < 0) {
      deltaText = `${delta}`;
      deltaTone = 'warning';
    } else {
      deltaText = 'No change';
    }
  } else if (typeof delta === 'string') {
    if (delta.startsWith('+')) {
      deltaTone = 'improving';
    } else if (delta.startsWith('-')) {
      deltaTone = 'warning';
    }
    deltaText = delta === '+0%' ? 'No change' : delta;
  }

  return { label, value, deltaText, deltaTone };
}

function getMetricValue(snapshot: DendriteBenchmarkSnapshot, key: string): number {
  if (key.startsWith('recall.')) {
    const field = key.slice('recall.'.length) as keyof NonNullable<DendriteBenchmarkSnapshot['recall']>;
    const recall = snapshot.recall;
    if (!recall || !(field in recall)) {
      return 0;
    }
    const value = recall[field];
    return typeof value === 'number' ? value : 0;
  }
  if (key in snapshot.metrics) {
    return snapshot.metrics[key as keyof DendriteBenchmarkSnapshot['metrics']];
  }
  if (key in snapshot.context) {
    return snapshot.context[key as keyof DendriteBenchmarkSnapshot['context']] as number;
  }
  return 0;
}

function formatMetric(snapshot: DendriteBenchmarkSnapshot, metric: TrendMetric): string {
  const value = getMetricValue(snapshot, metric.key);
  return metric.format === 'percent' ? formatPercent(value) : String(value);
}

function metricDelta(metric: TrendMetric): string {
  const first = baseline.value;
  const last = latest.value;
  if (!first || !last) {
    return 'Baseline pending';
  }

  const delta = getMetricValue(last, metric.key) - getMetricValue(first, metric.key);
  if (metric.format === 'percent') {
    return formatSignedPercent(delta);
  }
  if (delta === 0) {
    return 'No change';
  }
  return `${delta > 0 ? '+' : ''}${delta}`;
}

function metricTone(metric: TrendMetric): string {
  const first = baseline.value;
  const last = latest.value;
  if (!first || !last) {
    return 'steady';
  }

  const delta = getMetricValue(last, metric.key) - getMetricValue(first, metric.key);
  if (delta === 0) {
    return 'steady';
  }
  if (metric.tone === 'neutral' || metric.tone === 'improve-up') {
    return delta > 0 ? 'improving' : 'warning';
  }
  return delta < 0 ? 'improving' : 'warning';
}

function trendPath(metric: TrendMetric, height = 48): string {
  const padTop = 4;
  const padBottom = 4;
  const baseline = height - padBottom;
  const usable = height - padTop - padBottom;
  const series = snapshots.value.map((snapshot) => getMetricValue(snapshot, metric.key));
  if (series.length <= 1) {
    const mid = padTop + usable / 2;
    return `4,${mid} 116,${mid}`;
  }

  const max = Math.max(...series);
  const min = Math.min(...series);
  const spread = max - min || 1;

  return series
    .map((value, index) => {
      const x = 4 + (112 * index) / Math.max(series.length - 1, 1);
      const y = baseline - ((value - min) / spread) * usable;
      return `${x},${y}`;
    })
    .join(' ');
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatSignedPercent(value: number): string {
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function formatTimestamp(timestamp: string): string {
  if (!timestamp) {
    return 'Not captured yet';
  }
  return new Date(timestamp).toLocaleString();
}

function formatNullableMetric(value: number | null): string {
  return value === null ? 'Pending' : String(value);
}

function toneDirectionText(metric: TrendMetric): string {
  if (metric.tone === 'improve-up') {
    return 'Direction: higher is better.';
  }
  if (metric.tone === 'improve-down') {
    return 'Direction: lower is better.';
  }
  return 'Direction: neither up nor down is automatically good.';
}

function metricSeriesText(metric: TrendMetric): string {
  const series = snapshots.value.map((snapshot) => formatMetric(snapshot, metric));
  if (series.length === 0) {
    return '';
  }
  if (series.length === 1) {
    return `Only one snapshot so far (${series[0]}).`;
  }
  const display = series.length > 8 ? [series[0], '…', ...series.slice(-6)] : series;
  return `History: ${display.join(' → ')}`;
}

function metricTooltip(metric: TrendMetric): string {
  const lines = [
    `${metric.label} — ${metric.description}`,
    toneDirectionText(metric)
  ];
  const series = metricSeriesText(metric);
  if (series) {
    lines.push(series);
  }
  const delta = metricDelta(metric);
  if (delta && delta !== 'Baseline pending') {
    lines.push(`Δ vs. baseline: ${delta}`);
  }
  return lines.join('\n');
}

function headlineTooltip(label: string, value: number | string, deltaText: string): string {
  const description = headlineMetricInfo[label] ?? '';
  const lines = [`${label} — ${description}`, `Latest: ${value}.`];
  if (deltaText && deltaText !== 'Baseline pending') {
    lines.push(`Δ vs. baseline: ${deltaText}`);
  }
  return lines.join('\n');
}

function stripCellTooltip(table: Record<string, string>, label: string, value: number | string): string {
  const description = table[label] ?? '';
  return `${label} — ${description}\nLatest: ${value}.`;
}
</script>

<template>
  <div class="bm-report">
    <div v-if="loadError" class="bm-callout bm-callout--error" role="alert">
      <p class="bm-callout-title">Benchmark artifact failed to load</p>
      <p class="bm-callout-detail">{{ loadError }}</p>
      <p class="bm-callout-detail">Run <code>dendrite-wiki benchmark:snapshot --label session-end</code> to generate the local history artifact.</p>
    </div>

    <div v-else-if="!artifact || snapshots.length === 0" class="bm-empty">
      <p class="bm-eyebrow">Benchmark</p>
      <h2 class="bm-empty-title">No snapshots yet</h2>
      <p class="bm-empty-detail">Run <code>dendrite-wiki benchmark:snapshot --label baseline</code> after a meaningful session to create the first local benchmark history artifact.</p>
    </div>

    <template v-else>
      <header class="bm-hero" :data-tone="statusTone">
        <div class="bm-hero-tape" aria-hidden="true">
          <span class="bm-hero-tape-stripes" />
          <span class="bm-hero-tape-label">Benchmark</span>
        </div>
        <div class="bm-hero-top">
          <div class="bm-hero-block">
            <h1 class="bm-hero-title">Local<span class="bm-hero-title-emph">Benchmark</span></h1>
            <p class="bm-hero-tagline">{{ summary }}</p>
          </div>
          <div class="bm-hero-status">
            <span class="bm-pill" :title="`Git branch the latest snapshot was captured on.\nLatest: ${latest?.git.branch ?? 'unknown'}`"><span class="bm-pill-label">Branch</span>{{ latest?.git.branch ?? 'unknown' }}</span>
            <span class="bm-pill" :title="`Commit hash the latest snapshot was captured at${latest?.git.dirty ? ' (working tree was dirty)' : ''}.\nFull: ${latest?.git.commit ?? 'unknown'}`"><span class="bm-pill-label">Commit</span><code>{{ shortCommit }}</code></span>
            <span class="bm-pill" :data-tone="statusTone" :title="`Trend status: ${statusLabel}.\n${summary}`"><span class="bm-pill-dot" aria-hidden="true" />{{ statusLabel }}</span>
            <span class="bm-hero-updated" :title="'When this report artifact (docs/public/dendrite-benchmark-history.json) was last regenerated.'">{{ artifact ? `Generated ${formatTimestamp(artifact.generatedAt)}` : '' }}</span>
          </div>
        </div>
        <dl class="bm-hero-window">
          <div :title="'The earliest snapshot in the local history file. All deltas on this page are measured against this snapshot.'">
            <dt>Baseline</dt>
            <dd>{{ baseline ? baseline.label : 'pending' }} <span>{{ baseline ? formatTimestamp(baseline.timestamp) : '—' }}</span></dd>
          </div>
          <div :title="'The most recent snapshot in the history file — the numbers shown across this page describe this snapshot.'">
            <dt>Latest</dt>
            <dd>{{ latest?.label ?? '—' }} <span>{{ latest ? formatTimestamp(latest.timestamp) : '—' }}</span></dd>
          </div>
          <div :title="'Total snapshot count in history. Sparklines on this page have one point per snapshot, in order.'">
            <dt>Snapshots</dt>
            <dd>{{ snapshots.length }} <span>across history</span></dd>
          </div>
        </dl>

        <div class="bm-hero-stats">
          <div
            v-for="metric in headlineMetrics"
            :key="metric.label"
            class="bm-stat"
            :data-tone="metric.deltaTone"
            :title="headlineTooltip(metric.label, metric.value, metric.deltaText)"
          >
            <span class="bm-stat-value">{{ metric.value }}</span>
            <span class="bm-stat-label">{{ metric.label }}</span>
            <span class="bm-stat-delta">{{ metric.deltaText }}</span>
          </div>
        </div>
      </header>

      <section class="bm-section">
        <header class="bm-section-header" title="Orientation: how much context the agent gets when it asks for a briefing, and how much falls outside that briefing. Hover any row for a per-metric explanation and history.">
          <span class="bm-section-tick" data-tone="orientation" aria-hidden="true" />
          <h2 class="bm-section-title">Orientation</h2>
          <span class="bm-section-detail">Session setup signal — context delivered vs. omitted on the first briefing.</span>
        </header>
        <ul class="bm-trend-list">
          <li
            v-for="metric in orientationMetrics"
            :key="metric.key"
            class="bm-trend-row"
            :data-tone="metricTone(metric)"
            :title="metricTooltip(metric)"
          >
            <span class="bm-trend-label">{{ metric.label }}</span>
            <span class="bm-trend-value">{{ latest ? formatMetric(latest, metric) : '0' }}</span>
            <svg class="bm-spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
              <polyline :points="trendPath(metric, 32)" />
            </svg>
            <span class="bm-trend-delta">{{ metricDelta(metric) }}</span>
          </li>
        </ul>
      </section>

      <section class="bm-section">
        <header class="bm-section-header" title="Wiki health: counts and ratios that describe how well-maintained the wiki is. The values should drift toward less debt and tighter coverage over time. Hover any row for a per-metric explanation and history.">
          <span class="bm-section-tick" data-tone="health" aria-hidden="true" />
          <h2 class="bm-section-title">Wiki health</h2>
          <span class="bm-section-detail">Documentation hygiene that should drift toward less debt and tighter coverage over time.</span>
        </header>
        <ul class="bm-trend-list">
          <li
            v-for="metric in wikiHealthMetrics"
            :key="metric.key"
            class="bm-trend-row"
            :data-tone="metricTone(metric)"
            :title="metricTooltip(metric)"
          >
            <span class="bm-trend-label">{{ metric.label }}</span>
            <span class="bm-trend-value">{{ latest ? formatMetric(latest, metric) : '0' }}</span>
            <svg class="bm-spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
              <polyline :points="trendPath(metric, 32)" />
            </svg>
            <span class="bm-trend-delta">{{ metricDelta(metric) }}</span>
          </li>
        </ul>
      </section>

      <section class="bm-section">
        <header class="bm-section-header" title="Recall quality: measures whether memory_recall returns the right memories for known queries. A 'probe' is a saved query with an expected match; the runner checks whether the expected memory shows up in the top-1 or top-5 results. Hover any cell or row for details.">
          <span class="bm-section-tick" data-tone="recall" aria-hidden="true" />
          <h2 class="bm-section-title">Recall quality</h2>
          <span class="bm-section-detail">{{ recallSourceLabel }}</span>
        </header>

        <template v-if="hasRecallHistory && hasEvaluatedRecallProbes">
          <div class="bm-strip">
            <div class="bm-strip-cell" :title="stripCellTooltip(recallStripInfo, 'Probes evaluated', latestRecall?.evaluatedProbeCount ?? 0)">
              <span class="bm-strip-value">{{ latestRecall?.evaluatedProbeCount ?? 0 }}</span>
              <span class="bm-strip-label">Probes evaluated</span>
            </div>
            <div class="bm-strip-cell" data-tone="improving" :title="stripCellTooltip(recallStripInfo, 'Top-1 hits', latestRecall?.top1HitCount ?? 0)">
              <span class="bm-strip-value">{{ latestRecall?.top1HitCount ?? 0 }}</span>
              <span class="bm-strip-label">Top-1 hits</span>
            </div>
            <div class="bm-strip-cell" data-tone="improving" :title="stripCellTooltip(recallStripInfo, 'Top-5 hits', latestRecall?.top5HitCount ?? 0)">
              <span class="bm-strip-value">{{ latestRecall?.top5HitCount ?? 0 }}</span>
              <span class="bm-strip-label">Top-5 hits</span>
            </div>
            <div class="bm-strip-cell" :data-tone="(latestRecall?.missCount ?? 0) > 0 ? 'warning' : 'steady'" :title="stripCellTooltip(recallStripInfo, 'Misses', latestRecall?.missCount ?? 0)">
              <span class="bm-strip-value">{{ latestRecall?.missCount ?? 0 }}</span>
              <span class="bm-strip-label">Misses</span>
            </div>
          </div>
          <ul class="bm-trend-list">
            <li
              v-for="metric in recallMetrics"
              :key="metric.key"
              class="bm-trend-row"
              :data-tone="metricTone(metric)"
              :title="metricTooltip(metric)"
            >
              <span class="bm-trend-label">{{ metric.label }}</span>
              <span class="bm-trend-value">{{ latest ? formatMetric(latest, metric) : '0' }}</span>
              <svg class="bm-spark" viewBox="0 0 120 32" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="trendPath(metric, 32)" />
              </svg>
              <span class="bm-trend-delta">{{ metricDelta(metric) }}</span>
            </li>
          </ul>
          <div v-if="hasShadowSemanticData" class="bm-shadow">
            <p class="bm-shadow-eyebrow">Shadow-mode semantic recall · kill-switch metric, not applied to ranking</p>
            <div class="bm-shadow-row">
              <div class="bm-shadow-cell">
                <span class="bm-shadow-value">{{ latestRecall?.shadowSemanticSeenProbeCount ?? 0 }}</span>
                <span class="bm-shadow-label">Probes with cosine</span>
              </div>
              <div class="bm-shadow-cell">
                <span class="bm-shadow-value">{{ formatCosine(latestRecall?.shadowSemanticAverageCosine) }}</span>
                <span class="bm-shadow-label">Avg cosine across candidates</span>
              </div>
              <div class="bm-shadow-cell">
                <span class="bm-shadow-value">{{ formatCosine(latestRecall?.shadowSemanticAverageTopCosine) }}</span>
                <span class="bm-shadow-label">Avg cosine, deterministic top-1</span>
              </div>
            </div>
            <p class="bm-shadow-note">
              Populates only when an embedding provider is configured (see <code>DENDRITE_EMBEDDINGS_OPENAI_API_KEY</code>). Recorded but not applied to ranking — same kill-switch discipline as the bipartite-projection shadow mode.
            </p>
          </div>
        </template>
        <template v-else-if="hasRecallHistory">
          <p class="bm-section-note">The latest snapshot ran the recall benchmark but found no evaluable probes.</p>
          <p class="bm-section-note">Capture a few project-local memories with <code>memory_remember</code>, or define a probe set at <code>local-data/recall-probes.json</code>, then run the next snapshot.</p>
        </template>
        <template v-else>
          <p class="bm-section-note">This snapshot history was captured before recall metrics were recorded.</p>
          <p class="bm-section-note">Run <code>dendrite-wiki benchmark:snapshot --label session-end</code> to refresh the history with recall probes included.</p>
        </template>
      </section>

      <section class="bm-section bm-section--cols">
        <header class="bm-section-header" title="Latest orientation pack: which specific pages wiki_context selected (Selected) and which ranked but were cut by the page budget (Omitted) for the most recent briefing.">
          <span class="bm-section-tick" data-tone="context" aria-hidden="true" />
          <h2 class="bm-section-title">Latest orientation pack</h2>
          <span class="bm-section-detail">What the agent saw — and what it missed — on the most recent briefing.</span>
        </header>
        <div class="bm-cols">
          <div class="bm-col">
            <p class="bm-col-eyebrow">Selected · {{ latestSelectedPages.length }}</p>
            <p v-if="latestSelectedPages.length === 0" class="bm-col-empty">No selected pages recorded yet.</p>
            <ul v-else class="bm-col-list">
              <li v-for="slug in latestSelectedPages" :key="slug"><a :href="`./${slug}.html`">{{ slug }}</a></li>
            </ul>
          </div>
          <div class="bm-col">
            <p class="bm-col-eyebrow">Omitted · {{ latestOmittedPages.length }}</p>
            <p v-if="latestOmittedPages.length === 0" class="bm-col-empty">No omitted pages recorded.</p>
            <ul v-else class="bm-col-list">
              <li v-for="slug in latestOmittedPages.slice(0, 10)" :key="slug"><a :href="`./${slug}.html`">{{ slug }}</a></li>
              <li v-if="latestOmittedPages.length > 10" class="bm-col-list-more">+{{ latestOmittedPages.length - 10 }} more</li>
            </ul>
          </div>
        </div>
      </section>

      <section class="bm-section">
        <header class="bm-section-header" title="Maintenance stream: a continuous log of MCP calls and operator actions captured locally. Tracks how often the agent asks for context, updates the wiki, and how often the operator clears the maintenance inbox. Hover any cell for what it counts.">
          <span class="bm-section-tick" data-tone="ops" aria-hidden="true" />
          <h2 class="bm-section-title">Maintenance stream</h2>
          <span class="bm-section-detail">{{ eventSummary && eventSummary.eventCount > 0 ? `${eventSummary.eventCount} local events captured` : 'Waiting for local event data' }}</span>
        </header>
        <template v-if="eventSummary && eventSummary.eventCount > 0">
          <div class="bm-strip">
            <div class="bm-strip-cell" :title="stripCellTooltip(maintenanceStripInfo, 'Context requests', eventSummary.usage.contextRequestCount)">
              <span class="bm-strip-value">{{ eventSummary.usage.contextRequestCount }}</span>
              <span class="bm-strip-label">Context requests</span>
            </div>
            <div class="bm-strip-cell" :title="stripCellTooltip(maintenanceStripInfo, 'Wiki updates', eventSummary.usage.wikiUpdateCount)">
              <span class="bm-strip-value">{{ eventSummary.usage.wikiUpdateCount }}</span>
              <span class="bm-strip-label">Wiki updates</span>
            </div>
            <div class="bm-strip-cell" :title="stripCellTooltip(maintenanceStripInfo, 'State captures', eventSummary.usage.maintenanceStateChangeCount)">
              <span class="bm-strip-value">{{ eventSummary.usage.maintenanceStateChangeCount }}</span>
              <span class="bm-strip-label">State captures</span>
            </div>
            <div class="bm-strip-cell" data-tone="improving" :title="stripCellTooltip(maintenanceStripInfo, 'Proposals accepted', eventSummary.maintenance.acceptedProposalCount)">
              <span class="bm-strip-value">{{ eventSummary.maintenance.acceptedProposalCount }}</span>
              <span class="bm-strip-label">Proposals accepted</span>
            </div>
            <div class="bm-strip-cell" :title="stripCellTooltip(maintenanceStripInfo, 'Lint findings', formatNullableMetric(eventSummary.maintenance.latestLintFindingCount))">
              <span class="bm-strip-value">{{ formatNullableMetric(eventSummary.maintenance.latestLintFindingCount) }}</span>
              <span class="bm-strip-label">Lint findings</span>
            </div>
            <div class="bm-strip-cell" :title="stripCellTooltip(maintenanceStripInfo, 'Active proposals', formatNullableMetric(eventSummary.maintenance.latestProposalCount))">
              <span class="bm-strip-value">{{ formatNullableMetric(eventSummary.maintenance.latestProposalCount) }}</span>
              <span class="bm-strip-label">Active proposals</span>
            </div>
          </div>
          <ul v-if="recentBenchmarkEvents.length > 0" class="bm-event-log">
            <li v-for="event in recentBenchmarkEvents" :key="`${event.timestamp}-${event.event}-${event.trigger}`">
              <time class="bm-event-time">{{ formatTimestamp(event.timestamp) }}</time>
              <span class="bm-event-name">{{ event.event }}</span>
              <span class="bm-event-trigger">via {{ event.trigger }}</span>
            </li>
          </ul>
          <p class="bm-section-foot">Artifacts stay local in <code>{{ eventSummary.logPath }}</code> and <code>docs/public/dendrite-benchmark-events-summary.json</code>.</p>
        </template>
        <template v-else>
          <p class="bm-section-note">Automatic local event capture is enabled, but this workspace has not recorded benchmark events yet.</p>
          <p class="bm-section-note">Use the MCP server normally with <code>wiki_context</code>, <code>wiki_write</code>, or <code>wiki_log</code> to populate this section.</p>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.bm-report {
  --bm-color-improve: #1f7a4f;
  --bm-color-improve-text: #1c603e;
  --bm-color-improve-soft: color-mix(in srgb, #1f7a4f 14%, transparent);
  --bm-color-warn: #b54728;
  --bm-color-warn-text: #8a2f1c;
  --bm-color-warn-soft: color-mix(in srgb, #b54728 14%, transparent);
  --bm-color-tape: #d35a3b;
  --bm-color-orientation: #2367d1;
  --bm-color-health: #2d9377;
  --bm-color-recall: #8b5cf6;
  --bm-color-context: #d68424;
  --bm-color-ops: #475569;
  --bm-hairline: color-mix(in srgb, var(--vp-c-text-1) 12%, transparent);
  --bm-hairline-strong: color-mix(in srgb, var(--vp-c-text-1) 22%, transparent);
  display: grid;
  gap: 1.4rem;
  font-feature-settings: 'tnum' 1, 'cv11' 1;
  padding: 0 1.5rem;
}

@media (max-width: 768px) {
  .bm-report { padding: 0 0.85rem; }
}

/* HERO --------------------------------------------------------------------- */
.bm-hero {
  display: grid;
  gap: 1rem;
  padding: 0.5rem 0.4rem 1.4rem;
  border-bottom: 1px solid var(--bm-hairline);
  position: relative;
}

.bm-hero::before,
.bm-hero::after {
  content: '';
  position: absolute;
  bottom: -1px;
  width: 5px;
  height: 5px;
  border: 1px solid color-mix(in srgb, var(--vp-c-text-1) 30%, transparent);
  transform: translate(-50%, 50%) rotate(45deg);
  background: var(--vp-c-bg);
}
.bm-hero::before { left: 0.4rem; }
.bm-hero::after { left: calc(100% - 0.4rem); }

.bm-hero-tape {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  height: 1.4rem;
  margin-top: 0.1rem;
}

.bm-hero-tape-stripes {
  display: inline-block;
  width: 6.5rem;
  height: 0.8rem;
  background: repeating-linear-gradient(
    -45deg,
    var(--bm-color-tape) 0,
    var(--bm-color-tape) 5px,
    transparent 5px,
    transparent 10px
  );
  flex-shrink: 0;
}

.bm-hero-tape-label {
  font-size: 0.78rem;
  font-weight: 800;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: var(--bm-color-tape);
}

.bm-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.bm-hero-block {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  max-width: 56rem;
}

.bm-hero-title {
  margin: 0;
  font-family: 'Times New Roman', ui-serif, Georgia, Cambria, serif;
  font-style: italic;
  font-size: clamp(2.4rem, 4.6vw, 3.4rem);
  font-weight: 700;
  line-height: 1;
  color: var(--vp-c-text-1);
  letter-spacing: -0.02em;
}

.bm-hero-title-emph {
  font-style: normal;
  font-weight: 400;
  margin-left: 0.45rem;
}

.bm-hero-tagline {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.5;
  color: var(--vp-c-text-1);
  letter-spacing: -0.005em;
}

.bm-hero-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}

.bm-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.32rem 0.7rem;
  border-radius: 999px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  font-weight: 600;
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
  cursor: help;
}

.bm-pill code {
  background: none;
  padding: 0;
  font-size: inherit;
  color: inherit;
}

.bm-pill-label {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-3, var(--vp-c-text-2));
}

.bm-pill-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, currentColor 22%, transparent);
}

.bm-pill[data-tone='improving'] {
  color: var(--bm-color-improve-text);
  border-color: color-mix(in srgb, var(--bm-color-improve) 32%, transparent);
  background: var(--bm-color-improve-soft);
}

.bm-pill[data-tone='warning'] {
  color: var(--bm-color-warn-text);
  border-color: color-mix(in srgb, var(--bm-color-warn) 32%, transparent);
  background: var(--bm-color-warn-soft);
}

.bm-hero-updated {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.bm-hero-window {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 0.4rem 0 0;
  padding: 0;
  font-size: 0.85rem;
}

.bm-hero-window > div {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  padding: 0.35rem 1.2rem 0.35rem 0.9rem;
  border-left: 1px solid var(--bm-hairline);
  min-width: 0;
}

.bm-hero-window > div:first-child {
  border-left: 0;
  padding-left: 0.4rem;
}

.bm-hero-window dt {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  margin: 0;
}

.bm-hero-window dd {
  margin: 0;
  font-weight: 600;
  color: var(--vp-c-text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bm-hero-window dd span {
  font-weight: 400;
  color: var(--vp-c-text-2);
  margin-left: 0.4rem;
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
}

/* STAT STRIP --------------------------------------------------------------- */
.bm-hero-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin-top: 0.4rem;
}

.bm-stat {
  display: grid;
  gap: 0.25rem;
  padding: 0.45rem 1.4rem 0.45rem 1rem;
  border-left: 1px solid color-mix(in srgb, var(--vp-c-text-1) 10%, transparent);
  position: relative;
  min-width: 7.5rem;
  flex: 1 1 auto;
  cursor: help;
}

.bm-stat:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 3%, transparent);
}

.bm-stat:first-child {
  border-left: 0;
  padding-left: 0.4rem;
}

.bm-stat::before {
  content: '';
  position: absolute;
  left: 1.1rem;
  top: 0.7rem;
  width: 0.55rem;
  height: 2px;
  background: color-mix(in srgb, var(--vp-c-text-1) 30%, transparent);
}
.bm-stat:first-child::before { left: 0.4rem; }
.bm-stat[data-tone='improving']::before { background: var(--bm-color-improve); }
.bm-stat[data-tone='warning']::before { background: var(--bm-color-warn); }

.bm-stat-value {
  font-size: 2.1rem;
  font-weight: 300;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.03em;
  color: var(--vp-c-text-1);
  margin-top: 0.55rem;
}

.bm-stat[data-tone='improving'] .bm-stat-value { color: var(--bm-color-improve-text); }
.bm-stat[data-tone='warning'] .bm-stat-value { color: var(--bm-color-warn-text); }

.bm-stat-label {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.bm-stat-delta {
  font-size: 0.78rem;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.bm-stat[data-tone='improving'] .bm-stat-delta { color: var(--bm-color-improve-text); }
.bm-stat[data-tone='warning'] .bm-stat-delta { color: var(--bm-color-warn-text); }

/* SECTIONS ----------------------------------------------------------------- */
.bm-section {
  display: grid;
  gap: 0.7rem;
  padding-bottom: 0.4rem;
}

.bm-section-header {
  display: flex;
  align-items: baseline;
  gap: 0.85rem;
  flex-wrap: wrap;
  padding: 0.6rem 0.4rem 0.7rem;
  position: relative;
  border-bottom: 1px solid var(--bm-hairline);
  cursor: help;
}

.bm-hero-window > div {
  cursor: help;
}

.bm-section-tick {
  align-self: center;
  width: 0.7rem;
  height: 2px;
  background: color-mix(in srgb, var(--vp-c-text-1) 30%, transparent);
  flex-shrink: 0;
}

.bm-section-tick[data-tone='orientation'] { background: var(--bm-color-orientation); }
.bm-section-tick[data-tone='health'] { background: var(--bm-color-health); }
.bm-section-tick[data-tone='recall'] { background: var(--bm-color-recall); }
.bm-section-tick[data-tone='context'] { background: var(--bm-color-context); }
.bm-section-tick[data-tone='ops'] { background: var(--bm-color-ops); }

.bm-section-title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--vp-c-text-1);
}

.bm-section-detail {
  font-size: 0.85rem;
  font-style: italic;
  color: var(--vp-c-text-2);
  line-height: 1.5;
  flex: 1 1 18rem;
  min-width: 0;
}

.bm-section-note,
.bm-section-foot {
  margin: 0.2rem 0.4rem;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.bm-section-foot {
  font-size: 0.78rem;
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  margin-top: 0.6rem;
}

/* TREND LIST --------------------------------------------------------------- */
.bm-trend-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
}

.bm-trend-row {
  display: grid;
  grid-template-columns: minmax(11rem, 1.4fr) minmax(3rem, auto) minmax(120px, 1fr) minmax(5rem, auto);
  align-items: center;
  gap: 1.1rem;
  padding: 0.55rem 0.4rem;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-text-1) 6%, transparent);
  position: relative;
  cursor: help;
  transition: background 140ms ease;
}

.bm-trend-row:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 3%, transparent);
}

.bm-trend-row:last-child {
  border-bottom: 0;
}

.bm-trend-row::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  width: 2px;
  height: 1rem;
  transform: translateY(-50%);
  background: transparent;
}

.bm-trend-row[data-tone='improving']::before { background: var(--bm-color-improve); }
.bm-trend-row[data-tone='warning']::before { background: var(--bm-color-warn); }

.bm-trend-label {
  font-size: 0.92rem;
  color: var(--vp-c-text-1);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-trend-value {
  font-variant-numeric: tabular-nums;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--vp-c-text-1);
  text-align: right;
  letter-spacing: -0.01em;
}

.bm-spark {
  width: 100%;
  height: 32px;
  display: block;
}

.bm-spark polyline {
  fill: none;
  stroke: color-mix(in srgb, var(--vp-c-text-1) 35%, transparent);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 1.5;
  vector-effect: non-scaling-stroke;
}

.bm-trend-row[data-tone='improving'] .bm-spark polyline { stroke: var(--bm-color-improve); }
.bm-trend-row[data-tone='warning'] .bm-spark polyline { stroke: var(--bm-color-warn); }

.bm-trend-delta {
  font-size: 0.82rem;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-2);
  text-align: right;
  white-space: nowrap;
}

.bm-trend-row[data-tone='improving'] .bm-trend-delta { color: var(--bm-color-improve-text); }
.bm-trend-row[data-tone='warning'] .bm-trend-delta { color: var(--bm-color-warn-text); }

/* HORIZONTAL STRIP --------------------------------------------------------- */
.bm-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 0;
  margin: 0.3rem 0 0.6rem;
  padding: 0.2rem 0;
}

.bm-strip-cell {
  display: grid;
  gap: 0.2rem;
  padding: 0.4rem 1.4rem 0.4rem 1rem;
  border-left: 1px solid color-mix(in srgb, var(--vp-c-text-1) 10%, transparent);
  position: relative;
  min-width: 8.5rem;
  cursor: help;
  transition: background 140ms ease;
}

.bm-strip-cell:hover {
  background: color-mix(in srgb, var(--vp-c-text-1) 3%, transparent);
}

.bm-strip-cell:first-child {
  border-left: 0;
  padding-left: 0.4rem;
}

.bm-strip-cell::before {
  content: '';
  position: absolute;
  left: 1rem;
  top: 0.6rem;
  width: 0.5rem;
  height: 2px;
  background: color-mix(in srgb, var(--vp-c-text-1) 25%, transparent);
}
.bm-strip-cell:first-child::before { left: 0.4rem; }
.bm-strip-cell[data-tone='improving']::before { background: var(--bm-color-improve); }
.bm-strip-cell[data-tone='warning']::before { background: var(--bm-color-warn); }

.bm-strip-value {
  font-size: 1.5rem;
  font-weight: 300;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
  color: var(--vp-c-text-1);
  margin-top: 0.5rem;
}

.bm-strip-cell[data-tone='improving'] .bm-strip-value { color: var(--bm-color-improve-text); }
.bm-strip-cell[data-tone='warning'] .bm-strip-value { color: var(--bm-color-warn-text); }

.bm-strip-label {
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

/* SHADOW STRIP ------------------------------------------------------------- */
.bm-shadow {
  margin: 0.4rem 0.4rem 0;
  padding: 0.7rem 0.9rem;
  border-left: 2px solid color-mix(in srgb, var(--bm-color-recall) 50%, transparent);
  background: color-mix(in srgb, var(--bm-color-recall) 5%, transparent);
}

.bm-shadow-eyebrow {
  margin: 0 0 0.55rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, var(--bm-color-recall) 70%, var(--vp-c-text-1));
}

.bm-shadow-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1.4rem;
}

.bm-shadow-cell {
  display: grid;
  gap: 0.15rem;
  min-width: 9rem;
}

.bm-shadow-value {
  font-size: 1.15rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  color: var(--vp-c-text-1);
  letter-spacing: -0.01em;
}

.bm-shadow-label {
  font-size: 0.74rem;
  color: var(--vp-c-text-2);
  letter-spacing: 0.02em;
}

.bm-shadow-note {
  margin: 0.55rem 0 0;
  font-size: 0.78rem;
  line-height: 1.5;
  color: var(--vp-c-text-2);
}

/* COLUMNS — selected/omitted ---------------------------------------------- */
.bm-cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  gap: 1.4rem 2.5rem;
  padding: 0.4rem;
}

.bm-col {
  display: grid;
  gap: 0.4rem;
  min-width: 0;
}

.bm-col-eyebrow {
  margin: 0;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
  font-variant-numeric: tabular-nums;
}

.bm-col-empty {
  margin: 0;
  font-size: 0.85rem;
  font-style: italic;
  color: var(--vp-c-text-3, var(--vp-c-text-2));
}

.bm-col-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.18rem;
  font-size: 0.85rem;
}

.bm-col-list li {
  font-variant-numeric: tabular-nums;
}

.bm-col-list a {
  color: var(--vp-c-text-1);
  text-decoration: none;
  border-bottom: 1px dotted transparent;
  transition: border-color 140ms ease, color 140ms ease;
}

.bm-col-list a:hover {
  color: var(--bm-color-orientation);
  border-bottom-color: var(--bm-color-orientation);
}

.bm-col-list-more {
  font-size: 0.78rem;
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  font-style: italic;
}

/* EVENT LOG ---------------------------------------------------------------- */
.bm-event-log {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0;
  display: grid;
  gap: 0;
  border-top: 1px solid var(--bm-hairline);
}

.bm-event-log li {
  display: grid;
  grid-template-columns: minmax(8rem, auto) minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 1rem;
  padding: 0.45rem 0.4rem;
  border-bottom: 1px solid color-mix(in srgb, var(--vp-c-text-1) 6%, transparent);
  font-size: 0.82rem;
}

.bm-event-log li:last-child { border-bottom: 0; }

.bm-event-time {
  color: var(--vp-c-text-3, var(--vp-c-text-2));
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.bm-event-name {
  color: var(--vp-c-text-1);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bm-event-trigger {
  color: var(--vp-c-text-2);
  font-style: italic;
}

/* CALLOUTS / EMPTY -------------------------------------------------------- */
.bm-callout {
  border: 1px solid var(--bm-hairline);
  border-left-width: 3px;
  border-radius: 4px;
  padding: 0.85rem 1rem;
  background: var(--vp-c-bg-soft);
}

.bm-callout--error {
  border-left-color: var(--bm-color-warn);
  background: color-mix(in srgb, var(--bm-color-warn) 6%, var(--vp-c-bg-soft));
}

.bm-callout-title {
  margin: 0 0 0.3rem;
  font-weight: 700;
  color: var(--vp-c-text-1);
}

.bm-callout-detail {
  margin: 0.2rem 0 0;
  font-size: 0.85rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.bm-empty {
  padding: 1.5rem 0.4rem;
  border-top: 1px solid var(--bm-hairline);
  border-bottom: 1px solid var(--bm-hairline);
}

.bm-eyebrow {
  margin: 0 0 0.4rem;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--vp-c-text-2);
}

.bm-empty-title {
  margin: 0 0 0.4rem;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.bm-empty-detail {
  margin: 0;
  font-size: 0.92rem;
  color: var(--vp-c-text-2);
  line-height: 1.55;
  max-width: 56rem;
}

code {
  white-space: nowrap;
  font-size: 0.85em;
}

/* RESPONSIVE -------------------------------------------------------------- */
@media (max-width: 720px) {
  .bm-hero-top {
    flex-direction: column;
    align-items: stretch;
  }

  .bm-trend-row {
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'label value'
      'spark spark'
      'delta delta';
    row-gap: 0.3rem;
  }

  .bm-trend-label { grid-area: label; }
  .bm-trend-value { grid-area: value; }
  .bm-spark { grid-area: spark; }
  .bm-trend-delta { grid-area: delta; text-align: left; }

  .bm-event-log li {
    grid-template-columns: 1fr;
    gap: 0.1rem;
  }
}
</style>