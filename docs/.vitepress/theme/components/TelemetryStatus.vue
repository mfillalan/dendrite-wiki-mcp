<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface DendriteTelemetryStatusArtifact {
  schemaVersion: 1;
  generatedAt: string;
  sharingMode: 'off' | 'opt-in';
  sharingEnabled: boolean;
  consent: {
    isExplicit: boolean;
    updatedAt: string | null;
  };
  paths: {
    configPath: string;
    statusArtifactPath: string;
    benchmarkEventLogPath: string;
    benchmarkEventSummaryPath: string;
  };
  remoteUpload: {
    configured: boolean;
    destination: string | null;
    lastAttemptAt: string | null;
    lastSuccessAt: string | null;
  };
  benchmarkEvents: {
    eventCount: number;
    latestEventAt: string | null;
    byType: Record<string, number>;
  };
  notes: string[];
}

interface DendriteBenchmarkEventSummary {
  eventCount: number;
  byType: Record<string, number>;
  recentEvents: Array<{
    timestamp: string;
    event: string;
    trigger: string;
  }>;
}

const defaultStatus: DendriteTelemetryStatusArtifact = {
  schemaVersion: 1,
  generatedAt: '',
  sharingMode: 'off',
  sharingEnabled: false,
  consent: {
    isExplicit: false,
    updatedAt: null
  },
  paths: {
    configPath: 'local-data/telemetry.json',
    statusArtifactPath: 'docs/public/dendrite-telemetry-status.json',
    benchmarkEventLogPath: 'local-data/benchmark-events.jsonl',
    benchmarkEventSummaryPath: 'docs/public/dendrite-benchmark-events-summary.json'
  },
  remoteUpload: {
    configured: false,
    destination: null,
    lastAttemptAt: null,
    lastSuccessAt: null
  },
  benchmarkEvents: {
    eventCount: 0,
    latestEventAt: null,
    byType: {
      session_started: 0,
      context_requested: 0,
      wiki_updated: 0,
      maintenance_state_changed: 0,
      session_snapshot: 0
    }
  },
  notes: ['Telemetry sharing is off by default. Local benchmark artifacts still work without a network connection.']
};

const status = ref<DendriteTelemetryStatusArtifact>(defaultStatus);
const eventSummary = ref<DendriteBenchmarkEventSummary | null>(null);
const loadError = ref('');

const sharingHeadline = computed(() => (status.value.sharingEnabled ? 'Opt-in sharing enabled' : 'Local-only telemetry'));
const consentLabel = computed(() => (status.value.consent.isExplicit ? 'Explicitly chosen' : 'Default state'));
const capturedEventCount = computed(() => eventSummary.value?.eventCount ?? status.value.benchmarkEvents.eventCount);
const eventTypeRows = computed(() => Object.entries(eventSummary.value?.byType ?? status.value.benchmarkEvents.byType));
const recentEvents = computed(() => eventSummary.value?.recentEvents.slice().reverse().slice(0, 5) ?? []);

onMounted(async () => {
  const cacheBust = Date.now();

  try {
    const response = await fetch(`/dendrite-telemetry-status.json?t=${cacheBust}`);
    if (response.ok) {
      status.value = (await response.json()) as DendriteTelemetryStatusArtifact;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load telemetry status artifact.';
  }

  try {
    const eventResponse = await fetch(`/dendrite-benchmark-events-summary.json?t=${cacheBust}`);
    if (eventResponse.ok) {
      eventSummary.value = (await eventResponse.json()) as DendriteBenchmarkEventSummary;
    }
  } catch {
    // The status page should still render when no benchmark events exist yet.
  }
});

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not recorded';
  }

  return new Date(value).toLocaleString();
}

function labelEventType(value: string): string {
  return value.replace(/_/g, ' ');
}
</script>

<template>
  <section class="telemetry-status">
    <div class="hero-card">
      <div>
        <p class="eyebrow">Telemetry posture</p>
        <h2>{{ sharingHeadline }}</h2>
        <p class="lede">
          This page reflects the local consent state for benchmark telemetry. Local benchmark events and reports stay available even when sharing is off.
        </p>
      </div>
      <div class="hero-state" :data-enabled="status.sharingEnabled">
        <span class="state-label">{{ status.sharingMode }}</span>
        <span class="state-caption">{{ consentLabel }}</span>
      </div>
    </div>

    <p v-if="loadError" class="load-error">{{ loadError }}</p>

    <div class="status-grid">
      <article class="metric-card">
        <p class="metric-label">Captured local events</p>
        <p class="metric-value">{{ capturedEventCount }}</p>
        <p class="metric-meta">Latest event: {{ formatDate(eventSummary?.recentEvents.at(-1)?.timestamp ?? status.benchmarkEvents.latestEventAt) }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Remote upload</p>
        <p class="metric-value">{{ status.remoteUpload.configured ? 'Configured' : 'Not configured' }}</p>
        <p class="metric-meta">No content upload path is enabled in this milestone.</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Consent updated</p>
        <p class="metric-value">{{ formatDate(status.consent.updatedAt) }}</p>
        <p class="metric-meta">Refresh with <code>dendrite-wiki telemetry status</code>.</p>
      </article>
    </div>

    <div class="detail-grid">
      <article class="panel-card">
        <h3>What is happening now</h3>
        <ul>
          <li v-for="note in status.notes" :key="note">{{ note }}</li>
        </ul>
      </article>

      <article class="panel-card">
        <h3>Local artifact paths</h3>
        <dl class="path-list">
          <div>
            <dt>Status artifact</dt>
            <dd>{{ status.paths.statusArtifactPath }}</dd>
          </div>
          <div>
            <dt>Consent config</dt>
            <dd>{{ status.paths.configPath }}</dd>
          </div>
          <div>
            <dt>Event log</dt>
            <dd>{{ status.paths.benchmarkEventLogPath }}</dd>
          </div>
          <div>
            <dt>Event summary</dt>
            <dd>{{ status.paths.benchmarkEventSummaryPath }}</dd>
          </div>
        </dl>
      </article>
    </div>

    <div class="detail-grid">
      <article class="panel-card">
        <h3>Event types</h3>
        <div class="event-rows">
          <div v-for="[eventType, count] in eventTypeRows" :key="eventType" class="event-row">
            <span>{{ labelEventType(eventType) }}</span>
            <strong>{{ count }}</strong>
          </div>
        </div>
      </article>

      <article class="panel-card">
        <h3>Recent local events</h3>
        <ul v-if="recentEvents.length > 0" class="recent-events">
          <li v-for="event in recentEvents" :key="`${event.timestamp}-${event.event}-${event.trigger}`">
            <strong>{{ labelEventType(event.event) }}</strong>
            <span>{{ event.trigger }}</span>
            <time>{{ formatDate(event.timestamp) }}</time>
          </li>
        </ul>
        <p v-else class="empty-state">No automatic benchmark events have been captured yet.</p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.telemetry-status {
  display: grid;
  gap: 1.25rem;
  margin: 1.5rem 0 2rem;
}

.hero-card,
.metric-card,
.panel-card {
  border: 1px solid rgba(19, 52, 59, 0.12);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 246, 246, 0.98));
  box-shadow: 0 20px 45px rgba(16, 37, 42, 0.08);
}

.hero-card {
  display: flex;
  justify-content: space-between;
  gap: 1.5rem;
  padding: 1.5rem;
}

.eyebrow {
  margin: 0 0 0.4rem;
  color: #8f4b21;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.hero-card h2,
.panel-card h3 {
  margin: 0;
  color: #16343b;
}

.lede,
.metric-meta,
.empty-state,
.load-error,
.path-list dd,
.recent-events span,
.recent-events time,
.panel-card li {
  color: #45616a;
}

.hero-state {
  min-width: 160px;
  padding: 1rem;
  border-radius: 18px;
  background: rgba(22, 52, 59, 0.08);
  display: grid;
  align-content: center;
  gap: 0.25rem;
  text-align: right;
}

.hero-state[data-enabled='true'] {
  background: rgba(47, 112, 87, 0.14);
}

.state-label {
  color: #16343b;
  font-size: 1.4rem;
  font-weight: 700;
  text-transform: uppercase;
}

.state-caption {
  font-size: 0.9rem;
}

.status-grid,
.detail-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.metric-card,
.panel-card {
  padding: 1.2rem;
}

.metric-label {
  margin: 0 0 0.35rem;
  color: #45616a;
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.metric-value {
  margin: 0 0 0.25rem;
  color: #16343b;
  font-size: 1.7rem;
  font-weight: 700;
}

.panel-card ul,
.recent-events,
.path-list {
  margin: 0.85rem 0 0;
  padding: 0;
  list-style: none;
}

.panel-card li + li,
.recent-events li + li,
.path-list div + div,
.event-row + .event-row {
  margin-top: 0.75rem;
}

.path-list dt {
  color: #16343b;
  font-weight: 700;
}

.path-list dd {
  margin: 0.15rem 0 0;
  word-break: break-word;
}

.event-rows {
  margin-top: 0.85rem;
}

.event-row,
.recent-events li {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
}

.recent-events li {
  align-items: baseline;
  flex-wrap: wrap;
}

.load-error {
  margin: 0;
}

@media (max-width: 720px) {
  .hero-card {
    flex-direction: column;
  }

  .hero-state {
    text-align: left;
  }
}
</style>