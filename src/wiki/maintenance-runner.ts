import { executeMaintenanceAction } from './maintenance-actions.js';
import {
  refreshGeneratedWikiDocs,
  writeLatestMaintenanceActionArtifact,
  type MaintenanceActionArtifact
} from './generated-docs.js';

export async function runMaintenanceActionAndRefresh(actionId: string): Promise<MaintenanceActionArtifact> {
  const execution = await executeMaintenanceAction(actionId);
  const refresh = await refreshGeneratedWikiDocs();

  const artifact: MaintenanceActionArtifact = {
    ranAt: new Date().toISOString(),
    refreshedPageCount: refresh.pageCount,
    execution
  };

  await writeLatestMaintenanceActionArtifact(artifact);
  return artifact;
}