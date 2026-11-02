/**
 * When a service counts as started (spec part 4, *When services run*: started first, and waited for until healthy):
 * the order `depends_on` gives, and the wait for each one, healthy when it has a health check, running when not, or
 * finished well when it is one that runs once.
 */
import type { ServiceDeclaration } from '@agenthix/core'
import type { ServiceDocker } from './serviceDocker'
import type { ServiceTemplate } from './serviceTemplate'

/** Dependencies first; core's reading already refused a file whose `depends_on` goes round. */
export function startOrder(services: ServiceDeclaration[]): ServiceDeclaration[] {
  const byName = new Map(services.map(s => [s.name, s]))
  const out: ServiceDeclaration[] = []
  const seen = new Set<string>()
  const visit = (s: ServiceDeclaration) => {
    if (seen.has(s.name)) return
    seen.add(s.name)
    for (const [dep] of s.dependsOn) {
      const d = byName.get(dep)
      if (d) visit(d)
    }
    out.push(s)
  }
  for (const s of [...services].sort((a, b) => (a.name < b.name ? -1 : 1))) visit(s)
  return out
}

const MAX_WAIT_MS = 5 * 60_000
const NO_CHECK_WAIT_MS = 3 * 60_000

/** How long a service may take to be ready: its own health check's worst case, and a margin, at most five minutes. */
export function readyWithin(t: ServiceTemplate): number {
  const h = t.healthcheck
  if (!h) return NO_CHECK_WAIT_MS
  const interval = h.intervalMs || 30_000
  const timeout = h.timeoutMs || 30_000
  return Math.min(MAX_WAIT_MS, h.startPeriodMs + (interval + timeout) * (h.retries + 1) + 30_000)
}

export type Ready = 'ready' | 'finished'

/** Waits for the service; answers why it is not ready, as a sentence, when it never is. */
export async function waitReady(
  deps: { docker: ServiceDocker; now(): number; sleep(ms: number): Promise<void> }, t: ServiceTemplate, withinMs: number,
): Promise<Ready | string> {
  const until = deps.now() + withinMs
  for (;;) {
    const state = await deps.docker.state(t.name)
    if (!state) return `${t.service}'s container is gone.`
    if (!state.running) {
      if (state.exitCode === 0 && !t.healthCommand) return 'finished'
      return `${t.service} stopped (exit code ${state.exitCode ?? 'unknown'}).`
    }
    if (state.health === 'unhealthy') return `${t.service}'s health check failed.`
    if (state.health === 'healthy' || (!t.healthCommand && state.health === 'none')) return 'ready'
    if (deps.now() >= until) return `${t.service} was not ready within ${Math.round(withinMs / 1000)} seconds.`
    await deps.sleep(1000)
  }
}

/** For `service_completed_successfully`: waits for the service to end, and says whether it ended well. */
export async function waitFinished(
  deps: { docker: ServiceDocker; now(): number; sleep(ms: number): Promise<void> }, t: ServiceTemplate, withinMs: number,
): Promise<boolean> {
  const until = deps.now() + withinMs
  for (;;) {
    const state = await deps.docker.state(t.name)
    if (!state) return false
    if (!state.running) return state.exitCode === 0
    if (deps.now() >= until) return false
    await deps.sleep(1000)
  }
}
