/**
 * The workspace an agent's workflow run acts on, or a proposal is read from. An agent's run reaches every workspace
 * of its boundary, so `run_workflow` and `propose_workflow` name one, by name or id; only the boundary's own workspaces can be named. Unnamed, it is the run's
 * own workspace, else the boundary's only one; a boundary with several must name one, and one with none runs on the
 * boundary's own files.
 */
import type { WorkflowRunWorkspace } from '@agenthix/core'
import { ControlPlaneError } from '../server/controlplane/types'
import { resolveStorageSite } from '../storage/storageSite'
import { listWorkspacesByOwner } from '../storage/workspaceStore'

type Named = { id: string; name: string }

export type RunWorkspaceDeps = { workspacesOf(workspace: WorkflowRunWorkspace): Promise<Named[]> }

const deps: RunWorkspaceDeps = {
  async workspacesOf(w) {
    const siteId = await resolveStorageSite({ ownerType: w.ownerType, ownerId: w.ownerId, workspaceId: null })
    return listWorkspacesByOwner(siteId, w.ownerType, w.ownerId, 'names')
  },
}

const listed = (all: Named[]) => all.map((w) => `"${w.name}"`).join(', ')

export async function chooseRunWorkspace(
  run: WorkflowRunWorkspace, named: string | undefined, d: RunWorkspaceDeps = deps,
): Promise<WorkflowRunWorkspace> {
  const wanted = named?.trim()
  if (!wanted && run.workspaceId) return run
  const all = await d.workspacesOf(run)
  if (!wanted) {
    if (all.length === 0) return run
    if (all.length === 1) return { ...run, workspaceId: all[0].id }
    throw new ControlPlaneError('invalid', `Name the workspace to run on: this place has ${listed(all)}`)
  }
  const byId = all.find((w) => w.id === wanted)
  if (byId) return { ...run, workspaceId: byId.id }
  const byName = all.filter((w) => w.name.toLowerCase() === wanted.toLowerCase())
  if (byName.length === 1) return { ...run, workspaceId: byName[0].id }
  if (byName.length > 1) throw new ControlPlaneError('invalid', `More than one workspace is called "${wanted}"; pass its id instead`)
  throw new ControlPlaneError('not_found', all.length
    ? `This place has no workspace "${wanted}". Its workspaces are ${listed(all)}`
    : `This place has no workspaces, so there is no "${wanted}"`)
}
