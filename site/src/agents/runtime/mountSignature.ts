/**
 * A stable signature for what a container has mounted — the one value that
 * decides whether a running container may be REUSED for the next run or has to
 * be destroyed and started again.
 *
 * Split out of AgentContainerManager.ts once that file reached the repo's
 * 500-line limit, the same way containerTypes, containerLifecycle and
 * containerRuns came out of it before. Moved verbatim; it was already a
 * module-level function with no access to the class, which is what made it the
 * honest thing to take out rather than something rearranged to make room.
 */
import type { LocationMount } from './containerTypes'

/**
 * A stable signature for what a container has bound: the runner's harness
 * home, the boundary's one folder (ADR-0079), and the mode. Every part is a
 * function of the container's key, so the signature never changes for a
 * container this process started — creating, renaming or deleting a workspace
 * changes nothing here, and never restarts a container.
 *
 * What it still guards is a container this process did NOT start: one adopted
 * after a restart carries no cached signature, so it is recreated rather than
 * trusted, which is what brings a container started under an older layout or
 * an older image onto the current binds. `locationMode` is folded in because
 * an rw→ro flip changes no bind string.
 */
export function mountSignature(
  homeBind: string | null,
  boundary: LocationMount,
  locationMode: 'rw' | 'ro',
  readOnly: LocationMount[] = [],
): string {
  const binds: string[] = homeBind ? [homeBind] : []
  binds.push(`${boundary.hostDir}:${boundary.containerDir}`)
  for (const m of readOnly) binds.push(`${m.hostDir}:${m.containerDir}:ro`)
  return `${binds.sort().join('|')}|mode=${locationMode}`
}
