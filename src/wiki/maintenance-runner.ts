import { executeMaintenanceAction } from './maintenance-actions.js';
import {
  refreshGeneratedWikiDocs,
  writeLatestMaintenanceActionArtifact,
  type MaintenanceActionArtifact
} from './generated-docs.js';
import { appendProjectLog } from './store.js';

export async function runMaintenanceActionAndRefresh(actionId: string): Promise<MaintenanceActionArtifact> {
  const execution = await executeMaintenanceAction(actionId);
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
  if (execution.resultKind !== 'applied-proposal') {
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