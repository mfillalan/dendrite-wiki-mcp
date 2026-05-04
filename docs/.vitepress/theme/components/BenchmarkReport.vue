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
  { key: 'contextPageCount', label: 'Context pages', tone: 'neutral' },
  { key: 'contextOmittedPageCount', label: 'Omitted pages', tone: 'improve-down' },
  { key: 'openQuestionCount', label: 'Open questions', tone: 'improve-down' }
];

const wikiHealthMetrics: TrendMetric[] = [
  { key: 'metadataCoverage', label: 'Metadata coverage', tone: 'improve-up', format: 'percent' },
  { key: 'claimCount', label: 'Claims', tone: 'improve-up' },
  { key: 'staleClaimCount', label: 'Stale claims', tone: 'improve-down' },
  { key: 'lintFindingCount', label: 'Lint findings', tone: 'improve-down' },
  { key: 'proposalCount', label: 'Proposals', tone: 'improve-down' },
  { key: 'graphEdgeCount', label: 'Graph edges', tone: 'improve-up' },
  { key: 'activeGuidanceCount', label: 'Active guidance', tone: 'improve-up' }
];

const latestSelectedPages = computed(() => latest.value?.context.selectedSlugs ?? []);
const latestOmittedPages = computed(() => latest.value?.context.omittedSlugs ?? []);
const recentBenchmarkEvents = computed(() => eventSummary.value?.recentEvents.slice().reverse().slice(0, 4) ?? []);

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

function trendPath(metric: TrendMetric): string {
  const series = snapshots.value.map((snapshot) => getMetricValue(snapshot, metric.key));
  if (series.length <= 1) {
    return '8,24 112,24';
  }

  const max = Math.max(...series);
  const min = Math.min(...series);
  const spread = max - min || 1;

  return series
    .map((value, index) => {
      const x = 8 + (104 * index) / Math.max(series.length - 1, 1);
      const y = 40 - ((value - min) / spread) * 28;
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
</script>

<template>
  <div class="benchmark-report">
    <div v-if="loadError" class="panel error-panel">
      <strong>Benchmark artifact failed to load.</strong>
      <p>{{ loadError }}</p>
      <p>Run <code>dendrite-wiki benchmark:snapshot --label session-end</code> to generate the local history artifact.</p>
    </div>

    <div v-else-if="!artifact || snapshots.length === 0" class="panel empty-panel">
      <p class="eyebrow">Benchmark Report</p>
      <h2>No snapshots yet</h2>
      <p>Run <code>dendrite-wiki benchmark:snapshot --label baseline</code> after a meaningful session to create the first local benchmark history artifact.</p>
    </div>

    <template v-else>
      <section class="hero-panel" :data-tone="statusTone">
        <div>
          <p class="eyebrow">Local Benchmark Report</p>
          <h2>{{ summary }}</h2>
          <p class="hero-copy">Baseline: {{ baseline ? baseline.label : 'pending' }} on {{ baseline ? formatTimestamp(baseline.timestamp) : 'Not captured yet' }}</p>
          <p class="hero-copy">Latest: {{ latest?.label }} on {{ latest ? formatTimestamp(latest.timestamp) : 'Not captured yet' }}</p>
        </div>
        <div class="hero-meta">
          <span>Generated {{ formatTimestamp(artifact.generatedAt) }}</span>
          <span>Branch {{ latest?.git.branch ?? 'unknown' }}</span>
          <span>Commit {{ latest?.git.commit ?? 'unknown' }}</span>
        </div>
      </section>

      <section class="headline-grid">
        <article v-for="metric in headlineMetrics" :key="metric.label" class="panel headline-card" :data-tone="metric.deltaTone">
          <p class="eyebrow">{{ metric.label }}</p>
          <strong>{{ metric.value }}</strong>
          <span>{{ metric.deltaText }}</span>
        </article>
      </section>

      <section class="report-grid">
        <article class="panel trend-panel">
          <div class="section-copy">
            <p class="eyebrow">Orientation Trend</p>
            <h3>Session setup signal</h3>
            <p>Shows how much context the agent receives and how much still falls outside the first briefing.</p>
          </div>
          <div class="trend-list">
            <div v-for="metric in orientationMetrics" :key="metric.key" class="trend-row" :data-tone="metricTone(metric)">
              <div>
                <strong>{{ metric.label }}</strong>
                <span>{{ metricDelta(metric) }}</span>
              </div>
              <div class="trend-meta">
                <span>{{ latest ? formatMetric(latest, metric) : '0' }}</span>
                <svg viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true">
                  <polyline :points="trendPath(metric)" />
                </svg>
              </div>
            </div>
          </div>
        </article>

        <article class="panel trend-panel">
          <div class="section-copy">
            <p class="eyebrow">Wiki Health Trend</p>
            <h3>Documentation hygiene</h3>
            <p>Tracks the local signals that should improve as the wiki becomes more reliable for future sessions.</p>
          </div>
          <div class="trend-list">
            <div v-for="metric in wikiHealthMetrics" :key="metric.key" class="trend-row" :data-tone="metricTone(metric)">
              <div>
                <strong>{{ metric.label }}</strong>
                <span>{{ metricDelta(metric) }}</span>
              </div>
              <div class="trend-meta">
                <span>{{ latest ? formatMetric(latest, metric) : '0' }}</span>
                <svg viewBox="0 0 120 48" preserveAspectRatio="none" aria-hidden="true">
                  <polyline :points="trendPath(metric)" />
                </svg>
              </div>
            </div>
          </div>
        </article>
      </section>

      <section class="report-grid secondary-grid">
        <article class="panel latest-panel">
          <p class="eyebrow">Latest Orientation Pack</p>
          <h3>Selected pages</h3>
          <p v-if="latestSelectedPages.length === 0">No selected pages recorded yet.</p>
          <ul v-else>
            <li v-for="slug in latestSelectedPages" :key="slug"><a :href="`./${slug}.html`">{{ slug }}</a></li>
          </ul>
        </article>

        <article class="panel latest-panel">
          <p class="eyebrow">Latest Omitted Pages</p>
          <h3>Pages outside the first briefing</h3>
          <p v-if="latestOmittedPages.length === 0">No omitted pages recorded in the latest snapshot.</p>
          <ul v-else>
            <li v-for="slug in latestOmittedPages.slice(0, 8)" :key="slug"><a :href="`./${slug}.html`">{{ slug }}</a></li>
          </ul>
        </article>

        <article class="panel maintenance-panel">
          <p class="eyebrow">Maintenance Trend</p>
          <h3>{{ eventSummary && eventSummary.eventCount > 0 ? 'Automatic local event stream' : 'Waiting for local event data' }}</h3>
          <template v-if="eventSummary && eventSummary.eventCount > 0">
            <p>
              {{ eventSummary.usage.contextRequestCount }} context requests, {{ eventSummary.usage.wikiUpdateCount }} wiki updates,
              and {{ eventSummary.usage.maintenanceStateChangeCount }} maintenance state captures are now recorded automatically.
            </p>
            <div class="maintenance-stats">
              <div class="maintenance-stat">
                <strong>{{ eventSummary.maintenance.acceptedProposalCount }}</strong>
                <span>Accepted proposal applies</span>
              </div>
              <div class="maintenance-stat">
                <strong>{{ formatNullableMetric(eventSummary.maintenance.latestLintFindingCount) }}</strong>
                <span>Latest lint findings</span>
              </div>
              <div class="maintenance-stat">
                <strong>{{ formatNullableMetric(eventSummary.maintenance.latestProposalCount) }}</strong>
                <span>Latest active proposals</span>
              </div>
            </div>
            <p>Artifacts stay local in <code>{{ eventSummary.logPath }}</code> and <code>docs/public/dendrite-benchmark-events-summary.json</code>.</p>
            <ul>
              <li v-for="event in recentBenchmarkEvents" :key="`${event.timestamp}-${event.event}-${event.trigger}`">
                {{ formatTimestamp(event.timestamp) }}: {{ event.event }} via {{ event.trigger }}
              </li>
            </ul>
          </template>
          <template v-else>
            <p>Automatic local event capture is enabled, but this workspace has not recorded benchmark events yet.</p>
            <p>Use the MCP server normally with <code>wiki_context</code>, <code>wiki_write</code>, or <code>wiki_log</code> to populate this panel.</p>
          </template>
        </article>
      </section>
    </template>
  </div>
</template>

<style scoped>
.benchmark-report {
  display: grid;
  gap: 1rem;
}

.panel,
.hero-panel {
  border: 1px solid var(--vp-c-divider);
  border-radius: 22px;
  padding: 1.2rem;
  background:
    radial-gradient(circle at top right, color-mix(in srgb, #f4a261 18%, transparent), transparent 36%),
    linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg-soft) 86%, white 14%), var(--vp-c-bg-soft));
  box-shadow: 0 18px 48px rgba(15, 23, 42, 0.08);
}

.hero-panel {
  display: grid;
  gap: 1rem;
  grid-template-columns: minmax(0, 1.5fr) minmax(16rem, 0.9fr);
}

.hero-panel[data-tone='improving'] {
  border-color: color-mix(in srgb, #1f7a4f 42%, var(--vp-c-divider));
}

.hero-panel[data-tone='warning'] {
  border-color: color-mix(in srgb, #c75b39 42%, var(--vp-c-divider));
}

.hero-meta,
.hero-copy,
.section-copy p,
.headline-card span,
.trend-row span,
.latest-panel p,
.maintenance-panel p {
  color: var(--vp-c-text-2);
}

.hero-meta {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  justify-content: flex-end;
}

.eyebrow {
  margin: 0 0 0.25rem;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--vp-c-text-3);
}

.headline-grid,
.report-grid {
  display: grid;
  gap: 1rem;
}

.headline-grid {
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
}

.headline-card strong {
  display: block;
  font-size: 2rem;
  line-height: 1;
  margin-bottom: 0.5rem;
}

.headline-card[data-tone='improving'] strong,
.trend-row[data-tone='improving'] strong {
  color: #1f7a4f;
}

.headline-card[data-tone='warning'] strong,
.trend-row[data-tone='warning'] strong {
  color: #b54728;
}

.report-grid {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.secondary-grid {
  align-items: start;
}

.trend-panel {
  display: grid;
  gap: 1rem;
}

.trend-list {
  display: grid;
  gap: 0.75rem;
}

.trend-row {
  display: grid;
  gap: 0.85rem;
  grid-template-columns: minmax(0, 1fr) minmax(120px, 148px);
  align-items: center;
  padding: 0.85rem 0.95rem;
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-bg) 82%, white 18%);
}

.trend-row strong,
.latest-panel h3,
.maintenance-panel h3,
.section-copy h3 {
  display: block;
  margin-bottom: 0.2rem;
}

.trend-meta {
  display: grid;
  justify-items: end;
  gap: 0.3rem;
}

svg {
  width: 120px;
  height: 48px;
}

polyline {
  fill: none;
  stroke: color-mix(in srgb, #1d6fd6 70%, #f4a261 30%);
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-width: 3;
}

ul {
  margin: 0.8rem 0 0;
  padding-left: 1.2rem;
}

li + li {
  margin-top: 0.35rem;
}

.maintenance-panel {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, #ffd166 22%, transparent), transparent 38%),
    linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg-soft) 86%, white 14%), var(--vp-c-bg-soft));
}

.maintenance-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
  margin: 1rem 0;
}

.maintenance-stat {
  padding: 0.85rem 0.95rem;
  border-radius: 16px;
  background: color-mix(in srgb, var(--vp-c-bg) 78%, white 22%);
}

.maintenance-stat strong {
  display: block;
  margin-bottom: 0.2rem;
}

.error-panel {
  border-color: color-mix(in srgb, #c0392b 42%, var(--vp-c-divider));
}

code {
  white-space: nowrap;
}

@media (max-width: 720px) {
  .hero-panel,
  .trend-row {
    grid-template-columns: 1fr;
  }

  .trend-meta {
    justify-items: start;
  }
}
</style>