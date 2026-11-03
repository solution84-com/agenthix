import { useQuery, getFeatures } from 'wasp/client/operations'
import type { FeatureFlag } from '@agenthix/core'

/**
 * Whether a flagged feature is on for this organisation, for a screen to show or hide it (adr-0172). Off until hq has
 * answered. A convenience only: the feature's server entry points refuse on their own (`requireFeature`).
 */
export function useFeature(flag: FeatureFlag): boolean {
  const { data } = useQuery(getFeatures)
  return data?.flags.find(f => f.flag === flag)?.on ?? false
}
