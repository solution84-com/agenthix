/**
 * The feature flags (adr-0172): every feature not ready ships behind one, named once here with its stage and read by
 * every program through one rule, `isFeatureOn`. Moving a flag to another stage is a release decision made in this
 * list, never a setting on a machine. The only switch is the organisation's, stored on its record in hq and sent by hq
 * to its sites with each instruction.
 *
 * | Stage        | Development build                       | Production                                              |
 * |--------------|-----------------------------------------|---------------------------------------------------------|
 * | experimental | off, unless a developer switches it on  | off, and cannot be switched on                          |
 * | preview      | on, unless a developer switches it off  | off                                                     |
 * | beta         | on, unless a developer switches it off  | off, unless the organisation's admin switches it on     |
 * | released     | on, unless a developer switches it off  | on, unless the organisation's admin switches it off     |
 *
 * So in production a switch can do exactly two things: turn a beta on, or turn a released flag off. A released flag
 * lives for one minor release (`releasedIn`; `flagsOverdue` in featureFlagReleases.ts).
 *
 * A development build is one whose `NODE_ENV` says `development` or `test`; anything else is production, so a
 * deployment that forgets to say fails closed. A test run is a development build in what it lets be switched, but runs
 * as shipped: with no switch, each flag is at its production value, and a feature's own tests switch it on
 * (`withFeature`, in the `./testing` entry).
 *
 * Callers pass the environment they read (`process.env` on a server), so this module stays free of Node and of any
 * one bundler.
 */
import { isSwitchedOnForTest } from './featureTestSwitches.js'

export const FEATURE_STAGES = ['experimental', 'preview', 'beta', 'released'] as const
export type FeatureStage = (typeof FEATURE_STAGES)[number]

type FlagDescription = {
  /** What the flag holds back, in words. */
  feature: string
  /** The condition for removing the flag, with the feature turned on. */
  removeWhen: string
}

export type FeatureFlagEntry = FlagDescription & (
  | { stage: Exclude<FeatureStage, 'released'>; releasedIn?: never }
  /** `releasedIn`: the minor release the feature went live in, as `major.minor` (`'0.2'`). */
  | { stage: 'released'; releasedIn: string }
)

export const FEATURE_FLAGS = {
  cloud: {
    feature:
      'Agenthix Cloud, everywhere it is offered or used (adr-0189): connecting HQ to it, Cloud as a provider of models ' +
      'and voice, signing in with an Agenthix account, its offers to fleet admins, the sites and HQs it runs, remote ' +
      "access to the Fleet Console, the host service's enrolment and the `agenthix cloud` commands.",
    removeWhen: "Agenthix Cloud's service is open.",
    stage: 'preview',
  },
  usageBilling: {
    feature:
      'Reporting usage to Agenthix Cloud: the call id and billing profile on each call through it, billing profiles ' +
      'sent to it, and the actual cost it reports read back into the ledger.',
    removeWhen: "Agenthix Cloud's metering and billing are live.",
    stage: 'preview',
  },
  marketplace: {
    feature:
      "The Library's Marketplace: its button and its own page, for finding and installing assets from a hosted " +
      'registry. Installing from an upload or a link is not behind it.',
    removeWhen: 'The hosted registry and the Marketplace page are built.',
    stage: 'preview',
  },
  livePreview: {
    feature:
      "Live previews: running a branch's app on a site beside the conversation, the app tools and what runs are told " +
      "about them, the relay's app addresses, and the Fleet Console's live preview settings. Code work on branches is " +
      'not behind it.',
    removeWhen: 'The live preview is reshaped into a development environment of its own and released.',
    stage: 'experimental',
  },
  voiceBridge: {
    feature:
      'The agent in a voice conversation opens with a short sentence of its own when a reply will take a while, and ' +
      'can keep listening when the person has not finished. Off, the stored wait phrases and the end-of-turn rule ' +
      'of today apply.',
    removeWhen: 'The bridge has been lived with in long conversations and is released.',
    stage: 'experimental',
  },
} as const satisfies Record<string, FeatureFlagEntry>

export type FeatureFlag = keyof typeof FEATURE_FLAGS

export const FEATURE_FLAG_NAMES = Object.keys(FEATURE_FLAGS) as FeatureFlag[]

export function stageOf(flag: FeatureFlag): FeatureStage {
  return FEATURE_FLAGS[flag].stage
}

/** The one setting read: `NODE_ENV`, as `wasp start`'s server, the test runner and the images set it. */
export type FlagEnvironment = { readonly NODE_ENV?: string | undefined }

/** An organisation's switches: a flag switched on (true) or off (false); a flag not named keeps its stage's default. */
export type FeatureSwitches = { readonly [F in FeatureFlag]?: boolean }

export const NO_FEATURE_SWITCHES: FeatureSwitches = Object.freeze({})

/** What `isFeatureOn` decides from, beside the flag's stage. */
export type FlagFacts = {
  readonly env: FlagEnvironment
  readonly switches: FeatureSwitches
}

/** A development build is one that says so exactly; anything else is production. */
export function isDevelopmentBuild(env: FlagEnvironment): boolean {
  return env.NODE_ENV === 'development' || env.NODE_ENV === 'test'
}

function isTestRun(env: FlagEnvironment): boolean {
  return env.NODE_ENV === 'test'
}

/** Whether a flag at this stage is on with no switch: a development build's default, or production's (a test run's). */
export function isOnByDefault(stage: FeatureStage, env: FlagEnvironment): boolean {
  return env.NODE_ENV === 'development' ? stage !== 'experimental' : stage === 'released'
}

/**
 * The organisation's choice for one flag, or undefined when it made none. Read defensively, since switches reach a
 * site from another program: only the flag's own property, and only a boolean, counts.
 */
function choiceFor(switches: unknown, flag: string): boolean | undefined {
  if (typeof switches !== 'object' || switches === null || !Object.prototype.hasOwnProperty.call(switches, flag)) {
    return undefined
  }
  const choice: unknown = (switches as Record<string, unknown>)[flag]
  return typeof choice === 'boolean' ? choice : undefined
}

/** The rule for a flag at a given stage: `isFeatureOn` with the stage from the list. Exported for the rule's tests. */
export function isFeatureOnAt(flag: string, stage: FeatureStage, facts: FlagFacts): boolean {
  if (isTestRun(facts.env) && isSwitchedOnForTest(flag)) return true
  const choice = choiceFor(facts.switches, flag)
  if (!isDevelopmentBuild(facts.env)) {
    if (stage === 'beta') return choice === true
    if (stage === 'released') return choice !== false
    return false
  }
  return choice ?? isOnByDefault(stage, facts.env)
}

export function isFeatureOn(flag: FeatureFlag, facts: FlagFacts): boolean {
  return isFeatureOnAt(flag, stageOf(flag), facts)
}

/**
 * Whether a switch for a flag at this stage is offered and accepted in this build: in production, a beta's (to turn
 * it on) and a released flag's (to turn it off); in a development build, any flag's.
 */
export function isSwitchableAt(stage: FeatureStage, env: FlagEnvironment): boolean {
  return isDevelopmentBuild(env) || stage === 'beta' || stage === 'released'
}

export function isSwitchable(flag: FeatureFlag, env: FlagEnvironment): boolean {
  return isSwitchableAt(stageOf(flag), env)
}

/** One flag as hq's `getFeatures` answers it. */
export type FeatureState = {
  stage: FeatureStage
  /** Whether the feature is on, by the rule. */
  on: boolean
  /** Whether it is on in this build with no switch. */
  onByDefault: boolean
  /** Whether this build offers and accepts a switch for it. */
  switchable: boolean
  /** Whether the production *Features* screen lists it: a beta or a released flag. */
  shownInProduction: boolean
}

/** Every flag's state at once, as hq's `getFeatures` answers it. */
export function featureStates(facts: FlagFacts): Record<FeatureFlag, FeatureState> {
  return Object.fromEntries(FEATURE_FLAG_NAMES.map(flag => {
    const stage = stageOf(flag)
    const state: FeatureState = {
      stage,
      on: isFeatureOn(flag, facts),
      onByDefault: isOnByDefault(stage, facts.env),
      switchable: isSwitchableAt(stage, facts.env),
      shownInProduction: stage === 'beta' || stage === 'released',
    }
    return [flag, state]
  })) as Record<FeatureFlag, FeatureState>
}

/**
 * Switches received from another program, made safe to use: a plain object's own entries naming a listed flag with a
 * boolean value are kept, and everything else is dropped. Never throws.
 */
export function parseFeatureSwitches(raw: unknown): FeatureSwitches {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return NO_FEATURE_SWITCHES
  const switches: { [F in FeatureFlag]?: boolean } = {}
  try {
    for (const flag of FEATURE_FLAG_NAMES) {
      const choice = choiceFor(raw, flag)
      if (choice !== undefined) switches[flag] = choice
    }
  } catch {
    return NO_FEATURE_SWITCHES
  }
  return switches
}
