/**
 * The one module that moves a provider's state (models from one place, part 1, *When a provider fails*). It is fed:
 *
 * - by outcomes of real calls, `reportOutcome`: hq's own calls, and agents' calls through the relay's usage reports;
 * - by the vendor's check that costs nothing (`checks.ts`): at once after a failed call, hourly on every provider,
 *   and every five minutes while one is not working;
 * - for Agenthix Cloud, by its answers (`setCloudProviderState`).
 *
 * The rule itself is `healthRules.ts`. Each change of state is a provider record with the actor hq, and organisation
 * admins' notices are brought in step. Outcomes for one provider are applied one at a time.
 *
 * The checks run on a timer of their own, once a minute, as hq's other background sweeps do (`sites/machineNotices.ts`),
 * rather than in the scheduler, which is the automation's: each pass asks the database which providers are due, so a
 * restart loses nothing.
 */
import type { AiProviderState, AiProviderVendor } from '@agenthix/core'
import { Logger } from '../server/utils/logger'
import { vendorChecks } from './checks'
import { checkDue, nextHealth, type FailureKind, type Outcome } from './healthRules'
import { syncProviderNotices } from './notices'
import { vendorMessage } from './secrecy'
import { providerStore, type ProviderRow } from './store'

const logger = new Logger('ProviderHealth')

export const STATE_WORDS: Record<AiProviderState, string> = {
  works: 'works', key_refused: 'Key refused', out_of_credit: 'Out of credit', unreachable: 'Unreachable',
  not_available: 'Not available yet', disconnected: 'Disconnected',
}

const chains = new Map<string, Promise<unknown>>()
const inFlight = new Set<Promise<unknown>>()

function serialised<T>(id: string, work: () => Promise<T>): Promise<T> {
  const next = (chains.get(id) ?? Promise.resolve()).then(work, work)
  chains.set(id, next)
  inFlight.add(next)
  void next.finally(() => {
    inFlight.delete(next)
    if (chains.get(id) === next) chains.delete(id)
  }).catch(() => {})
  return next
}

/** Resolves once every outcome and check under way has been applied: for tests and an orderly stop. */
export async function settled(): Promise<void> {
  while (inFlight.size) await Promise.allSettled([...inFlight])
}

async function recordStateChange(before: ProviderRow, after: ProviderRow): Promise<void> {
  await providerStore().record({
    providerId: after.id, providerName: after.name, action: 'state_changed', actor: 'hq', byUserId: null,
    detail: `${STATE_WORDS[before.state]} → ${STATE_WORDS[after.state].toLowerCase()}`,
  })
  await syncProviderNotices()
}

async function apply(id: string, outcome: Outcome, key: string | null): Promise<ProviderRow | null> {
  const store = providerStore()
  const before = await store.byId(id)
  if (!before || before.vendor === 'cloud') return null
  const now = new Date()
  const step = nextHealth(before, outcome, now)
  const changed = step.health.state !== before.state
  const after = await store.update(id, {
    state: step.health.state,
    failuresInRow: step.health.failuresInRow,
    lastFailedAt: step.health.lastFailedAt,
    ...(changed ? { stateSince: now } : {}),
    ...(step.health.state === 'works' ? { stateDetail: null } : step.detail ? { stateDetail: vendorMessage(step.detail, key) } : {}),
    ...(outcome.source === 'check' ? { lastCheckedAt: now } : {}),
    ...(step.worked ? { lastWorkedAt: now } : {}),
  })
  if (changed) await recordStateChange(before, after)
  if (step.checkNow) void checkProvider(id).catch(err => logger.warn(`Checking a provider failed: ${err instanceof Error ? err.message : String(err)}`))
  return after
}

/**
 * What a real call to the provider came to: hq's own, or an agent's through the relay. A rate limit, a bad request,
 * a cancel or a spending cap change nothing; `auth`, `quota` and server errors are checked with the vendor at once.
 */
export function reportOutcome(providerId: string, outcome: { ok: true } | { ok: false; kind: FailureKind; detail?: string }): Promise<void> {
  return serialised(providerId, async () => {
    await apply(providerId, { ...outcome, source: 'call' } as Outcome, null)
  })
}

/** Asks the vendor now; the answer moves the state like any outcome. Null for a provider that is gone or is Cloud. */
export function checkProvider(providerId: string): Promise<ProviderRow | null> {
  return serialised(providerId, async () => {
    const store = providerStore()
    const p = await store.byId(providerId)
    const credential = await store.credentialOf(providerId)
    if (!p || !credential || p.vendor === 'cloud') return null
    const result = await vendorChecks().check({ vendor: p.vendor as Exclude<AiProviderVendor, 'cloud'>, key: credential.key, baseUrl: credential.baseUrl })
    return apply(providerId, { ...result, source: 'check' } as Outcome, credential.key)
  })
}

/** Checks every provider whose check is due; how many were checked. */
export async function checkDueProviders(): Promise<number> {
  const now = new Date()
  const due = (await providerStore().list()).filter(p => checkDue(p, now))
  for (const p of due) {
    // One provider that cannot be checked (a stored key that will not decrypt) must not stop the ones after it.
    try {
      await checkProvider(p.id)
    } catch (err) {
      logger.warn(`Checking provider ${p.id} failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  return due.length
}

/** Agenthix Cloud's state from its answers (part 6): works, not available yet, or disconnected. */
export async function setCloudProviderState(state: Extract<AiProviderState, 'works' | 'not_available' | 'disconnected'>, detail: string | null = null): Promise<void> {
  const cloud = (await providerStore().list()).find(p => p.vendor === 'cloud')
  if (!cloud) return
  await serialised(cloud.id, async () => {
    const before = await providerStore().byId(cloud.id)
    if (!before || (before.state === state && before.stateDetail === detail)) return
    const now = new Date()
    const after = await providerStore().update(cloud.id, {
      state, stateDetail: detail, lastCheckedAt: now, ...(state === 'works' ? { lastWorkedAt: now } : {}),
      ...(before.state !== state ? { stateSince: now } : {}),
    })
    if (before.state !== state) await recordStateChange(before, after)
  })
}

const SWEEP_MS = 60_000
let timer: NodeJS.Timeout | null = null
let sweeping = false

async function sweep(): Promise<void> {
  if (sweeping) return
  sweeping = true
  try {
    const checked = await checkDueProviders()
    if (checked) logger.info(`Checked ${checked} provider${checked === 1 ? '' : 's'} with ${checked === 1 ? 'its vendor' : 'their vendors'}.`)
  } catch (err) {
    logger.warn(`Provider checks failed: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    sweeping = false
  }
}

/** Started once from setup: the notices brought in step with the providers as they are, then a check sweep each minute. */
export function startProviderHealth(): void {
  if (timer) return
  void syncProviderNotices().catch(err => logger.warn(`Provider notices not brought up to date: ${err instanceof Error ? err.message : String(err)}`))
  timer = setInterval(() => void sweep(), SWEEP_MS)
  timer.unref()
}
