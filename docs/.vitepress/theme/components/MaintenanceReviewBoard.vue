<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

interface MaintenanceActionHint {
  id: string;
  kind: string;
  label: string;
  tool: string;
  arguments: Record<string, string>;
  available: boolean;
  reason?: string;
}

interface MaintenanceInboxSnapshot {
  status: {
    proposalCount: number;
    lintFindingCount: number;
    proposalGroups: Array<{ kind: string; count: number }>;
    lintRuleGroups: Array<{ bucket: string; bucketTitle: string; rule: string; count: number }>;
  };
  nextSteps: string[];
  proposals: Array<{
    kind: string;
    count: number;
    items: Array<{
      summary: string;
      currentStateSummary: string;
      afterApplySummary: string;
      reviewSlug: string;
      reviewPath: string;
      reviewPageExists: boolean;
      actions: MaintenanceActionHint[];
    }>;
  }>;
  lintBuckets: Array<{
    bucket: string;
    bucketTitle: string;
    count: number;
    rules: Array<{
      rule: string;
      count: number;
      items: Array<{
        slug: string;
        path: string;
        message: string;
        actions: MaintenanceActionHint[];
      }>;
    }>;
  }>;
}

interface MaintenanceActionArtifact {
  ranAt: string;
  refreshedPageCount: number;
  execution: {
    actionId: string;
    resultKind: string;
    resultSummary: string;
  };
}

const inbox = ref<MaintenanceInboxSnapshot | null>(null);
const latestAction = ref<MaintenanceActionArtifact | null>(null);
const loadError = ref('');

const statusCards = computed(() => {
  if (!inbox.value) {
    return [];
  }

  return [
    {
      label: 'Active proposals',
      value: inbox.value.status.proposalCount,
      detail: renderCountList(inbox.value.status.proposalGroups, (group) => group.kind)
    },
    {
      label: 'Active lint findings',
      value: inbox.value.status.lintFindingCount,
      detail: renderCountList(inbox.value.status.lintRuleGroups, (group) => group.rule)
    }
  ];
});

onMounted(async () => {
  try {
    const response = await fetch('/maintenance-inbox.json');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    inbox.value = (await response.json()) as MaintenanceInboxSnapshot;
  } catch (error) {
    loadError.value = error instanceof Error ? error.message : 'Unknown error';
  }

  try {
    const response = await fetch('/maintenance-action-result.json');
    if (!response.ok) {
      if (response.status === 404) {
        return;
      }

      throw new Error(`HTTP ${response.status}`);
    }

    latestAction.value = (await response.json()) as MaintenanceActionArtifact;
  } catch {
    latestAction.value = null;
  }
});

function renderArguments(argumentsObject: Record<string, string>): string {
  return JSON.stringify(argumentsObject, null, 2);
}

function renderRunnerCommand(actionId: string): string {
  return `npm run wiki:action -- "${actionId}"`;
}

function renderCountList<T extends { count: number }>(items: T[], label: (item: T) => string): string {
  if (items.length === 0) {
    return 'None';
  }

  return items.map((item) => `${label(item)} (${item.count})`).join(', ');
}
</script>

<template>
  <div class="maintenance-review-board">
    <p class="intro">
      This board reads the generated inbox snapshot from <code>/maintenance-inbox.json</code>. It is a real browser consumer of the maintenance data, but it stays read-only because the docs site cannot call the local stdio MCP server directly.
    </p>

    <div v-if="loadError" class="state-card error-card">
      <strong>Snapshot load failed.</strong>
      <p>{{ loadError }}</p>
    </div>

    <div v-else-if="!inbox" class="state-card">
      <strong>Loading maintenance snapshot...</strong>
    </div>

    <template v-else>
      <section v-if="latestAction" class="section-block">
        <div class="section-header">
          <h2>Latest Local Action</h2>
          <p>{{ latestAction.ranAt }}</p>
        </div>
        <article class="state-card latest-action-card">
          <p><strong>Action ID:</strong> {{ latestAction.execution.actionId }}</p>
          <p><strong>Result:</strong> {{ latestAction.execution.resultSummary }}</p>
          <p><strong>Result kind:</strong> {{ latestAction.execution.resultKind }}</p>
          <p><strong>Board refresh:</strong> Updated generated docs with {{ latestAction.refreshedPageCount }} catalog pages.</p>
        </article>
      </section>

      <section class="status-grid">
        <article v-for="card in statusCards" :key="card.label" class="status-card">
          <p class="eyebrow">{{ card.label }}</p>
          <p class="metric">{{ card.value }}</p>
          <p class="detail">{{ card.detail }}</p>
        </article>
      </section>

      <section class="section-block">
        <h2>What To Do Next</h2>
        <ul>
          <li v-for="step in inbox.nextSteps" :key="step">{{ step }}</li>
        </ul>
      </section>

      <section class="section-block">
        <div class="section-header">
          <h2>Proposal Queue</h2>
          <p>{{ inbox.status.proposalCount }} total</p>
        </div>

        <div v-if="inbox.proposals.length === 0" class="state-card">
          No active proposals.
        </div>

        <div v-else class="group-stack">
          <article v-for="group in inbox.proposals" :key="group.kind" class="group-card">
            <div class="section-header">
              <h3>{{ group.kind }}</h3>
              <p>{{ group.count }}</p>
            </div>

            <article v-for="item in group.items" :key="item.reviewSlug" class="entry-card">
              <div class="entry-header">
                <div>
                  <h4>{{ item.summary }}</h4>
                  <p class="path-line">{{ item.reviewPath }}</p>
                </div>
                <span class="chip" :class="item.reviewPageExists ? 'chip-ready' : 'chip-pending'">
                  {{ item.reviewPageExists ? 'Review page ready' : 'Review page not generated' }}
                </span>
              </div>

              <div class="entry-copy">
                <p><strong>Current:</strong> {{ item.currentStateSummary }}</p>
                <p><strong>After apply:</strong> {{ item.afterApplySummary }}</p>
              </div>

              <div class="action-grid">
                <article v-for="action in item.actions" :key="action.id" class="action-card">
                  <div class="entry-header">
                    <strong>{{ action.label }}</strong>
                    <span class="chip" :class="action.available ? 'chip-ready' : 'chip-pending'">
                      {{ action.available ? 'Available' : 'Unavailable' }}
                    </span>
                  </div>
                  <p class="code-label">Action ID</p>
                  <pre>{{ action.id }}</pre>
                  <p class="code-label">Local runner</p>
                  <pre>{{ renderRunnerCommand(action.id) }}</pre>
                  <p class="code-label">Tool</p>
                  <pre>{{ action.tool }}</pre>
                  <p class="code-label">Arguments</p>
                  <pre>{{ renderArguments(action.arguments) }}</pre>
                  <p v-if="action.reason" class="reason">{{ action.reason }}</p>
                </article>
              </div>
            </article>
          </article>
        </div>
      </section>

      <section class="section-block">
        <div class="section-header">
          <h2>Lint Queue</h2>
          <p>{{ inbox.status.lintFindingCount }} total</p>
        </div>

        <div v-if="inbox.lintBuckets.length === 0" class="state-card">
          No active lint findings.
        </div>

        <div v-else class="group-stack">
          <article v-for="bucket in inbox.lintBuckets" :key="bucket.bucket" class="group-card">
            <div class="section-header">
              <h3>{{ bucket.bucketTitle }}</h3>
              <p>{{ bucket.count }}</p>
            </div>

            <article v-for="rule in bucket.rules" :key="rule.rule" class="entry-card">
              <div class="section-header compact-header">
                <h4>{{ rule.rule }}</h4>
                <p>{{ rule.count }}</p>
              </div>

              <article v-for="item in rule.items" :key="`${rule.rule}:${item.path}`" class="finding-card">
                <div class="entry-copy">
                  <p class="path-line">{{ item.path }}</p>
                  <p>{{ item.message }}</p>
                </div>

                <div class="action-grid">
                  <article v-for="action in item.actions" :key="action.id" class="action-card">
                    <div class="entry-header">
                      <strong>{{ action.label }}</strong>
                      <span class="chip" :class="action.available ? 'chip-ready' : 'chip-pending'">
                        {{ action.available ? 'Available' : 'Unavailable' }}
                      </span>
                    </div>
                    <p class="code-label">Action ID</p>
                    <pre>{{ action.id }}</pre>
                    <p class="code-label">Local runner</p>
                    <pre>{{ renderRunnerCommand(action.id) }}</pre>
                    <p class="code-label">Tool</p>
                    <pre>{{ action.tool }}</pre>
                    <p class="code-label">Arguments</p>
                    <pre>{{ renderArguments(action.arguments) }}</pre>
                    <p v-if="action.reason" class="reason">{{ action.reason }}</p>
                  </article>
                </div>
              </article>
            </article>
          </article>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.maintenance-review-board {
  display: grid;
  gap: 1.5rem;
}

.intro {
  margin: 0;
  color: var(--vp-c-text-2);
}

.status-grid {
  display: grid;
  gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.status-card,
.state-card,
.group-card,
.entry-card,
.action-card,
.finding-card {
  border: 1px solid var(--vp-c-divider);
  border-radius: 18px;
  background: linear-gradient(180deg, color-mix(in srgb, var(--vp-c-bg-soft) 82%, white 18%), var(--vp-c-bg-soft));
}

.status-card,
.state-card,
.action-card,
.finding-card {
  padding: 1rem;
}

.group-card,
.entry-card {
  padding: 1.25rem;
}

.error-card {
  border-color: color-mix(in srgb, #c0392b 45%, var(--vp-c-divider));
}

.eyebrow,
.code-label,
.detail,
.path-line {
  margin: 0;
}

.eyebrow,
.code-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--vp-c-text-3);
}

.metric {
  margin: 0.35rem 0;
  font-size: 2.4rem;
  font-weight: 700;
  line-height: 1;
}

.detail,
.path-line,
.reason,
.latest-action-card > p,
.section-header > p,
.entry-copy > p {
  color: var(--vp-c-text-2);
}

.section-block,
.group-stack,
.action-grid {
  display: grid;
  gap: 1rem;
}

.section-header,
.entry-header {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
  justify-content: space-between;
}

.compact-header {
  margin-bottom: 1rem;
}

.section-header h2,
.section-header h3,
.section-header h4,
.entry-header h4 {
  margin: 0;
}

.group-card > .entry-card + .entry-card,
.entry-card > .finding-card + .finding-card {
  margin-top: 1rem;
}

.entry-copy {
  display: grid;
  gap: 0.5rem;
  margin: 1rem 0;
}

.chip {
  flex: none;
  border-radius: 999px;
  padding: 0.3rem 0.7rem;
  font-size: 0.8rem;
  font-weight: 600;
}

.chip-ready {
  background: color-mix(in srgb, #2e8b57 18%, transparent);
  color: #246947;
}

.chip-pending {
  background: color-mix(in srgb, #c97818 18%, transparent);
  color: #9a5e18;
}

.action-grid {
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

pre {
  margin: 0.4rem 0 0;
  white-space: pre-wrap;
  word-break: break-word;
}

@media (max-width: 640px) {
  .section-header,
  .entry-header {
    flex-direction: column;
  }

  .chip {
    align-self: flex-start;
  }
}
</style>