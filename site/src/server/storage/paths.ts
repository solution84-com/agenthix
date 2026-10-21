/**
 * Storage paths (ADR-0039)
 * ========================
 * Nested storage keyed by immutable id. Ownership is encoded in the path and the
 * path is DERIVED from (ownerType, ownerId, workspaceId?) — never stored.
 *
 *   {STORAGE_ROOT}/{ownerType-plural}/{ownerId}/files
 *   {STORAGE_ROOT}/{ownerType-plural}/{ownerId}/workspaces/{workspaceId}
 *
 * Names are display labels only (rename-safe). Owner is permanent (move-free).
 *
 * This is now the ONLY place the layout is written down. hq used to keep a copy
 * of it, kept in step by a drift test on each side; hq names a location by its
 * owner and asks the site for everything else, so the copy is gone and the
 * layout lives on the side that has the disk.
 *
 * `LocationRef` is core's and is re-exported rather than redeclared, so the two
 * apps and the wire cannot disagree about the shape of a location.
 */
import path from 'node:path'
import { getSiteRoot } from '../../agents/agentDiskPaths'
import type { WorkspaceOwnerType } from '@prisma/client'
import type { LocationRef } from '@agenthix/core'

export type { LocationRef }

export function getStorageRoot(): string {
  return getSiteRoot()
}

const PLURAL: Record<WorkspaceOwnerType, string> = {
  project: 'projects',
  user: 'users',
}

// ids are system-generated uuids; guard anyway so a crafted id can't escape the root.
function assertSafeId(id: string): void {
  if (!id || id.includes('/') || id.includes('\\') || id.includes('..') || path.isAbsolute(id)) {
    throw new Error(`Unsafe storage id: ${JSON.stringify(id)}`)
  }
}

export function ownerDir(ownerType: WorkspaceOwnerType, ownerId: string): string {
  assertSafeId(ownerId)
  return path.join(getStorageRoot(), PLURAL[ownerType], ownerId)
}

export function locationDir(ref: LocationRef): string {
  const base = ownerDir(ref.ownerType, ref.ownerId)
  if (ref.taskId) {
    // taskId and workspaceId are mutually exclusive — taskId takes precedence
    assertSafeId(ref.taskId)
    return path.join(base, 'tasks', ref.taskId)
  }
  if (ref.workspaceId) {
    assertSafeId(ref.workspaceId)
    return path.join(base, 'workspaces', ref.workspaceId)
  }
  return path.join(base, 'files')
}

/** Returns the host dir for a task's working files, keyed by immutable task id. */
export function getTaskDir(ownerType: WorkspaceOwnerType, ownerId: string, taskId: string): string {
  return locationDir({ ownerType, ownerId, taskId })
}

export function getFilesDir(ownerType: WorkspaceOwnerType, ownerId: string): string {
  return locationDir({ ownerType, ownerId })
}

export function getWorkspaceDir(ws: { ownerType: WorkspaceOwnerType; ownerId: string; id: string }): string {
  return locationDir({ ownerType: ws.ownerType, ownerId: ws.ownerId, workspaceId: ws.id })
}

/**
 * A person's own area inside a project (close-out spec §6.1) — their drafts and
 * their agenda. A project is shared storage, and this is that person's folder on
 * it: visible to the project like everything else there, so someone who wants
 * something private works in their own storage instead.
 *
 * The run mounts the `members/` ROOT, exactly as it mounts the `tasks/` root, so
 * a person's area is a path inside the run's mounts rather than a bind of its
 * own — which also keeps the mount set a function of the owner alone (ADR-0057).
 */
export function getMemberDir(projectId: string, userId: string): string {
  assertSafeId(userId)
  return path.join(ownerDir('project', projectId), 'members', userId)
}

/**
 * An owner's knowledge: the notes every agent running in that owner's storage
 * reads. A sibling of `files/` and `artefacts/`, mounted whole into a run.
 */
export function getKnowledgeDir(ownerType: WorkspaceOwnerType, ownerId: string): string {
  return path.join(ownerDir(ownerType, ownerId), 'knowledge')
}

/**
 * Where an artefact lives: a file an agent produced for people to read back,
 * kept in the storage of the boundary the work was done for, because that is
 * who it is for. A sibling of `files/` and `knowledge/`, so a run reaches it the
 * same way it reaches the rest of that owner's storage, and hq serves it back
 * addressed by the boundary rather than by whichever agent happened to write it.
 *
 * Each artefact is one file directly in this directory — no folder per set —
 * and hq lists and reads it by its name, for the Artefacts tool and the link an
 * agent's reply makes to it.
 */
export function getArtefactsDir(ownerType: WorkspaceOwnerType, ownerId: string): string {
  return path.join(ownerDir(ownerType, ownerId), 'artefacts')
}
