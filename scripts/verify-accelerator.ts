#!/usr/bin/env tsx
/**
 * Manual verification script for the First-Session Accelerator.
 *
 * Run with:
 *   npx tsx scripts/verify-accelerator.ts
 *
 * It will:
 * 1. Create a fresh temporary project
 * 2. Run `dendrite-wiki init --mode built`
 * 3. Call wiki_context directly
 * 4. Print whether the bootstrapProtocol and foundation skills appear
 *
 * This is the concrete "manual dogfood" step from the approved plan.
 */

import { promises as fs } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), '..');

async function main() {
  console.log('=== First-Session Accelerator Manual Verification ===\n');

  const tempRoot = await mkdtemp(path.join(tmpdir(), 'dendrite-accelerator-verify-'));
  console.log(`Created fresh temp project: ${tempRoot}`);

  try {
    // 1. Basic npm init
    execSync('npm init -y', { cwd: tempRoot, stdio: 'ignore' });

    // 2. Run the built CLI (this is what users do after `npm install --save-dev`)
    const cliPath = path.join(repoRoot, 'dist', 'src', 'cli.js');
    console.log('\nRunning: dendrite-wiki init --mode built --profile claude');
    execSync(`node "${cliPath}" init --mode built --profile claude`, {
      cwd: tempRoot,
      stdio: 'pipe',
    });

    // 3. Load the wiki store from source and call buildWikiContext
    // We chdir so the store reads the fresh project
    const previousCwd = process.cwd();
    process.chdir(tempRoot);

    const store = await import(path.join(repoRoot, 'packages', 'wiki', 'src', 'store.ts'));

    const context = await store.buildWikiContext('add user authentication with JWT', {
      maxPages: 5,
      maxSkills: 5,
    });

    process.chdir(previousCwd);

    // 4. Verify the accelerator behavior
    console.log('\n--- Verification Results ---');

    const hasProtocol = !!context.bootstrapProtocol;
    console.log(`bootstrapProtocol present: ${hasProtocol ? 'YES ✓' : 'NO ✗'}`);

    if (hasProtocol) {
      console.log(`  Title: ${context.bootstrapProtocol.title}`);
      console.log(`  Number of steps: ${context.bootstrapProtocol.steps.length}`);
      console.log(`  Has good examples: ${context.bootstrapProtocol.goodFirstMemoryExamples.length > 0}`);
    }

    const hasFoundationSkills = context.skills.some((s: any) =>
      s.id?.startsWith('foundation:') || (s.summary?.toLowerCase().includes('causal'))
    );
    console.log(`Foundation skills surfaced: ${hasFoundationSkills ? 'YES ✓' : 'NO ✗'}`);

    const protocolInBriefing = context.briefing.includes('Project Bootstrap Protocol');
    console.log(`Protocol appears in briefing text: ${protocolInBriefing ? 'YES ✓' : 'NO ✗'}`);

    const success = hasProtocol && hasFoundationSkills && protocolInBriefing;

    console.log('\n' + (success
      ? '✅ First-Session Accelerator is working correctly on a brand-new project.'
      : '❌ Something is not behaving as expected.'));

    console.log(`\nTemp project left at: ${tempRoot}`);
    console.log('You can inspect docs/project-plan.md, docs/wiki/architecture.md, etc.');

    process.exit(success ? 0 : 1);

  } catch (error: any) {
    console.error('\nVerification script failed:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();