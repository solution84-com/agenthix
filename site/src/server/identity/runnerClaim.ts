/**
 * The site's half of the runner claim (person-scoped execution spec §1):
 * a run launches only on a capability that says who it is for, and only when
 * that runner fits the storage boundary the run works in.
 *
 * The runner decides whose private harness home sits beside the run, so a
 * capability without one is refused rather than guessed at — and so is one hq
 * signed for a boundary it does not fit, such as a person running in someone
 * else's own storage or a project runner for a different project. The rule
 * itself is core's `runnerBoundaryMismatch`, the one hq applies before signing.
 *
 * Whether the run's project is a person's personal project is a fact this
 * site's copy of the session does not hold, so it comes from the capability's
 * signed `personalProject` claim, and counts only when it names the very
 * project the session works in. Without it a person runner for a task in a
 * project is refused.
 *
 * Called at the very start of a run's launch, before any side effect.
 */
import {
  parseCapabilityPersonalProject, parseCapabilityRunner, runnerBoundaryMismatch, storageWithPersonalOwner,
  type CapabilityRunner,
} from '@agenthix/core'
import { resolvePrimaryLocation, type SessionLocationFields } from '../storage/primaryLocationService'

export class RunnerClaimError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RunnerClaimError'
  }
}

/**
 * The verified runner, or a `RunnerClaimError`.
 *
 * `verified` is the capability's payload after its signature and audience were
 * checked. `session` is the run's own session row; null when it could not be
 * read, in which case only the claim's shape is checked here — such a run
 * fails before any container or home is prepared for it.
 */
export function requireRunnerForBoundary(
  verified: Record<string, unknown>,
  session: SessionLocationFields | null,
): CapabilityRunner {
  const runner = parseCapabilityRunner(verified.runner)
  if (!runner) {
    throw new RunnerClaimError('The run capability names no runner')
  }
  if (!session) return runner

  const storage = resolvePrimaryLocation(session)
  const invokerUserId = typeof verified.userId === 'string' ? verified.userId : ''
  const mismatch = runnerBoundaryMismatch({
    runner,
    storage: storageWithPersonalOwner(storage, parseCapabilityPersonalProject(verified.personalProject)),
    sessionType: session.sessionType,
    invokerUserId,
  })
  if (mismatch) throw new RunnerClaimError(`The run capability's runner does not fit this run: ${mismatch}`)
  return runner
}
