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
import { runnerBoundaryMismatch, type CapabilityRunner, type RunStorage } from '@agenthix/core'
import type { SessionLocationFields } from '../../storage/primaryLocationService'

export function resolveRunner(
  session: SessionLocationFields & { id: string },
  /** Where the run works, marked with its person when it is a personal project's own storage. */
  storage: RunStorage,
  /** Whose authority the run carries (`runBoundary`): a person when the task is in one of their personal projects. */
  boundary?: { type: 'project' | 'user'; id: string } | null,
): CapabilityRunner {
  const runner: CapabilityRunner =
    storage.ownerType === 'user' ? { kind: 'person', userId: storage.ownerId }
    : session.sessionType === 'chat' ? { kind: 'person', userId: session.userId }
    // A task in a personal project works in the project's own storage and runs as its person.
    : boundary?.type === 'user' ? { kind: 'person', userId: boundary.id }
    : { kind: 'project', projectId: storage.ownerId }

  // The site refuses a runner that does not fit the boundary; refusing here
  // too means hq never signs one, rather than dispatching a run that fails. A
  // person runner for a task passes only in that person's own personal project.
  const mismatch = runnerBoundaryMismatch({
    runner,
    storage,
    sessionType: session.sessionType,
    invokerUserId: session.userId,
  })
  if (mismatch) throw new Error(`Session ${session.id} cannot be given a runner: ${mismatch}`)
  return runner
}
