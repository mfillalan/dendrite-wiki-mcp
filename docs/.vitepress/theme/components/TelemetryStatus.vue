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
    uploadAuditPath: string;
    benchmarkEventLogPath: string;
    benchmarkEventSummaryPath: string;
  };
  remoteUpload: {
    configured: boolean;
    destination: string | null;
    auditPath: string;
    lastAttemptAt: string | null;
    lastAttemptStatus: 'success' | 'error' | 'skipped' | null;
    lastSuccessAt: string | null;
    lastError: string | null;
    lastPayloadPreview: Record<string, unknown> | null;
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
    uploadAuditPath: 'local-data/telemetry-upload-audit.json',
    benchmarkEventLogPath: 'local-data/benchmark-events.jsonl',
    benchmarkEventSummaryPath: 'docs/public/dendrite-benchmark-events-summary.json'
  },
  remoteUpload: {
    configured: false,
    destination: null,
    auditPath: 'local-data/telemetry-upload-audit.json',
    lastAttemptAt: null,
    lastAttemptStatus: null,
    lastSuccessAt: null,
    lastError: null,
    lastPayloadPreview: null
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

// T9: when the review bridge is mounted as VitePress middleware (the typical case
// during `npm run docs:dev`), interactive controls become available. When users
// browse a static build, the bridge endpoints 404 and we fall back to read-only
// display with CLI instructions. `bridgeAvailable` is detected at mount.
const bridgeAvailable = ref(false);
type ConsentBusyAction = 'opt-in' | 'opt-out' | 'upload' | null;
const consentBusy = ref<ConsentBusyAction>(null);
const consentMessage = ref('');
const consentMessageKind = ref<'success' | 'error' | ''>('');

const sharingHeadline = computed(() => (status.value.sharingEnabled ? 'Opt-in sharing enabled' : 'Local-only telemetry'));
const consentLabel = computed(() => (status.value.consent.isExplicit ? 'Explicitly chosen' : 'Default state'));
const capturedEventCount = computed(() => eventSummary.value?.eventCount ?? status.value.benchmarkEvents.eventCount);
const eventTypeRows = computed(() => Object.entries(eventSummary.value?.byType ?? status.value.benchmarkEvents.byType));
const recentEvents = computed(() => eventSummary.value?.recentEvents.slice().reverse().slice(0, 5) ?? []);
const lastPayloadPreview = computed(() =>
  status.value.remoteUpload.lastPayloadPreview ? JSON.stringify(status.value.remoteUpload.lastPayloadPreview, null, 2) : ''
);

async function refreshStatusFromStatic(cacheBust: number): Promise<void> {
  try {
    const response = await fetch(`/dendrite-telemetry-status.json?t=${cacheBust}`);
    if (response.ok) {
      status.value = (await response.json()) as DendriteTelemetryStatusArtifact;
    }
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unable to load telemetry status artifact.';
  }
}

async function probeBridge(): Promise<void> {
  // GET /telemetry/status returns the writeTelemetryStatusArtifact() payload when the
  // bridge is mounted as VitePress middleware (same-origin, no token needed). Any other
  // response (404 static-build, 401 token-auth-required, etc.) keeps us in read-only mode.
  try {
    const response = await fetch('/__review-bridge/telemetry/status', { method: 'GET' });
    if (response.ok) {
      const body = (await response.json()) as { status: DendriteTelemetryStatusArtifact };
      if (body && typeof body === 'object' && 'status' in body) {
        status.value = body.status;
        bridgeAvailable.value = true;
      }
    }
  } catch {
    // Network error → no bridge available, read-only mode stays on.
  }
}

onMounted(async () => {
  const cacheBust = Date.now();
  await probeBridge();
  if (!bridgeAvailable.value) {
    await refreshStatusFromStatic(cacheBust);
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

function setConsentMessage(text: string, kind: 'success' | 'error'): void {
  consentMessage.value = text;
  consentMessageKind.value = kind;
}

async function postBridgeAction(action: Exclude<ConsentBusyAction, null>): Promise<void> {
  if (consentBusy.value || !bridgeAvailable.value) return;
  consentBusy.value = action;
  consentMessage.value = '';
  consentMessageKind.value = '';

  try {
    if (action === 'opt-in' || action === 'opt-out') {
      const endpoint = action === 'opt-in' ? '/__review-bridge/telemetry/opt-in' : '/__review-bridge/telemetry/opt-out';
      const response = await fetch(endpoint, { method: 'POST' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error((body as { message?: string }).message ?? `Bridge returned HTTP ${response.status}`);
      }
      const payload = body as { status?: DendriteTelemetryStatusArtifact };
      if (payload.status) status.value = payload.status;
      setConsentMessage(
        action === 'opt-in'
          ? 'Sharing consent recorded as opt-in. Click "Upload latest snapshot" when you want to send a sanitized summary.'
          : 'Sharing turned off. Local benchmark artifacts continue to work; no upload will happen.',
        'success'
      );
    } else if (action === 'upload') {
      const response = await fetch('/__review-bridge/telemetry/upload', { method: 'POST' });
      const body = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        status?: DendriteTelemetryStatusArtifact;
      };
      if (!response.ok && response.status >= 500) {
        throw new Error(body.message ?? `Bridge returned HTTP ${response.status}`);
      }
      if (body.status) status.value = body.status;
      setConsentMessage(body.message ?? 'Upload completed.', body.ok === false ? 'error' : 'success');
    }
  } catch (error) {
    setConsentMessage(
      error instanceof Error ? error.message : 'Unknown error talking to the review bridge.',
      'error'
    );
  } finally {
    consentBusy.value = null;
  }
}

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

    <article class="consent-card">
      <div class="consent-headline">
        <h3>{{ status.sharingEnabled ? 'You are sharing sanitized aggregate counters' : 'Opt in to share sanitized aggregate counters' }}</h3>
        <p class="consent-blurb">
          Wiki page content, source code, prompts, file names, and secrets never leave your machine.
          The shared payload is a small JSON object — random local UUIDs, package version, event counts.
          You can opt out at any time and the local benchmark report keeps working unchanged.
          See <a href="/wiki/privacy-telemetry-disclosure">Privacy &amp; Telemetry Disclosure</a> for the exact field-by-field contract.
        </p>
      </div>

      <div v-if="bridgeAvailable" class="consent-controls">
        <button
          v-if="!status.sharingEnabled"
          type="button"
          class="consent-button consent-button--primary"
          :disabled="consentBusy !== null"
          @click="postBridgeAction('opt-in')"
        >
          {{ consentBusy === 'opt-in' ? 'Recording…' : 'Opt in to sharing' }}
        </button>
        <template v-else>
          <button
            type="button"
            class="consent-button consent-button--primary"
            :disabled="consentBusy !== null"
            @click="postBridgeAction('upload')"
          >
            {{ consentBusy === 'upload' ? 'Uploading…' : 'Upload latest snapshot' }}
          </button>
          <button
            type="button"
            class="consent-button consent-button--ghost"
            :disabled="consentBusy !== null"
            @click="postBridgeAction('opt-out')"
          >
            {{ consentBusy === 'opt-out' ? 'Stopping…' : 'Stop sharing' }}
          </button>
        </template>
      </div>

      <p v-else class="consent-fallback">
        Browser controls require the dev server (<code>npm run docs:dev</code>). For a static-built page,
        manage consent from a terminal:
        <code>dendrite-wiki telemetry opt-in</code>,
        <code>dendrite-wiki telemetry upload</code>,
        <code>dendrite-wiki telemetry opt-out</code>.
      </p>

      <p
        v-if="consentMessage"
        class="consent-message"
        :data-kind="consentMessageKind || 'success'"
      >{{ consentMessage }}</p>
    </article>

    <div class="status-grid">
      <article class="metric-card">
        <p class="metric-label">Captured local events</p>
        <p class="metric-value">{{ capturedEventCount }}</p>
        <p class="metric-meta">Latest event: {{ formatDate(eventSummary?.recentEvents.at(-1)?.timestamp ?? status.benchmarkEvents.latestEventAt) }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Remote upload</p>
        <p class="metric-value">{{ status.remoteUpload.configured ? 'Configured' : 'Not configured' }}</p>
        <p class="metric-meta">{{ status.remoteUpload.destination ?? 'Set the Supabase env vars to enable upload.' }}</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Consent updated</p>
        <p class="metric-value">{{ formatDate(status.consent.updatedAt) }}</p>
        <p class="metric-meta">Refresh with <code>dendrite-wiki telemetry status</code>.</p>
      </article>
      <article class="metric-card">
        <p class="metric-label">Last upload</p>
        <p class="metric-value">{{ status.remoteUpload.lastAttemptStatus ?? 'none' }}</p>
        <p class="metric-meta">{{ formatDate(status.remoteUpload.lastAttemptAt) }}</p>
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
            <dt>Upload audit</dt>
            <dd>{{ status.paths.uploadAuditPath }}</dd>
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
        <h3>Upload status</h3>
        <dl class="path-list">
          <div>
            <dt>Destination</dt>
            <dd>{{ status.remoteUpload.destination ?? 'Not configured' }}</dd>
          </div>
          <div>
            <dt>Last success</dt>
            <dd>{{ formatDate(status.remoteUpload.lastSuccessAt) }}</dd>
          </div>
          <div>
            <dt>Last error</dt>
            <dd>{{ status.remoteUpload.lastError ?? 'None recorded' }}</dd>
          </div>
        </dl>
      </article>

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

    <article class="panel-card">
      <h3>Last payload preview</h3>
      <p v-if="!status.remoteUpload.lastPayloadPreview" class="empty-state">No sanitized payload has been uploaded yet.</p>
      <pre v-else class="payload-preview">{{ lastPayloadPreview }}</pre>
    </article>
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
.panel-card,
.consent-card {
  border: 1px solid rgba(19, 52, 59, 0.12);
  border-radius: 24px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(241, 246, 246, 0.98));
  box-shadow: 0 20px 45px rgba(16, 37, 42, 0.08);
}

.consent-card {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
}

.consent-headline h3 {
  margin: 0 0 0.4rem;
  color: #16343b;
}

.consent-blurb {
  margin: 0;
  color: #45616a;
  line-height: 1.5;
}

.consent-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.consent-button {
  border: 1px solid rgba(19, 52, 59, 0.16);
  border-radius: 14px;
  padding: 0.7rem 1.2rem;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.08s ease, box-shadow 0.08s ease, background 0.08s ease;
}

.consent-button:disabled {
  opacity: 0.6;
  cursor: progress;
}

.consent-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 8px 18px rgba(16, 37, 42, 0.12);
}

.consent-button--primary {
  background: linear-gradient(180deg, #2f7057 0%, #1f5239 100%);
  border-color: rgba(13, 51, 33, 0.35);
  color: #fff;
}

.consent-button--ghost {
  background: rgba(22, 52, 59, 0.06);
  color: #16343b;
}

.consent-fallback {
  margin: 0;
  color: #45616a;
  line-height: 1.5;
}

.consent-fallback code {
  background: rgba(19, 52, 59, 0.08);
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
}

.consent-message {
  margin: 0;
  padding: 0.7rem 0.9rem;
  border-radius: 12px;
  font-weight: 600;
}

.consent-message[data-kind='success'] {
  background: rgba(47, 112, 87, 0.14);
  color: #1f5239;
}

.consent-message[data-kind='error'] {
  background: rgba(176, 49, 49, 0.14);
  color: #8a2727;
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

.payload-preview {
  margin: 0.85rem 0 0;
  padding: 1rem;
  border-radius: 16px;
  background: rgba(19, 52, 59, 0.06);
  color: #16343b;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
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