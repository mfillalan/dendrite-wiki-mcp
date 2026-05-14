---
layout: doc
title: Cortex
---

<script setup>
import CortexView from './.vitepress/theme/components/CortexView.vue';
</script>

# Cortex

The cortex view is the live visualization of the project's cognitive state — every memory, every active goal, every file the brain knows about, rendered as a force-directed graph that breathes as the agent does work. Slice 2c.1 ships the minimal pipeline; subsequent slices add encoding rules (salience radial position, brightness from recall count), per-node drawer with supervision-state controls, autonomous-write animation, time scrubber, and lobe clustering.

<CortexView />

## What this is

- **Goal node** (amber) — the singleton `currentGoal` from ritual state.
- **Memory nodes** (indigo) — every active project-local memory, regardless of kind.
- **File nodes** (green) — any file referenced via `relatedFiles` on a memory.
- **Page nodes** (purple) — any wiki page referenced via `relatedPages`.
- **Edges** — structural connections (memory-to-file, memory-to-page).

Hover any node to see its kind + label.

The data refreshes on demand via the **refresh** button. Live polling + the autonomous-write pulse animation arrive in slice 2c.4.
