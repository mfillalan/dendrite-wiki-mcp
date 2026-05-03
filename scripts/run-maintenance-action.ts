#!/usr/bin/env node
import { executeMaintenanceAction } from '../src/wiki/maintenance-actions.js';
import { refreshGeneratedWikiDocs, writeLatestMaintenanceActionArtifact } from '../src/wiki/generated-docs.js';

const [, , actionId] = process.argv;

if (!actionId) {
  console.error('Usage: npm run wiki:action -- <action-id>');
  process.exit(1);
}

try {
  const execution = await executeMaintenanceAction(actionId);
  const refresh = await refreshGeneratedWikiDocs();
  await writeLatestMaintenanceActionArtifact({
    ranAt: new Date().toISOString(),
    refreshedPageCount: refresh.pageCount,
    execution
  });
  console.log(JSON.stringify(execution, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}