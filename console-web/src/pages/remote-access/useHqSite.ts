import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { FleetResponse } from '../dashboard/types'

/** HQ's site, whose page is where the organisation is connected to Cloud; null until read, or when it is not known. */
export function useHqSite(): { fingerprint: string; machineName: string } | null {
  const [site, setSite] = useState<{ fingerprint: string; machineName: string } | null>(null)
  useEffect(() => {
    let live = true
    api<FleetResponse>('/fleet')
      .then(fleet => {
        const hq = fleet.hosts.find(h => h.hqMachine)
        if (live && hq) setSite({ fingerprint: hq.fingerprint, machineName: hq.machineName })
      })
      .catch(() => {})
    return () => { live = false }
  }, [])
  return site
}
