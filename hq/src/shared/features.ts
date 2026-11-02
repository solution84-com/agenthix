/**
 * What the *Features* screen and a refusal call each flag, and the one line explaining it (live preview spec section 7,
 * *The Features screen*). Typed from core's list, so adding or removing a flag is a compile error until it has words.
 */
import type { FeatureFlag, FeatureStage } from '@agenthix/core'

export const FEATURE_WORDS: Record<FeatureFlag, { title: string; line: string }> = {
  usageBilling: {
    title: 'Usage billing',
    line: 'Agenthix Cloud reports the actual cost of each call it carries, and the usage report shows it.',
  },
  marketplace: {
    title: 'Marketplace',
    line: "The Library's Marketplace, for finding and installing skills and templates from a hosted registry.",
  },
}

/** One line per stage, shown above the list: production explains only the stages it lists. */
export const STAGE_WORDS: Record<FeatureStage, { label: string; line: string }> = {
  experimental: {
    label: 'Experimental',
    line: 'Being tried: it may change shape or be dropped. Off unless you switch it on, and never available in production.',
  },
  preview: {
    label: 'Preview',
    line: 'Built, and waiting on something outside it. On here unless you switch it off; off in production.',
  },
  beta: {
    label: 'Beta',
    line: 'Usable but unfinished, and it may still change. Off until an admin switches it on for the whole organisation, and it can be switched off again.',
  },
  released: {
    label: 'New in this release',
    line: 'Done, and on for everyone. An admin can switch it off until the next minor release, when the switch goes.',
  },
}

/** One flag as `getFeatures` answers it. */
export type FeatureRow = {
  flag: FeatureFlag
  stage: FeatureStage
  on: boolean
  onByDefault: boolean
  /** Whether this build offers a switch for it (to an admin). */
  switchable: boolean
  /** Whether the production screen lists it: a beta, or a flag released in this minor release. */
  shownInProduction: boolean
  /** Who last switched it and when; only an admin is told, and null when nobody has. */
  changed: { by: string | null; at: string } | null
}

export type FeaturesAnswer = {
  /** A development build lists and switches every flag; production only beta and newly released ones. */
  development: boolean
  isAdmin: boolean
  flags: FeatureRow[]
}
