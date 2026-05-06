<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface RawObservation {
  ts: string;
  sessionId: string;
  tool: string;
  kind: 'edit' | 'read' | 'command' | 'search' | 'web' | 'other';
  target: string;
  outcome: 'ok' | 'error' | 'unknown';
  summary: string;
}

interface ObservationStreamArtifact {
  schemaVersion: 1;
  generatedAt: string;
  sampleSize: number;
  observationCount: number;
  clusterCount: number;
  observations: RawObservation[];
}

const defaultArtifact: ObservationStreamArtifact = {
  schemaVersion: 1,
  generatedAt: '',
  sampleSize: 0,
  observationCount: 0,
  clusterCount: 0,
  observations: []
};

const artifact = ref<ObservationStreamArtifact>(defaultArtifact);
const loadError = ref('');
const filter = ref<'all' | 'edit' | 'read' | 'command' | 'search' | 'web' | 'other'>('all');
const targetFilter = ref('');

const reversedObservations = computed(() => {
  const list = artifact.value.observations.slice().reverse();
  const kindFiltered = filter.value === 'all' ? list : list.filter((o) => o.kind === filter.value);
  const target = targetFilter.value.trim().toLowerCase();
  if (!target) {
    return kindFiltered;
  }
  return kindFiltered.filter((o) => o.target.toLowerCase().includes(target));
});

const kindCounts = computed(() => {
  const counts: Record<string, number> = { edit: 0, read: 0, command: 0, search: 0, web: 0, other: 0 };
  for (const observation of artifact.value.observations) {
    counts[observation.kind] = (counts[observation.kind] ?? 0) + 1;
  }
  return counts;
});

const distinctSessions = computed(() => {
  const set = new Set(artifact.value.observations.map((o) => o.sessionId));
  return set.size;
});

async function fetchArtifact(): Promise<void> {
  const cacheBust = Date.now();
  try {
    const response = await fetch(`/raw-observations-recent.json?t=${cacheBust}`);
    if (response.ok) {
      artifact.value = (await response.json()) as ObservationStreamArtifact;
      loadError.value = '';
    } else if (response.status === 404) {
      loadError.value = 'No observation stream artifact found yet. Run `npm run wiki:refresh` to generate it.';
    } else {
      loadError.value = `Could not fetch observation stream (HTTP ${response.status}).`;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load observation stream artifact.';
  }
}

onMounted(async () => {
  await fetchArtifact();
});

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return 'Not recorded';
  }
  return new Date(value).toLocaleString();
}

function shortenSession(value: string): string {
  if (!value || value === 'unknown') {
    return value || 'unknown';
  }
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 8)}…`;
}
</script>

<template>
  <section class="live-observations">
    <div class="hero-card">
      <div>
        <p class="eyebrow">Observation stream</p>
        <h2>Recent agent activity</h2>
        <p class="lede">
          A tail of the latest raw observations the PostToolUse hook captured to <code>local-data/raw-observations.jsonl</code>.
          The stream is strictly separated from <code>wiki_context</code> recall — these observations feed the maintenance
          inbox cluster surface, never the curated memory layer.
        </p>
      </div>
      <div class="hero-state">
        <span class="state-label">{{ artifact.observationCount }}</span>
        <span class="state-caption">recent observations · {{ distinctSessions }} session{{ distinctSessions === 1 ? '' : 's' }}</span>
      </div>
    </div>

    <p v-if="loadError" class="load-error">{{ loadError }}</p>

    <div class="metric-row">
      <button
        v-for="kind in (['all','edit','read','command','search','web','other'] as const)"
        :key="kind"
        class="kind-chip"
        :data-active="filter === kind"
        @click="filter = kind"
      >
        {{ kind }}<span v-if="kind !== 'all'"> ({{ kindCounts[kind] ?? 0 }})</span>
      </button>
    </div>

    <div class="filter-row">
      <input
        v-model="targetFilter"
        type="search"
        placeholder="Filter by target (file path, command, url)…"
        class="target-filter"
      />
      <button class="refresh-button" @click="fetchArtifact">Refresh</button>
    </div>

    <p class="meta">
      Generated at {{ formatDate(artifact.generatedAt) }}. Showing newest first. Re-run <code>npm run wiki:refresh</code> to refresh the underlying artifact.
    </p>

    <article v-if="reversedObservations.length === 0" class="empty-state-card">
      <p>No observations match the current filter.</p>
      <p class="empty-meta">
        If the file is empty entirely, the PostToolUse hook may not be active in your harness, or
        <code>DENDRITE_RAW_OBSERVATIONS=off</code> is set in the environment.
      </p>
    </article>

    <table v-else class="observation-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Kind</th>
          <th>Tool</th>
          <th>Target</th>
          <th>Outcome</th>
          <th>Session</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(observation, index) in reversedObservations" :key="`${observation.ts}-${index}`">
          <td><time>{{ formatDate(observation.ts) }}</time></td>
          <td>
            <span class="kind-badge" :data-kind="observation.kind">{{ observation.kind }}</span>
          </td>
          <td>{{ observation.tool }}</td>
          <td class="target-cell"><code>{{ observation.target || '—' }}</code></td>
          <td>
            <span class="outcome-badge" :data-outcome="observation.outcome">{{ observation.outcome }}</span>
          </td>
          <td><code>{{ shortenSession(observation.sessionId) }}</code></td>
        </tr>
      </tbody>
    </table>

    <p class="footer-note">
      Raw observations are capped at the last 5000 by default. Tune via <code>DENDRITE_RAW_OBSERVATIONS_MAX_LINES</code>.
      Promote a recurring pattern to a curated memory by clicking the matching cluster's action in the
      <a href="./maintenance-inbox.html">maintenance inbox</a>.
    </p>
  </section>
</template>

<style scoped>
.live-observations {
  display: grid;
  gap: 1.25rem;
  margin: 1.5rem 0 2rem;
}

.hero-card,
.empty-state-card {
  border: 1px solid rgba(19, 52, 59, 0.12);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 246, 246, 0.98));
  box-shadow: 0 20px 45px rgba(16, 37, 42, 0.08);
  padding: 1.5rem;
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: #8f4b21;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-card h2 {
  margin: 0 0 0.5rem;
  color: #16343b;
}

.lede,
.empty-meta,
.load-error,
.meta,
.footer-note {
  color: #45616a;
  font-size: 0.95rem;
}

.hero-state {
  min-width: 200px;
  padding: 1rem;
  border-radius: 18px;
  background: rgba(22, 52, 59, 0.08);
  display: grid;
  align-content: center;
  gap: 0.25rem;
  text-align: right;
}

.state-label {
  color: #16343b;
  font-size: 1.7rem;
  font-weight: 700;
}

.state-caption {
  font-size: 0.85rem;
}

.metric-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.kind-chip {
  border: 1px solid rgba(19, 52, 59, 0.18);
  border-radius: 999px;
  padding: 0.4rem 0.9rem;
  background: rgba(255, 255, 255, 0.85);
  color: #45616a;
  font-size: 0.85rem;
  cursor: pointer;
  text-transform: capitalize;
  transition: background 0.15s, color 0.15s;
}

.kind-chip[data-active='true'] {
  background: #16343b;
  color: white;
  border-color: #16343b;
}

.filter-row {
  display: flex;
  gap: 0.6rem;
  align-items: center;
}

.target-filter {
  flex: 1;
  border: 1px solid rgba(19, 52, 59, 0.18);
  border-radius: 12px;
  padding: 0.55rem 0.85rem;
  font-size: 0.95rem;
  background: white;
}

.refresh-button {
  border: 1px solid rgba(19, 52, 59, 0.18);
  border-radius: 12px;
  padding: 0.55rem 1rem;
  background: rgba(47, 112, 87, 0.14);
  color: #16343b;
  font-weight: 600;
  cursor: pointer;
}

.observation-table {
  width: 100%;
  border-collapse: collapse;
  border-radius: 18px;
  overflow: hidden;
  background: white;
  box-shadow: 0 12px 28px rgba(16, 37, 42, 0.06);
  font-size: 0.92rem;
}

.observation-table th,
.observation-table td {
  text-align: left;
  padding: 0.6rem 0.85rem;
  border-bottom: 1px solid rgba(19, 52, 59, 0.08);
  vertical-align: top;
}

.observation-table thead th {
  background: rgba(22, 52, 59, 0.05);
  color: #16343b;
  font-weight: 700;
  text-transform: uppercase;
  font-size: 0.78rem;
  letter-spacing: 0.05em;
}

.observation-table tbody tr:last-child td {
  border-bottom: none;
}

.target-cell code {
  word-break: break-all;
}

.kind-badge,
.outcome-badge {
  display: inline-block;
  padding: 0.15rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 600;
  text-transform: lowercase;
  background: rgba(22, 52, 59, 0.08);
  color: #16343b;
}

.kind-badge[data-kind='edit'] { background: rgba(47, 112, 87, 0.18); color: #1f4f3b; }
.kind-badge[data-kind='read'] { background: rgba(70, 95, 168, 0.18); color: #2a3870; }
.kind-badge[data-kind='command'] { background: rgba(168, 95, 28, 0.18); color: #6b3a0e; }
.kind-badge[data-kind='search'] { background: rgba(125, 95, 168, 0.18); color: #4a2a70; }
.kind-badge[data-kind='web'] { background: rgba(28, 130, 168, 0.18); color: #0e4a6b; }

.outcome-badge[data-outcome='ok'] { background: rgba(47, 112, 87, 0.18); color: #1f4f3b; }
.outcome-badge[data-outcome='error'] { background: rgba(168, 47, 47, 0.18); color: #6b1e1e; }
.outcome-badge[data-outcome='unknown'] { background: rgba(45, 97, 106, 0.12); color: #45616a; }

.empty-state-card {
  text-align: center;
}

.load-error {
  margin: 0;
  padding: 0.85rem 1rem;
  border-radius: 12px;
  background: rgba(168, 47, 47, 0.1);
  color: #6b1e1e;
}

.footer-note {
  font-size: 0.85rem;
  text-align: center;
}

@media (max-width: 720px) {
  .hero-card {
    flex-direction: column;
  }

  .hero-state {
    text-align: left;
  }

  .observation-table th,
  .observation-table td {
    padding: 0.5rem 0.6rem;
    font-size: 0.85rem;
  }
}
</style>
