import { useEffect } from 'react'
import type { FleetHost } from '../pages/dashboard/types'
import { forgetHqUpgrade, hqUpgradeArrived, useHqUpgrade, type HqUpgradeAsked } from './hqUpgrade'

/**
 * On HQ's page, from the moment an upgrade of HQ was asked now until HQ answers on the new version: that HQ restarts
 * and comes back by itself, since the machine's own answer cannot come back through HQ while it does. The page says it
 * in its state pill and its lede; this returns what was asked while it is under way, otherwise null.
 */
export function useHqUpgradeUnderWay(host: FleetHost): HqUpgradeAsked | null {
  const asked = useHqUpgrade()
  const arrived = asked !== null && hqUpgradeArrived(asked, host)
  useEffect(() => { if (arrived) forgetHqUpgrade() }, [arrived])
  return asked && !arrived ? asked : null
}
