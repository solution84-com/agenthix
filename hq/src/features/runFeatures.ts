/**
 * What a run is given by flag (adr-0172; live preview spec section 7, *How each program checks a flag*): a flagged
 * feature's tools reach a run, and its instructions are written, only while the feature is on. hq asks the rule once
 * when it signs a run's capability (`capabilityService.ts`), and the tools of every feature that is off are withheld
 * from the run there, whatever the agent's own permissions say.
 */
import { APP_TOOL_DECLARATIONS, FEATURE_FLAG_NAMES, isFeatureOn, type FeatureFlag, type FlagFacts } from '@agenthix/core'
import { featureFacts } from './switches'

export { instructionsFor } from './instructionsFor'

/** Each flagged feature's tools, by the names agents call them. A tool named here is never given while its flag is off. */
export type FlaggedTools = { readonly [F in FeatureFlag]?: readonly string[] }

export const FLAGGED_TOOLS: FlaggedTools = {
  // The app tools a code-work run is given, and the lead's offer of a live preview (`livePreviews/offer.ts`).
  livePreview: [...APP_TOOL_DECLARATIONS.map(d => d.name), 'offer_live_preview'],
}

/** One reading of the rule for a run: which flags are on, and the tools withheld because theirs is off. */
export type RunFeatures = {
  isOn(flag: FeatureFlag): boolean
  withheldTools: readonly string[]
}

export function runFeaturesFrom(facts: FlagFacts, flagged: FlaggedTools = FLAGGED_TOOLS): RunFeatures {
  const on = new Set(FEATURE_FLAG_NAMES.filter(flag => isFeatureOn(flag, facts)))
  const withheld = FEATURE_FLAG_NAMES.filter(flag => !on.has(flag)).flatMap(flag => flagged[flag] ?? [])
  return { isOn: flag => on.has(flag), withheldTools: [...new Set(withheld)] }
}

/** The rule asked once, with this organisation's switches. */
export async function runFeatures(flagged: FlaggedTools = FLAGGED_TOOLS): Promise<RunFeatures> {
  return runFeaturesFrom(await featureFacts(), flagged)
}

