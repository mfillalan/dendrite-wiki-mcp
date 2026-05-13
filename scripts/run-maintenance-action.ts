#!/usr/bin/env node
import { runMaintenanceActionAndRefresh } from '@rarusoft/dendrite-wiki';

const [, , actionId] = process.argv;

if (!actionId) {
  console.error('Usage: npm run wiki:action -- <action-id>');
  process.exit(1);
}

try {
  const artifact = await runMaintenanceActionAndRefresh(actionId);
  console.log(JSON.stringify(artifact.execution, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}