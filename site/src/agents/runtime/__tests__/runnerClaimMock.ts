/**
 * For run-launch tests that are not about the runner claim: gives a capability
 * that names no runner the one hq would have minted for the test's session,
 * then runs the REAL check. A test that sets a runner of its own keeps it.
 * With no session row there is no boundary to check, so only the shape is.
 *
 *   vi.mock('../../../server/identity/runnerClaim', async (importOriginal) =>
 *     (await import('./runnerClaimMock')).withDerivedRunner(await importOriginal()))
 */
import type { CapabilityRunner } from '@agenthix/core'
import { resolvePrimaryLocation, type SessionLocationFields } from '../../../server/storage/primaryLocationService'
import type * as RunnerClaim from '../../../server/identity/runnerClaim'

function runnerHqWouldMint(session: SessionLocationFields, invokerUserId: string): CapabilityRunner {
  const loc = resolvePrimaryLocation(session)
  if (loc.ownerType === 'user') return { kind: 'person', userId: loc.ownerId }
  if (session.sessionType === 'chat') return { kind: 'person', userId: invokerUserId }
  return { kind: 'project', projectId: loc.ownerId }
}

export function withDerivedRunner(real: typeof RunnerClaim): typeof RunnerClaim {
  return {
    ...real,
    requireRunnerForBoundary: (verified, session) => {
      if (verified.runner !== undefined) return real.requireRunnerForBoundary(verified, session)
      const invoker = typeof verified.userId === 'string' ? verified.userId : session?.userId ?? 'u1'
      // Tests that hand the launch no session row supply one through a mocked
      // resolveAgentContext instead; a storage key needs a runner.
      if (!session) return real.requireRunnerForBoundary({ ...verified, runner: { kind: 'person', userId: invoker } }, session)
      return real.requireRunnerForBoundary({ ...verified, runner: runnerHqWouldMint(session, invoker) }, session)
    },
  }
}
