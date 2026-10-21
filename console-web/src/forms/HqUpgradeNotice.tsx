import { useEffect } from 'react'
import { Notice } from '../components'
import type { FleetHost } from '../pages/dashboard/types'
import { whenIs } from '../pages/dashboard/words'
import { forgetHqUpgrade, hqUpgradeArrived, useHqUpgrade } from './hqUpgrade'

/**
 * On HQ's page, from the moment an upgrade of HQ was asked now until HQ answers on the new version: that HQ restarts
 * and comes back by itself, since the machine's own answer cannot come back through HQ while it does.
 */
export function HqUpgradeNotice({ host, now }: { host: FleetHost; now: Date }) {
  const asked = useHqUpgrade()
  const arrived = asked !== null && hqUpgradeArrived(asked, host)
  useEffect(() => { if (arrived) forgetHqUpgrade() }, [arrived])
  if (!asked || arrived) return null
  return (
    <Notice title={`Upgrading HQ to ${asked.version}`}>
      Asked {whenIs(asked.at, now)}. HQ restarts on the new version and comes back by itself; while it restarts nobody can
      sign in, and {host.machineName} cannot answer here, since its answers come through HQ. If the new version does not
      come up healthy, it rolls back to what ran before.
    </Notice>
  )
}
