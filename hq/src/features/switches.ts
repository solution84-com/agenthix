/**
 * The organisation's feature switches (adr-0172): stored on its record (`Org.featureSwitches`), each with who changed
 * it and when, and read here only. Every check on hq's server asks `isFeatureOn` with them through `featureFacts`;
 * they are read from the database at most once every few seconds, and `setFeature` forgets the copy at once.
 */
import { prisma } from 'wasp/server'
import {
  FEATURE_FLAG_NAMES, isFeatureOn,
  type FeatureFlag, type FeatureSwitches, type FlagFacts,
} from '@agenthix/core'
import { cachedFeatureSwitches } from './switchesCache'

export { forgetFeatureSwitches, freshFeatureSwitches, SWITCHES_CACHE_MS } from './switchesCache'

/** One stored switch: on or off, by whom (null for a seed or a person since erased) and when (ISO). */
export type StoredSwitch = { on: boolean; byUserId: string | null; at: string }
export type StoredSwitches = { [F in FeatureFlag]?: StoredSwitch }

/**
 * The stored column, made safe to use: only a listed flag's own entry with a boolean `on` counts. A flag removed from
 * the list, or a value of another shape, is ignored rather than refused, so an old row never stops hq.
 */
export function readStoredSwitches(raw: unknown): StoredSwitches {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return {}
  const stored: StoredSwitches = {}
  for (const flag of FEATURE_FLAG_NAMES) {
    if (!Object.prototype.hasOwnProperty.call(raw, flag)) continue
    const entry: unknown = (raw as Record<string, unknown>)[flag]
    if (typeof entry !== 'object' || entry === null) continue
    const { on, byUserId, at } = entry as Record<string, unknown>
    if (typeof on !== 'boolean') continue
    stored[flag] = {
      on,
      byUserId: typeof byUserId === 'string' ? byUserId : null,
      at: typeof at === 'string' ? at : new Date(0).toISOString(),
    }
  }
  return stored
}

/** The switches as the rule reads them: each flag switched on or off. */
export function switchesOf(stored: StoredSwitches): FeatureSwitches {
  const switches: { [F in FeatureFlag]?: boolean } = {}
  for (const flag of FEATURE_FLAG_NAMES) {
    const entry = stored[flag]
    if (entry) switches[flag] = entry.on
  }
  return switches
}

/** The stored switches straight from the database: none when there is no organisation yet. */
export async function loadStoredSwitches(): Promise<StoredSwitches> {
  const org = await prisma.org.findFirst({ select: { featureSwitches: true }, orderBy: { createdAt: 'asc' } })
  return readStoredSwitches(org?.featureSwitches ?? null)
}

/** The organisation's switches, read at most once every few seconds (switchesCache.ts). */
export function orgFeatureSwitches(): Promise<FeatureSwitches> {
  return cachedFeatureSwitches(async () => switchesOf(await loadStoredSwitches()))
}

/** What the rule decides from on hq's server: its own build, and the organisation's switches. */
export async function featureFacts(): Promise<FlagFacts> {
  return { env: process.env, switches: await orgFeatureSwitches() }
}

/** Whether a flagged feature is on for this organisation, by the one rule. */
export async function isOrgFeatureOn(flag: FeatureFlag): Promise<boolean> {
  return isFeatureOn(flag, await featureFacts())
}
