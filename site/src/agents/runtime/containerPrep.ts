/** Resolves the agent's Docker container for a run: computes mounts and calls agentContainerManager.ensureRunning.
 *
 * The owner's full workspace listing is read from site's own Workspace table
 * (workspaceRows.ts) — the row lives here (phase 5c). Container paths are ids
 * (ADR-0074); the project's name, from hq's dispatch context
 * (`ctx.mounts.ownerSlugs`), and each workspace's, from that listing, reach
 * the agent only as descriptions in its prompt.
 */
import type { CapabilityRunner, RunContextPayload } from '@agenthix/core'
import type { SiteRunCredential } from '../../server/modelRelay/runAccess'
import { agentContainerManager } from './AgentContainerManager'
import type { AgentMounts, ContainerContext, ContainerKey, StorageBoundaryKey } from './containerTypes'
import type { LocationRef } from '../../server/storage/paths'
import { listWorkspacesByOwner } from '../../server/storage/workspaceRows'
import { getSiteRoot } from '../agentDiskPaths'
import {
  ownerDisplayName,
  resolveAccessibleLocations,
  resolveBoundaryMount,
  resolvePrimaryContainerDir,
  type StorageOwner,
} from './locationResolver'
import { runHasWriteTools, type RunWritePermissions } from './toolPermissions'
import { assertRunnerFitsKey } from './harnessHomes'
import { codeWorkspaceMounts, copyContainerDir } from './codeWorkspaceMounts'

/**
 * Which container a run gets: the storage it works in, the mode that storage
 * is bound in, and who is running (ADR-0074). Exported because `runLaunch`
 * needs the same key before it knows whether a container will be built at
 * all: the harness home a run stages its skills into is keyed by this, and
 * dev mode (no container isolation) still has a home even though it has no
 * container — so the key cannot be something only `prepareAgentContainer`
 * computes.
 *
 * The runner is the VERIFIED capability's (`requireRunnerForBoundary`), never
 * anything from the dispatch payload: it decides whose private home is
 * mounted.
 */
export function resolveContainerKey(
  primaryLoc: LocationRef,
  permissions: RunWritePermissions,
  /** The verified capability's runner (`requireRunnerForBoundary`). */
  runner: CapabilityRunner,
): ContainerKey {
  const mode: 'rw' | 'ro' = runHasWriteTools(permissions) ? 'rw' : 'ro'
  const key: StorageBoundaryKey = { scope: 'storage', ownerType: primaryLoc.ownerType, ownerId: primaryLoc.ownerId, mode, runner }
  assertRunnerFitsKey(key)
  return key
}

/**
 * Prepares the Docker container for an agent run.
 *
 * ADR-0074: the container belongs to one storage location and one runner — a
 * person, or the project itself — for its whole life, and is never rebound.
 * The key handed to ensureRunning is that location, the runner and the mode;
 * the agent, the session and the task are context and ride as labels. Every
 * session one runner has in one location shares its container; another runner,
 * or another owner, gets a different one rather than a remount.
 *
 * The container binds the OWNER's whole folder once (ADR-0079) — its files, every
 * one of its workspaces, and (for a project) its tasks and
 * members roots — so nothing about this run can widen or narrow it, and a
 * workspace created while the container runs appears in it. Only the cwd varies
 * per run, and it is a path inside that folder.
 *
 * Spec §6.4 (phase 5d-1): `AgentMounts.locationMode` is 'ro' when the run's
 * effective toolset has no write tools, so a workspace's allowed tools — or the
 * agent's own — bind even a bypassed agent's runtime built-ins, not just
 * its MCP tools. It is read off `key.mode` rather than
 * decided here: `resolveContainerKey` above already made that decision from
 * the VERIFIED capability's effective toolset, and the mode a boundary's
 * storage is bound in and the mode its container is keyed by have to be one
 * decision, not two that agree today.
 *
 * Both sides of the bind are id-keyed (ADR-0074): the container path
 * is the site's own with the site root removed, so a rename moves nothing and
 * the container reveals nothing of where the site keeps its data.
 *
 * Returns the container name when AGENT_CONTAINER_ISOLATION=true, or null in dev mode.
 */
export async function prepareAgentContainer(
  agent: { handle: string; runtime: string },
  session: { id: string; sessionType: string; userId: string | null },
  effectiveTaskId: string | null,
  /** Where the run works. */
  primaryLoc: LocationRef,
  /** hq's pre-resolved dispatch context — the owner's current name. */
  ctx: Pick<RunContextPayload, 'mounts'> & { credential: SiteRunCredential | null },
  /** The container this run belongs to, resolved once by the caller
   *  (`resolveContainerKey`) so the key the home is built from and the key the
   *  container is named for are the same object, not two derivations of it. */
  key: ContainerKey,
  /** A run on a branch's copy: its working folder is the copy (live preview spec, *Where the copy lives*). */
  codeWork: { copyId: string; livePreview?: boolean } | null = null,
  /** Told when the run waits for its container's other runs to end before using it (`bindsDrain.ts`). */
  bindsWait: Pick<ContainerContext, 'onWaitForBinds' | 'stillWanted'> = {},
): Promise<{ containerName: string; mounts: AgentMounts; primaryContainerPath: string } | null> {
  if (process.env.AGENT_CONTAINER_ISOLATION !== 'true') return null

  // Only a chat session's userId is an "invoker" for labeling purposes —
  // task sessions carry a userId too but nobody is actively invoking that run.
  const containerContext = {
    handle: agent.handle,
    runtime: agent.runtime,
    sessionId: session.id,
    invokerUserId: session.sessionType === 'chat' ? session.userId : null,
    taskId: effectiveTaskId,
    credential: ctx.credential,
    codeWork: codeWork !== null,
    ...bindsWait,
  }

  // Read off the key rather than recomputed: `resolveContainerKey` decided it,
  // and the mounts' mode and the container's mode must be one decision.
  const locationMode = key.mode

  const owner: StorageOwner = {
    ownerType: primaryLoc.ownerType,
    ownerId: primaryLoc.ownerId,
    name: ownerDisplayName(primaryLoc, ctx.mounts.ownerSlugs),
  }

  // The owner's workspaces, for their names in the prompt and to check the
  // run's own workspace still exists. Site-local read (Workspace lives here
  // since phase 5c). A store failure propagates and fails the run.
  const ownerWorkspaces = await listWorkspacesByOwner({
    ownerType: owner.ownerType,
    ownerId: owner.ownerId,
    select: 'names',
  }) as { id: string; name: string }[]

  // A primary workspace absent from its own owner's workspaces has been
  // deleted: fail closed, since a run must not work in a path derived from an
  // id nothing backs.
  // A run in a live preview's own copy on another site works there without its workspace, which stays on its own site.
  if (primaryLoc.workspaceId && !codeWork?.livePreview && !ownerWorkspaces.some(ws => ws.id === primaryLoc.workspaceId)) {
    throw new Error(`Workspace ${primaryLoc.workspaceId} no longer exists — cannot work in its path`)
  }

  const boundary = resolveBoundaryMount(owner, getSiteRoot())
  const mounts: AgentMounts = {
    boundary,
    folders: resolveAccessibleLocations(owner, getSiteRoot(), ownerWorkspaces),
    locationMode,
    readOnly: await codeWorkspaceMounts(boundary, ownerWorkspaces),
  }
  const primaryContainerDir = codeWork ? copyContainerDir(boundary, codeWork.copyId) : resolvePrimaryContainerDir(primaryLoc)

  const containerName = await agentContainerManager.ensureRunning(key, containerContext, mounts)

  return { containerName, mounts, primaryContainerPath: primaryContainerDir }
}
