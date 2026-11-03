/**
 * `getFeatures`'s answer for a screen's unit test (adr-0172): each flag as the rule decides it in this test run, so a
 * screen is drawn as shipped, and with a flag on inside its `withFeature` group (core's, in memory). Give it as the
 * mocked query's answer, read again at each render.
 */
import { FEATURE_FLAG_NAMES, isFeatureOn } from '@agenthix/core'

export function featuresAnswer(): { flags: Array<{ flag: string; on: boolean }> } {
  return { flags: FEATURE_FLAG_NAMES.map(flag => ({ flag, on: isFeatureOn(flag, { env: process.env, switches: {} }) })) }
}
