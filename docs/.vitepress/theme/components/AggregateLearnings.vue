<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface WeeklyBucket {
  week: string;
  uploadCount: number;
  uniqueInstallations: number;
  totalEvents: number;
  totalWikiUpdates: number;
}

interface AggregateLearningsArtifact {
  schemaVersion: 1;
  generatedAt: string | null;
  window: { since: string | null; until: string | null; days: number };
  uniqueInstallations: number;
  uniqueProjects: number;
  uploadCount: number;
  totalEvents: number;
  totalWikiUpdates: number;
  totalAcceptedProposals: number;
  latestContext: {
    averagePageCount: number | null;
    averageOmittedPageCount: number | null;
    averageOpenQuestionCount: number | null;
  };
  packageVersions: Array<{ version: string; uploadCount: number }>;
  clientProfiles: Array<{ profile: string; uploadCount: number }>;
  weeklyBuckets: WeeklyBucket[];
  note?: string;
}

const PUBLICATION_THRESHOLD = 3;

const artifact = ref<AggregateLearningsArtifact | null>(null);
const liveArtifact = ref<AggregateLearningsArtifact | null>(null);
const bridgeAvailable = ref(false);
const refreshBusy = ref(false);
const refreshMessage = ref('');
const refreshMessageKind = ref<'success' | 'error' | ''>('');
const loadError = ref('');

const data = computed<AggregateLearningsArtifact | null>(() => liveArtifact.value ?? artifact.value);
const hasData = computed(() => Boolean(data.value && data.value.uniqueInstallations > 0));
const isCohortReady = computed(() => Boolean(data.value && data.value.uniqueInstallations >= PUBLICATION_THRESHOLD));
const isPreviewing = computed(() => liveArtifact.value !== null);

const headlineCards = computed(() => {
  const d = data.value;
  if (!d) return [];
  return [
    { label: 'Unique installations', value: d.uniqueInstallations, sub: `${d.uniqueProjects} unique projects` },
    { label: 'Telemetry uploads', value: d.uploadCount, sub: `over ${d.window.days} days` },
    { label: 'Total benchmark events', value: d.totalEvents, sub: 'wiki + memory + context activity' },
    { label: 'Wiki updates', value: d.totalWikiUpdates, sub: 'durable knowledge written back' }
  ];
});

const contextCards = computed(() => {
  const c = data.value?.latestContext;
  if (!c) return [];
  return [
    { label: 'Avg context pages', value: formatAvg(c.averagePageCount), sub: 'per briefing (latest per installation)' },
    { label: 'Avg omitted pages', value: formatAvg(c.averageOmittedPageCount), sub: 'left out by the page budget' },
    { label: 'Avg open questions', value: formatAvg(c.averageOpenQuestionCount), sub: 'unresolved at briefing time' },
    { label: 'Accepted proposals', value: data.value?.totalAcceptedProposals ?? 0, sub: 'maintenance work the operator chose' }
  ];
});

const weeklyBucketsAsc = computed(() => [...(data.value?.weeklyBuckets ?? [])]);
const maxWeeklyUploads = computed(() => Math.max(1, ...weeklyBucketsAsc.value.map((b) => b.uploadCount)));
const maxWeeklyInstallations = computed(() => Math.max(1, ...weeklyBucketsAsc.value.map((b) => b.uniqueInstallations)));
const maxWeeklyEvents = computed(() => Math.max(1, ...weeklyBucketsAsc.value.map((b) => b.totalEvents)));
const maxWeeklyWikiUpdates = computed(() => Math.max(1, ...weeklyBucketsAsc.value.map((b) => b.totalWikiUpdates)));

interface TrendDefinition {
  key: 'uploadCount' | 'uniqueInstallations' | 'totalEvents' | 'totalWikiUpdates';
  label: string;
  sub: string;
  tone: 'primary' | 'accent' | 'subtle';
  scaleMax: () => number;
}

const weeklyTrends: TrendDefinition[] = [
  { key: 'uniqueInstallations', label: 'Distinct installations active per week', sub: 'retention proxy — flat or rising means people stay engaged', tone: 'primary', scaleMax: () => maxWeeklyInstallations.value },
  { key: 'uploadCount', label: 'Uploads per week', sub: 'how often opt-in users send a snapshot', tone: 'accent', scaleMax: () => maxWeeklyUploads.value },
  { key: 'totalEvents', label: 'Total benchmark events per week', sub: 'sum across installations — proxies cohort activity', tone: 'subtle', scaleMax: () => maxWeeklyEvents.value },
  { key: 'totalWikiUpdates', label: 'Total wiki updates per week', sub: 'durable knowledge accumulation across the cohort', tone: 'subtle', scaleMax: () => maxWeeklyWikiUpdates.value }
];

function formatAvg(value: number | null): string {
  if (value === null) return '—';
  return value.toFixed(value >= 10 ? 0 : 1);
}

function formatDate(value: string | null): string {
  if (!value) return 'Not recorded';
  return new Date(value).toLocaleString();
}

function chartPath(bucketKey: TrendDefinition['key'], height = 64): string {
  const padTop = 6;
  const padBottom = 6;
  const usable = height - padTop - padBottom;
  const baseline = height - padBottom;
  const series = weeklyBucketsAsc.value.map((b) => b[bucketKey]);
  if (series.length === 0) {
    const mid = padTop + usable / 2;
    return `0,${mid} 240,${mid}`;
  }
  if (series.length === 1) {
    const mid = padTop + usable / 2;
    return `0,${mid} 240,${mid}`;
  }
  const max = Math.max(...series);
  const min = Math.min(...series);
  const range = Math.max(1, max - min);
  return series
    .map((value, index) => {
      const x = (index / (series.length - 1)) * 240;
      const normalized = (value - min) / range;
      const y = baseline - normalized * usable;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function chartAreaPath(bucketKey: TrendDefinition['key'], height = 64): string {
  const path = chartPath(bucketKey, height);
  if (!path) return '';
  const points = path.split(' ');
  if (points.length === 0) return '';
  const first = points[0].split(',')[0];
  const last = points[points.length - 1].split(',')[0];
  return `${first},${height} ${path} ${last},${height}`;
}

function barPercent(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.round((value / max) * 100);
}

async function loadStaticArtifact(): Promise<void> {
  try {
    const response = await fetch(`/aggregate-learnings.json?t=${Date.now()}`);
    if (response.ok) {
      artifact.value = (await response.json()) as AggregateLearningsArtifact;
    } else {
      loadError.value = `Could not load aggregate-learnings.json (HTTP ${response.status}).`;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load aggregate-learnings.json.';
  }
}

async function probeBridge(): Promise<void> {
  // Bridge probe is best-effort — when the dev server is up AND the operator has set
  // DENDRITE_WIKI_TELEMETRY_REPORT_URL/_TOKEN, this endpoint returns a fresh report.
  // Otherwise it 4xx's and we keep showing the static file.
  try {
    const response = await fetch('/__review-bridge/telemetry/report', { method: 'GET' });
    if (response.status === 412 || response.status === 503) {
      // Bridge is up but unconfigured — surface the "configure env vars" hint without claiming live mode.
      bridgeAvailable.value = true;
    } else if (response.ok) {
      bridgeAvailable.value = true;
    }
  } catch {
    // No bridge — read-only static mode.
  }
}

async function refreshLive(): Promise<void> {
  if (refreshBusy.value || !bridgeAvailable.value) return;
  refreshBusy.value = true;
  refreshMessage.value = '';
  refreshMessageKind.value = '';
  try {
    const response = await fetch('/__review-bridge/telemetry/report', { method: 'GET' });
    if (response.ok) {
      const body = await response.json();
      const reportShape = (body && typeof body === 'object' && 'report' in body
        ? (body as { report: AggregateLearningsArtifact }).report
        : (body as AggregateLearningsArtifact));
      liveArtifact.value = reportShape;
      refreshMessage.value = 'Refreshed from the live Turso destination. Commit docs/public/aggregate-learnings.json to publish this snapshot.';
      refreshMessageKind.value = 'success';
    } else {
      const body = await response.json().catch(() => ({}));
      // Bridge errors come back as { error, errorCode, ...details }; tolerate either
      // shape for forward-compat in case the envelope evolves.
      const reason =
        (body as { error?: string; message?: string }).error ||
        (body as { error?: string; message?: string }).message ||
        `Live refresh failed (HTTP ${response.status}). Set DENDRITE_WIKI_TELEMETRY_REPORT_URL and DENDRITE_WIKI_TELEMETRY_REPORT_TOKEN locally and restart the dev server.`;
      refreshMessage.value = reason;
      refreshMessageKind.value = 'error';
    }
  } catch (error) {
    refreshMessage.value = error instanceof Error ? error.message : 'Unknown error reaching the bridge.';
    refreshMessageKind.value = 'error';
  } finally {
    refreshBusy.value = false;
  }
}

function clearLivePreview(): void {
  liveArtifact.value = null;
  refreshMessage.value = '';
  refreshMessageKind.value = '';
}

onMounted(async () => {
  await Promise.all([loadStaticArtifact(), probeBridge()]);
});
</script>

<template>
  <section class="aggregate-learnings">
    <p v-if="loadError" class="al-error">{{ loadError }}</p>

    <div class="al-hero">
      <div class="al-hero-copy">
        <p class="al-eyebrow">Public cohort report</p>
        <h2>{{ hasData ? 'What the opt-in cohort tells us' : 'Waiting for cohort data' }}</h2>
        <p v-if="hasData" class="al-blurb">
          Aggregate counters across {{ data?.uniqueInstallations }} opt-in installation<span v-if="(data?.uniqueInstallations ?? 0) !== 1">s</span>
          over the last {{ data?.window.days }} days. Generated {{ formatDate(data?.generatedAt ?? null) }}.
          Wiki content, source code, prompts, and file names never leave any contributor's machine — see the
          <a href="/wiki/privacy-telemetry-disclosure">Privacy &amp; Telemetry Disclosure</a> for the exact field-by-field contract.
        </p>
        <p v-else class="al-blurb">
          The first cohort snapshot lands once {{ PUBLICATION_THRESHOLD }} or more opt-in installations have uploaded.
          Today this page renders an empty placeholder so the schema and workflow are visible before any real numbers exist.
        </p>
      </div>
      <div v-if="bridgeAvailable" class="al-hero-actions">
        <button
          v-if="!isPreviewing"
          type="button"
          class="al-button al-button--primary"
          :disabled="refreshBusy"
          @click="refreshLive"
        >
          {{ refreshBusy ? 'Refreshing…' : 'Refresh from live destination' }}
        </button>
        <button
          v-else
          type="button"
          class="al-button al-button--ghost"
          @click="clearLivePreview"
        >
          Discard live preview
        </button>
      </div>
    </div>

    <p
      v-if="refreshMessage"
      class="al-message"
      :data-kind="refreshMessageKind || 'success'"
    >{{ refreshMessage }}</p>

    <p v-if="isPreviewing" class="al-banner al-banner--preview">
      Live preview from the Turso destination — not yet committed. Run
      <code>dendrite-wiki telemetry:report --format json &gt; docs/public/aggregate-learnings.json</code>
      and commit to publish.
    </p>

    <p v-if="hasData && !isCohortReady" class="al-banner al-banner--small">
      Cohort still small (N={{ data?.uniqueInstallations }}). Not yet large enough for publication-ready aggregate claims — visuals below are operator preview only.
    </p>

    <template v-if="hasData">
      <div class="al-grid">
        <article v-for="card in headlineCards" :key="card.label" class="al-card al-card--metric">
          <p class="al-card-label">{{ card.label }}</p>
          <p class="al-card-value">{{ card.value }}</p>
          <p class="al-card-sub">{{ card.sub }}</p>
        </article>
      </div>

      <div class="al-grid">
        <article v-for="card in contextCards" :key="card.label" class="al-card al-card--metric al-card--subtle">
          <p class="al-card-label">{{ card.label }}</p>
          <p class="al-card-value">{{ card.value }}</p>
          <p class="al-card-sub">{{ card.sub }}</p>
        </article>
      </div>

      <article class="al-card">
        <header class="al-card-header">
          <h3>Weekly cohort trends</h3>
          <p class="al-card-meta">Each chart is min/max-scaled within its own series — the shape matters more than the absolute numbers.</p>
        </header>
        <div class="al-trend-grid">
          <div
            v-for="trend in weeklyTrends"
            :key="trend.key"
            class="al-trend-row"
            :data-tone="trend.tone"
          >
            <div class="al-trend-label">
              <p class="al-trend-title">{{ trend.label }}</p>
              <p class="al-trend-sub">{{ trend.sub }}</p>
            </div>
            <div class="al-trend-chart">
              <svg viewBox="0 0 240 64" preserveAspectRatio="none" aria-hidden="true">
                <polyline :points="chartAreaPath(trend.key, 64)" class="al-trend-area" />
                <polyline :points="chartPath(trend.key, 64)" class="al-trend-line" />
              </svg>
              <p class="al-trend-numbers">
                latest <strong>{{ weeklyBucketsAsc.at(-1)?.[trend.key] ?? 0 }}</strong>
                · max <strong>{{ trend.scaleMax() }}</strong>
                · weeks <strong>{{ weeklyBucketsAsc.length }}</strong>
              </p>
            </div>
          </div>
        </div>
      </article>

      <div class="al-grid al-grid--two">
        <article class="al-card">
          <header class="al-card-header">
            <h3>Package version adoption</h3>
            <p class="al-card-meta">Uploads attributed to each shipped version.</p>
          </header>
          <ul v-if="data?.packageVersions.length" class="al-bars">
            <li v-for="row in data.packageVersions" :key="row.version">
              <div class="al-bar-row">
                <span class="al-bar-label">{{ row.version }}</span>
                <span class="al-bar-count">{{ row.uploadCount }}</span>
              </div>
              <div class="al-bar-track">
                <div
                  class="al-bar-fill"
                  :style="{ width: `${barPercent(row.uploadCount, data.packageVersions[0]?.uploadCount ?? 1)}%` }"
                />
              </div>
            </li>
          </ul>
          <p v-else class="al-empty">No package version distribution yet.</p>
        </article>

        <article class="al-card">
          <header class="al-card-header">
            <h3>Client profile mix</h3>
            <p class="al-card-meta">Which MCP clients show up in each upload's <code>clientProfiles</code> label.</p>
          </header>
          <ul v-if="data?.clientProfiles.length" class="al-bars">
            <li v-for="row in data.clientProfiles" :key="row.profile">
              <div class="al-bar-row">
                <span class="al-bar-label">{{ row.profile }}</span>
                <span class="al-bar-count">{{ row.uploadCount }}</span>
              </div>
              <div class="al-bar-track">
                <div
                  class="al-bar-fill"
                  :style="{ width: `${barPercent(row.uploadCount, data.clientProfiles[0]?.uploadCount ?? 1)}%` }"
                />
              </div>
            </li>
          </ul>
          <p v-else class="al-empty">No client-profile labels recorded yet.</p>
        </article>
      </div>
    </template>

    <article v-else class="al-card al-card--empty">
      <h3>How to fill this page</h3>
      <ol class="al-empty-steps">
        <li>Make sure the dendrite-wiki-telemetry Turso database has at least {{ PUBLICATION_THRESHOLD }} distinct <code>installationId</code> rows.</li>
        <li>Run <code>dendrite-wiki telemetry:report --format json --since 30d</code> from a terminal with the read-scoped env vars set.</li>
        <li>Pipe the output into <code>docs/public/aggregate-learnings.json</code> and commit.</li>
        <li>Anyone visiting this page sees the new snapshot rendered as charts.</li>
      </ol>
      <p>
        See <a href="/wiki/benchmark-telemetry-database-roadmap">Benchmark Telemetry Database Roadmap</a>
        for the full design.
      </p>
    </article>
  </section>
</template>

<style scoped>
.aggregate-learnings {
  display: grid;
  gap: 1.25rem;
  margin: 1.5rem 0 2rem;
}

.al-hero,
.al-card {
  border: 1px solid rgba(19, 52, 59, 0.12);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 246, 246, 0.98));
  box-shadow: 0 20px 45px rgba(16, 37, 42, 0.08);
}

.al-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  padding: 1.5rem;
}

.al-eyebrow {
  margin: 0 0 0.35rem;
  color: #8f4b21;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.al-hero h2,
.al-card h3 {
  margin: 0;
  color: #16343b;
}

.al-blurb,
.al-card-meta,
.al-trend-sub,
.al-empty,
.al-empty-steps {
  color: #45616a;
  line-height: 1.5;
}

.al-blurb {
  margin: 0.35rem 0 0;
}

.al-hero-actions {
  display: flex;
  gap: 0.6rem;
  flex-shrink: 0;
}

.al-button {
  border: 1px solid rgba(19, 52, 59, 0.16);
  border-radius: 14px;
  padding: 0.7rem 1.1rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

.al-button:disabled {
  opacity: 0.6;
  cursor: progress;
}

.al-button--primary {
  background: linear-gradient(180deg, #2f7057 0%, #1f5239 100%);
  color: #fff;
  border-color: rgba(13, 51, 33, 0.35);
}

.al-button--ghost {
  background: rgba(22, 52, 59, 0.06);
  color: #16343b;
}

.al-error,
.al-message,
.al-banner {
  margin: 0;
  padding: 0.7rem 0.95rem;
  border-radius: 12px;
}

.al-error {
  background: rgba(176, 49, 49, 0.14);
  color: #8a2727;
}

.al-message[data-kind='success'] {
  background: rgba(47, 112, 87, 0.14);
  color: #1f5239;
}

.al-message[data-kind='error'] {
  background: rgba(176, 49, 49, 0.14);
  color: #8a2727;
}

.al-banner--preview {
  background: rgba(244, 175, 75, 0.18);
  color: #6f4d09;
}

.al-banner--small {
  background: rgba(22, 52, 59, 0.06);
  color: #16343b;
  font-size: 0.92rem;
}

.al-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.al-grid--two {
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
}

.al-card {
  padding: 1.25rem;
  display: grid;
  gap: 0.85rem;
}

.al-card--metric {
  gap: 0.3rem;
}

.al-card--subtle {
  background: linear-gradient(180deg, rgba(241, 246, 246, 0.6), rgba(220, 232, 232, 0.55));
}

.al-card--empty {
  text-align: left;
}

.al-card-label {
  margin: 0;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #45616a;
}

.al-card-value {
  margin: 0;
  font-size: 1.9rem;
  font-weight: 700;
  color: #16343b;
}

.al-card-sub {
  margin: 0;
  font-size: 0.85rem;
  color: #45616a;
}

.al-card-header {
  display: grid;
  gap: 0.25rem;
}

.al-trend-grid {
  display: grid;
  gap: 1rem;
}

.al-trend-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(0, 2fr);
  gap: 1.25rem;
  align-items: center;
}

.al-trend-label {
  display: grid;
  gap: 0.15rem;
}

.al-trend-title {
  margin: 0;
  font-weight: 600;
  color: #16343b;
}

.al-trend-sub {
  margin: 0;
  font-size: 0.85rem;
}

.al-trend-chart svg {
  width: 100%;
  height: 64px;
  display: block;
}

.al-trend-line {
  fill: none;
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.al-trend-area {
  fill-opacity: 0.18;
  stroke: none;
}

.al-trend-row[data-tone='primary'] .al-trend-line,
.al-trend-row[data-tone='primary'] .al-trend-area {
  stroke: #2f7057;
  fill: #2f7057;
}

.al-trend-row[data-tone='accent'] .al-trend-line,
.al-trend-row[data-tone='accent'] .al-trend-area {
  stroke: #b66322;
  fill: #b66322;
}

.al-trend-row[data-tone='subtle'] .al-trend-line,
.al-trend-row[data-tone='subtle'] .al-trend-area {
  stroke: #2367d1;
  fill: #2367d1;
}

.al-trend-numbers {
  margin: 0.45rem 0 0;
  font-size: 0.85rem;
  color: #45616a;
}

.al-bars {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.al-bar-row {
  display: flex;
  justify-content: space-between;
  color: #16343b;
  font-weight: 600;
}

.al-bar-track {
  background: rgba(22, 52, 59, 0.08);
  border-radius: 8px;
  height: 10px;
  overflow: hidden;
}

.al-bar-fill {
  background: linear-gradient(90deg, #2f7057, #b66322);
  height: 100%;
}

.al-empty-steps {
  margin: 0;
  padding-left: 1.25rem;
  display: grid;
  gap: 0.45rem;
}

@media (max-width: 720px) {
  .al-hero {
    flex-direction: column;
  }
  .al-trend-row {
    grid-template-columns: 1fr;
  }
}
</style>
