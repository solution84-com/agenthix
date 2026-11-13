/**
 * hq's feature switches for a unit test with no database (adr-0172): the organisation has switched nothing, so each
 * flag is as shipped, and on inside its `withFeature` group (core's, in memory). Give it as the mock of
 * `features/switches`:
 *
 *   vi.mock('../../features/switches', async () => (await import('../../test/switchesWithoutDatabase')).switchesWithoutDatabase())
 */
import { FEATURE_FLAG_NAMES, isFeatureOn, type FeatureFlag, type FlagFacts } from '@agenthix/core'

export function switchesWithoutDatabase() {
  const facts = (): FlagFacts => ({ env: process.env, switches: {} })
  return {
    featureFacts: async () => facts(),
    orgFeatureSwitches: async () => ({}),
    isOrgFeatureOn: async (flag: FeatureFlag) => isFeatureOn(flag, facts()),
    featuresOn: async () => ({ on: FEATURE_FLAG_NAMES.filter(flag => isFeatureOn(flag, facts())) }),
  }
}
