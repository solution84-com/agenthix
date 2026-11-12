import { isDemoMode } from '@agenthix/core'

type Env = Record<string, string | undefined>

/**
 * Whether hq seeds the sample organisation at start rather than issuing a first-admin link: only in demo mode, and only
 * on a database with no users. With the setting off this is always false, so an ordinary install is unchanged.
 */
export function seedsInsteadOfFirstAdmin(noUsers: boolean, env: Env): boolean {
  return noUsers && isDemoMode(env)
}

/** Whether hq checks its providers with their vendors: never in demo mode, where every key is the fake one. */
export function shouldStartProviderHealth(env: Env): boolean {
  return !isDemoMode(env)
}

/**
 * Whether hq reads Inworld's model list with each Inworld provider's key, at start and then hourly and each minute:
 * never in demo mode, where the key is the fake one and every read would reach Inworld and be refused.
 */
export function shouldStartInworldModelsRefresh(env: Env): boolean {
  return !isDemoMode(env)
}

/** Whether hq archives finished tasks past their setting: never in demo mode, where the sample's Done tasks stay. */
export function shouldStartArchiveSweep(env: Env): boolean {
  return !isDemoMode(env)
}
