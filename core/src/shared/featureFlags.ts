/**
 * The feature flags (ADR-0116): every feature not ready ships behind one, named once here and read by every program.
 * A flagged feature is on in development and in tests, and off in production, where anything not plainly development
 * or a test counts as production, so a deployment that forgets to say fails closed. Its screens and commands do not
 * appear, and its routes and operations refuse where they run. Turning one on is a release decision made in this
 * list (`onInProduction`), never a setting on a machine; a flag is removed, with its feature on, in the release where
 * the feature is complete.
 *
 * Callers pass the environment they read (`process.env` on a server, the build's mode in a browser), so this module
 * stays free of Node and of any one bundler.
 */

export type FeatureFlagEntry = {
  /** What the flag holds back, in words. */
  feature: string
  /** The condition for removing the flag, with the feature turned on. */
  removeWhen: string
  /** False until a release turns the feature on. */
  onInProduction: boolean
}

export const FEATURE_FLAGS = {
  usageBilling: {
    feature:
      'Reporting usage to Agenthix Cloud: the call id and billing profile on each call through it, billing profiles ' +
      'sent to it, and the actual cost it reports read back into the ledger.',
    removeWhen: "Agenthix Cloud's metering and billing are live.",
    onInProduction: false,
  },
} as const satisfies Record<string, FeatureFlagEntry>

export type FeatureFlag = keyof typeof FEATURE_FLAGS

export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlag[]

/** The one setting read: `NODE_ENV`, as `wasp start`'s server, the test runner and the images set it. */
export type FlagEnvironment = { readonly NODE_ENV?: string | undefined }

/** A development build is one that says so exactly; anything else is production. */
export function isDevelopmentBuild(env: FlagEnvironment): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
}

export function isFeatureOn(flag: FeatureFlag, env: FlagEnvironment): boolean {
  return isDevelopmentBuild(env) || FEATURE_FLAGS[flag].onInProduction
}
