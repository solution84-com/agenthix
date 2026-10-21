/**
 * Who a run is for — the runner claim hq signs into every capability
 * (person-scoped execution spec §1). It records who is running and grants
 * nothing: authority stays with the boundary (ADR-0060).
 *
 * Derived from the session's own storage location, the same one the site keys
 * the run's container on, so the two ends reach it from the same facts. A
 * session's location fields never change, so renewal re-derives the same
 * runner; `renewCapability` checks that it did.
 */
import { runnerBoundaryMismatch, type CapabilityRunner, type LocationRef } from '@agenthix/core'
import type { SessionLocationFields } from '../../storage/primaryLocationService'

export function resolveRunner(
  session: SessionLocationFields & { id: string },
  primaryLoc: LocationRef,
): CapabilityRunner {
  const runner: CapabilityRunner =
    primaryLoc.ownerType === 'user' ? { kind: 'person', userId: primaryLoc.ownerId }
    : session.sessionType === 'chat' ? { kind: 'person', userId: session.userId }
    : { kind: 'project', projectId: primaryLoc.ownerId }

  // The site refuses a runner that does not fit the boundary; refusing here
  // too means hq never signs one, rather than dispatching a run that fails.
  const mismatch = runnerBoundaryMismatch({
    runner,
    storage: { ownerType: primaryLoc.ownerType, ownerId: primaryLoc.ownerId },
    sessionType: session.sessionType,
    invokerUserId: session.userId,
  })
  if (mismatch) throw new Error(`Session ${session.id} cannot be given a runner: ${mismatch}`)
  return runner
}
