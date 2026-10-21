import { trustedProxyCount } from './trustedProxies'
import { masterKeyProblem } from './crypto/secretCrypto'
import { sharedSubscriptionSwitchIgnoredError } from '../model-access/sharedSubscriptionSwitch'

export { sharedSubscriptionSwitchIgnoredError }

/**
 * Everything hq refuses to start without, as one line per problem. Pure over the
 * environment it is given so it can be tested without exiting the process.
 */
export function envProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  const errors: string[] = []

  // Always required: hq mints its signing key with it, and every run needs a signed capability.
  const keyProblem = masterKeyProblem(env.SECRETS_MASTER_KEY)
  if (keyProblem) errors.push(`  - SECRETS_MASTER_KEY (always required; generate one with: openssl rand -base64 32) — ${keyProblem}`)

  // Required in production (Docker/VPS). HQ_STORAGE_ROOT is here rather than
  // above because it has a working fallback beside the build output — which a
  // local checkout keeps and a container does not. A site's own root is in
  // neither list any more: hq derives nothing under it, and the settings page
  // says the same.
  if (env.NODE_ENV === 'production') {
    for (const key of ['DATABASE_URL', 'HQ_STORAGE_ROOT']) {
      if (!env[key]) errors.push(`  - ${key} (required in production)`)
    }
  }

  try {
    trustedProxyCount(env.HQ_TRUSTED_PROXIES)
  } catch (err) {
    errors.push(`  - ${(err as Error).message}`)
  }

  return errors
}
