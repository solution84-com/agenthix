/**
 * The folders inside a boundary the site makes, as itself (uid 1001), before `docker run` binds the boundary. If Docker
 * has to make a missing `-v` source or the mount point of a bind nested in another, it makes it root-owned on the
 * machine (Docker Desktop hides this): the agent could not write there, and on Linux the site could not later remove
 * a workspace's folder or make another beside it (EACCES). Made from the boundary's folder down, never through a link
 * a run left (adr-0173).
 */
import path from 'node:path'
import { ensureFoldersUnder } from './homeFolder'
import type { AgentMounts } from './containerTypes'

/** Relative to the boundary's folder: each folder the prompt lists, then each read-only bind's mount point in it. */
export function boundaryFolderPaths(mounts: AgentMounts): string[] {
  const { hostDir, containerDir } = mounts.boundary
  const listed = mounts.folders.map(f => path.relative(hostDir, f.hostDir))
  const mountPoints = (mounts.readOnly ?? [])
    .map(m => path.posix.relative(containerDir, m.containerDir))
    .filter(rel => rel && !rel.startsWith('..') && !path.posix.isAbsolute(rel))
    .map(rel => rel.split('/').join(path.sep))
  return [...new Set([...listed, ...mountPoints])]
}

export function prepareBoundaryFolders(mounts: AgentMounts): Promise<void> {
  return ensureFoldersUnder(mounts.boundary.hostDir, boundaryFolderPaths(mounts))
}
