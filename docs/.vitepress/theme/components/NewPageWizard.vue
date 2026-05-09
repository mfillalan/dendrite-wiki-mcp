<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

/*
 * New-page wizard — R7 of the retro-editor experiment.
 *
 * A modal that asks for slug, title, owner, and a starter template, then
 * emits a `create` event with the pre-filled markdown. The parent (Layout
 * / NewPageButton) hands the result to WikiEditor.vue, which opens with
 * `initialContent` set so the first save uses the create code path of the
 * write endpoint (no if-match precondition).
 *
 * The wizard inherits the active retro theme via the same CSS variables
 * the editor uses, so it feels like one continuous craft surface.
 */

const emit = defineEmits<{
  close: [];
  create: [{ slug: string; content: string }];
}>();

interface Template {
  id: string;
  label: string;
  description: string;
  build: (params: TemplateParams) => string;
}

interface TemplateParams {
  title: string;
  owner: string;
  isoDate: string;
}

const TEMPLATES: Template[] = [
  {
    id: 'blank',
    label: 'Blank page',
    description: 'Just the frontmatter and an H1. Start from scratch.',
    build: ({ title, owner, isoDate }) => `---
lifecycle: active
owner: ${owner}
last-reviewed: ${isoDate}
source-coverage: partial
---

# ${title}

`
  },
  {
    id: 'architecture',
    label: 'Architecture page',
    description: 'System map, core idea, storage, and request-flow scaffolding.',
    build: ({ title, owner, isoDate }) => `---
lifecycle: active
owner: ${owner}
last-reviewed: ${isoDate}
source-coverage: partial
---

# ${title}

A one-paragraph plain-language summary of what this subsystem is and
the choice driving its shape.

## System Map

| Surface | Purpose | Proof |
|---|---|---|
| (component) | (what it does) | (file or doc reference) |

## Core Idea

The single sentence that, if remembered, reconstructs the rest of the
design.

## Storage Model

What's canonical, what's derived, and how to rebuild the derived bits
when they go stale.

## Request Flow

Walk through the typical operation step by step.

## Open Questions

- (questions the next reader should answer or push on)
`
  },
  {
    id: 'decision-record',
    label: 'Decision record',
    description: 'Context / Decision / Consequences / Status — ADR-style.',
    build: ({ title, owner, isoDate }) => `---
lifecycle: active
owner: ${owner}
last-reviewed: ${isoDate}
source-coverage: partial
---

# ${title}

**Status:** Proposed · **Date:** ${isoDate}

## Context

What forces are at play? What constraints, prior decisions, or recent
incidents shaped this? Keep it factual; save advocacy for the next
section.

## Decision

The choice, stated as a single declarative sentence. Then the
sub-decisions that flow from it.

## Consequences

### Positive
- ...

### Negative
- ...

### Neutral / accepted trade-offs
- ...

## Alternatives Considered

Brief paragraph each on the options that were rejected and why.
`
  },
  {
    id: 'runbook',
    label: 'Runbook',
    description: 'Symptoms / Diagnosis / Remediation / Prevention for an oncall scenario.',
    build: ({ title, owner, isoDate }) => `---
lifecycle: active
owner: ${owner}
last-reviewed: ${isoDate}
source-coverage: partial
---

# ${title}

A one-line statement of the failure mode this runbook is for.

## Symptoms

What an operator or oncall would actually see — alert names, error
messages, dashboard panels going red, customer reports.

## Diagnosis

Concrete commands or queries to confirm the cause and rule out
look-alike issues. Include expected output.

\`\`\`bash
# Example: check the queue depth
# expected output: < 1000
\`\`\`

## Remediation

The actual fix, in order. Mark any step that requires elevated access
or coordination with another team.

1. ...
2. ...

## Verification

How to confirm the system is healthy again.

## Prevention

What change (code, alert, process) would prevent recurrence? Link any
follow-up tickets here.
`
  },
  {
    id: 'troubleshooting',
    label: 'Troubleshooting',
    description: 'Problem / Investigation / Root Cause / Fix narrative.',
    build: ({ title, owner, isoDate }) => `---
lifecycle: active
owner: ${owner}
last-reviewed: ${isoDate}
source-coverage: partial
---

# ${title}

## Problem

What was observed, in concrete terms. When? Where? How was it noticed?

## Investigation

The path the investigator took. What was ruled out and why. Include
dead ends — they save the next investigator from repeating them.

## Root Cause

The actual underlying cause, separated from the proximate trigger.

## Fix

What was changed. Link the commit or PR. If a workaround was applied
first, note it and link the permanent fix.

## Lesson

What pattern, monitoring gap, or assumption let this happen? Worth
promoting to a wiki rule or runbook?
`
  },
  {
    id: 'roadmap',
    label: 'Roadmap',
    description: 'Goal / Build Order / Status Tracker / Open Questions for a multi-slice plan.',
    build: ({ title, owner, isoDate }) => `---
lifecycle: active
owner: ${owner}
last-reviewed: ${isoDate}
source-coverage: partial
---

# ${title}

One paragraph: what this roadmap is tracking and the decision driving
the build order.

## Goal

What "done" looks like in plain terms. Avoid scope creep here — this
is the north star, not the feature list.

## Build Order

Each slice should be independently shippable. The branch can merge at
any slice boundary.

### S1: First slice

**What it is:** ...

**Why it matters first:** ...

**Acceptance:** ...

### S2: Second slice

...

## Open Questions

- ...

## Status Tracker

| Slice | Status | Notes |
|---|---|---|
| S1: ... | Planned | |
| S2: ... | Planned | |
`
  }
];

const slug = ref('');
const title = ref('');
const owner = ref('');
const selectedTemplate = ref<string>('blank');
const errorMessage = ref('');

const slugError = computed(() => {
  const value = slug.value.trim();
  if (!value) return '';
  if (!/^[a-z0-9][a-z0-9/_-]*$/.test(value)) {
    return 'Slug must be lowercase, start with a letter or digit, and use only [a-z0-9/_-].';
  }
  return '';
});

const canSubmit = computed(() => {
  return slug.value.trim() !== ''
    && title.value.trim() !== ''
    && owner.value.trim() !== ''
    && !slugError.value;
});

function autoSlugFromTitle(): void {
  if (slug.value) return;
  slug.value = title.value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

function submit(): void {
  if (!canSubmit.value) return;
  const tpl = TEMPLATES.find((t) => t.id === selectedTemplate.value) ?? TEMPLATES[0];
  const isoDate = new Date().toISOString().slice(0, 10);
  const content = tpl.build({
    title: title.value.trim(),
    owner: owner.value.trim(),
    isoDate
  });
  emit('create', { slug: slug.value.trim(), content });
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    emit('close');
  }
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown);
  // Pre-fill owner from localStorage if the operator has used the wizard
  // before — small QoL touch, no privacy implication (local only).
  try {
    const remembered = localStorage.getItem('dendrite-new-page-owner');
    if (remembered) owner.value = remembered;
  } catch {
    /* localStorage unavailable */
  }
});

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown);
});

function rememberOwner(): void {
  try {
    if (owner.value.trim()) {
      localStorage.setItem('dendrite-new-page-owner', owner.value.trim());
    }
  } catch {
    /* localStorage unavailable */
  }
}
</script>

<template>
  <div class="dendrite-wizard" role="dialog" aria-modal="true" aria-label="Create a new wiki page">
    <div class="dendrite-wizard__card">
      <header class="dendrite-wizard__header">
        <h2>New wiki page</h2>
        <p>Pick a starter template and enter the basics. The editor opens with the page pre-filled — first save creates the file.</p>
      </header>

      <div class="dendrite-wizard__body">
        <div class="dendrite-wizard__templates" role="radiogroup" aria-label="Starter template">
          <button
            v-for="t in TEMPLATES"
            :key="t.id"
            type="button"
            role="radio"
            class="dendrite-wizard__template"
            :data-active="selectedTemplate === t.id"
            :aria-checked="selectedTemplate === t.id"
            @click="selectedTemplate = t.id"
          >
            <span class="dendrite-wizard__template-label">{{ t.label }}</span>
            <span class="dendrite-wizard__template-desc">{{ t.description }}</span>
          </button>
        </div>

        <div class="dendrite-wizard__form">
          <label class="dendrite-wizard__field">
            <span class="dendrite-wizard__field-label">Title</span>
            <input
              type="text"
              v-model="title"
              placeholder="e.g. Memory Trails Architecture"
              autofocus
              @blur="autoSlugFromTitle"
            />
          </label>
          <label class="dendrite-wizard__field">
            <span class="dendrite-wizard__field-label">Slug</span>
            <input
              type="text"
              v-model="slug"
              placeholder="e.g. memory-trails-architecture"
            />
            <span v-if="slugError" class="dendrite-wizard__field-error">{{ slugError }}</span>
            <span v-else class="dendrite-wizard__field-hint">
              Saved as <code>docs/wiki/{{ slug || '<slug>' }}.md</code>
            </span>
          </label>
          <label class="dendrite-wizard__field">
            <span class="dendrite-wizard__field-label">Owner</span>
            <input
              type="text"
              v-model="owner"
              placeholder="e.g. Michael Fillalan"
              @blur="rememberOwner"
            />
            <span class="dendrite-wizard__field-hint">Stored in the page frontmatter.</span>
          </label>
        </div>
      </div>

      <p v-if="errorMessage" class="dendrite-wizard__error">{{ errorMessage }}</p>

      <footer class="dendrite-wizard__footer">
        <button
          type="button"
          class="dendrite-wizard__btn"
          @click="emit('close')"
        >
          Cancel (Esc)
        </button>
        <button
          type="button"
          class="dendrite-wizard__btn dendrite-wizard__btn--primary"
          :disabled="!canSubmit"
          @click="submit"
        >
          Open in editor →
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.dendrite-wizard {
  position: fixed;
  inset: 0;
  z-index: 5000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
  background: rgba(0, 0, 0, 0.55);
  font-family: var(--vp-font-family-mono, monospace);
}

.dendrite-wizard__card {
  width: min(720px, 100%);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.32);
  overflow: hidden;
  color: var(--vp-c-text-1);
}

.dendrite-wizard__header {
  padding: 1rem 1.4rem 0.6rem;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
}

.dendrite-wizard__header h2 {
  margin: 0 0 0.3rem 0;
  font-size: 1.1rem;
  color: var(--vp-c-brand-1);
  letter-spacing: 0.02em;
}

.dendrite-wizard__header p {
  margin: 0 0 0.4rem 0;
  font-size: 0.84rem;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

.dendrite-wizard__body {
  flex: 1;
  overflow: auto;
  padding: 1rem 1.4rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.2rem;
}

@media (min-width: 720px) {
  .dendrite-wizard__body {
    grid-template-columns: 1fr 1fr;
  }
}

.dendrite-wizard__templates {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.dendrite-wizard__template {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  padding: 0.55rem 0.7rem;
  text-align: left;
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  border-radius: 4px;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;
  font-family: inherit;
}

.dendrite-wizard__template:hover {
  background: var(--vp-c-default-soft);
  border-color: var(--vp-c-brand-3);
}

.dendrite-wizard__template[data-active='true'] {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.dendrite-wizard__template-label {
  font-size: 0.85rem;
  font-weight: 600;
}

.dendrite-wizard__template-desc {
  font-size: 0.74rem;
  color: var(--vp-c-text-3);
  line-height: 1.4;
}

.dendrite-wizard__template[data-active='true'] .dendrite-wizard__template-desc {
  color: var(--vp-c-text-2);
}

.dendrite-wizard__form {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.dendrite-wizard__field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.dendrite-wizard__field-label {
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--vp-c-text-3);
}

.dendrite-wizard__field input {
  border: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg);
  color: var(--vp-c-text-1);
  padding: 0.45rem 0.6rem;
  font-family: inherit;
  font-size: 0.88rem;
  border-radius: 3px;
  transition: border-color 120ms ease;
}

.dendrite-wizard__field input:focus {
  outline: none;
  border-color: var(--vp-c-brand-1);
}

.dendrite-wizard__field-hint {
  font-size: 0.72rem;
  color: var(--vp-c-text-3);
}

.dendrite-wizard__field-hint code {
  background: var(--vp-c-default-soft);
  padding: 0.05rem 0.3rem;
  border-radius: 2px;
  font-family: var(--vp-font-family-mono, monospace);
}

.dendrite-wizard__field-error {
  font-size: 0.72rem;
  color: var(--vp-c-warning-1, #b54728);
}

.dendrite-wizard__error {
  margin: 0 1.4rem 0.5rem;
  padding: 0.5rem 0.7rem;
  background: color-mix(in srgb, var(--vp-c-warning-1, #b54728) 12%, transparent);
  border: 1px solid var(--vp-c-warning-1, #b54728);
  color: var(--vp-c-warning-1, #b54728);
  border-radius: 4px;
  font-size: 0.82rem;
}

.dendrite-wizard__footer {
  padding: 0.8rem 1.4rem;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-alt);
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

.dendrite-wizard__btn {
  border: 1px solid var(--vp-c-divider);
  background: transparent;
  color: var(--vp-c-text-1);
  padding: 0.45rem 0.9rem;
  font-family: inherit;
  font-size: 0.84rem;
  letter-spacing: 0.04em;
  cursor: pointer;
  border-radius: 3px;
  transition: background 120ms ease, border-color 120ms ease;
}

.dendrite-wizard__btn:hover:not(:disabled) {
  background: var(--vp-c-default-soft);
  border-color: var(--vp-c-brand-3);
}

.dendrite-wizard__btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.dendrite-wizard__btn--primary {
  background: var(--vp-c-brand-soft);
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

.dendrite-wizard__btn--primary:hover:not(:disabled) {
  background: color-mix(in srgb, var(--vp-c-brand-1) 25%, transparent);
}
</style>
