import { executeMaintenanceAction } from './maintenance-actions.js';
import {
  refreshGeneratedWikiDocs,
  writeLatestMaintenanceActionArtifact,
  type MaintenanceActionArtifact
} from './generated-docs.js';
import { appendProjectLog } from './store.js';

export interface RunMaintenanceActionOptions {
  // Only consumed by the edit-page-summary action — bridges the operator-supplied
  // textarea draft from the review board into the action handler. Pass-through-only here.
  summaryDraft?: string;
}

export async function runMaintenanceActionAndRefresh(
  actionId: string,
  options: RunMaintenanceActionOptions = {}
): Promise<MaintenanceActionArtifact> {
  const execution = await executeMaintenanceAction(actionId, options);
  const changedPaths = extractChangedPaths(execution.result);
  const projectLogEntry = buildProjectLogEntry(execution, changedPaths);

  if (projectLogEntry) {
    await appendProjectLog(projectLogEntry);
  }

  const refresh = await refreshGeneratedWikiDocs();

  const artifact: MaintenanceActionArtifact = {
    ranAt: new Date().toISOString(),
    refreshedPageCount: refresh.pageCount,
    audit: {
      artifactPath: 'docs/public/maintenance-action-result.json',
      changedPaths,
      projectLogEntry,
      undoPath: buildUndoPath(changedPaths)
    },
    execution
  };

  await writeLatestMaintenanceActionArtifact(artifact);
  return artifact;
}

function extractChangedPaths(result: unknown): string[] {
  const updatedPaths = (result as { updatedPaths?: unknown }).updatedPaths;
  return Array.isArray(updatedPaths) ? updatedPaths.filter((path): path is string => typeof path === 'string') : [];
}

function buildProjectLogEntry(execution: Awaited<ReturnType<typeof executeMaintenanceAction>>, changedPaths: string[]): string | undefined {
  // Log the action kinds that mutate canonical (committed) project state. We deliberately
  // skip 'snoozed-page-drift' (local-data only — operator workflow noise) and the read-only
  // result kinds; logging those would bloat the project log without adding signal.
  const loggedResultKinds: ReadonlySet<string> = new Set([
    'applied-proposal',
    'inserted-h1',
    'archived-guidance-file',
    'edited-page-summary'
  ]);
  if (!loggedResultKinds.has(execution.resultKind)) {
    return undefined;
  }

  const changedSummary = changedPaths.length > 0 ? ` Changed paths: ${changedPaths.join(', ')}.` : '';
  return `Accepted maintenance action ${execution.actionId}. ${execution.resultSummary}${changedSummary}`;
}

function buildUndoPath(changedPaths: string[]): string {
  if (changedPaths.length === 0) {
    return 'No project files were changed, so no undo path is needed.';
  }

  return `Before committing, inspect git diff for ${changedPaths.join(', ')} and restore those paths from version control if the accepted maintenance action should be undone.`;
}