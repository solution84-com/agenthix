const SWITCH = 'HQ_DEV_SHARED_SUBSCRIPTION'

/** A development build is one that says so: `wasp start` and the test runner set NODE_ENV to one of these. */
function isDevelopmentBuild(env: NodeJS.ProcessEnv): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
}

/** True when the switch is set, whether or not it will be honoured. */
export function sharedSubscriptionSwitchSet(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[SWITCH] === 'true'
}

/**
 * A development-only switch: with `HQ_DEV_SHARED_SUBSCRIPTION=true`, the
 * org's and a project's subscription are used however many people the org has,
 * so one developer can test several people's runs on their own login. It is
 * honoured only in a development build — an allowlist, so an unset or unknown
 * NODE_ENV (a hand-built image, the built server run directly) refuses it too.
 * The several-people rule protects the provider's terms for a subscription,
 * which belongs to one person.
 */
export function sharedSubscriptionAllowedForTesting(env: NodeJS.ProcessEnv = process.env): boolean {
  return isDevelopmentBuild(env) && sharedSubscriptionSwitchSet(env)
}

/** An error line when the switch is set but this is not a development build (so it is ignored), else null. */
export function sharedSubscriptionSwitchIgnoredError(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!sharedSubscriptionSwitchSet(env) || isDevelopmentBuild(env)) return null
  return (
    `${SWITCH}=true is set, but this is not a development build (NODE_ENV is ${env.NODE_ENV ? `"${env.NODE_ENV}"` : 'unset'}), ` +
    'so it is ignored: a Claude subscription belongs to one person and is used only while the organisation has one person. ' +
    'In development, set NODE_ENV=development next to it (wasp start leaves NODE_ENV unset); in a real install, remove the variable.'
  )
}
