import { useState } from 'react'
import { SearchField } from '@agenthix/ui/primitives'
import { SectionHeading } from '../../components'
import { COMPACT_AFTER, steadyOrder } from './dashboardWords'
import { HubCard } from './HubCard'
import { SiteTile } from './SiteTile'
import type { FleetResponse } from './types'

/**
 * *The fleet* (board *Proposal*, 6): HQ as the hub, with every site drawn hanging from it, HQ's own first and then by
 * name. Past about twenty sites the drawing would run on, so the sites become a compact list under HQ with a search.
 */
export function FleetView({ fleet, now, cloud }: { fleet: FleetResponse; now: Date; cloud?: { label: string; words: string } }) {
  const [find, setFind] = useState('')
  const hqHost = fleet.hosts.find(h => h.hqMachine) ?? null
  const sites = steadyOrder(fleet.hosts)
  const compact = sites.length > COMPACT_AFTER
  const q = find.trim()
  const shown = compact && q ? sites.filter(h => h.machineName.toLowerCase().includes(q.toLowerCase())) : sites
  return (
    <section aria-label="The fleet">
      <SectionHeading aside={compact ? `${sites.length} sites` : undefined}>The fleet</SectionHeading>
      {hqHost && <HubCard fleet={fleet} host={hqHost} now={now} cloud={cloud} />}
      <div className={hqHost ? 'ml-[22px] border-l-2 border-border pt-3 pl-[18px]' : ''}>
        {compact && (
          <SearchField label="Find a site" value={find} onChange={setFind} className="mb-2 max-w-xs" />
        )}
        <ul aria-label="Sites" className={`flex flex-col ${compact ? 'gap-1' : 'gap-2'}`}>
          {shown.map(h => (
            <li key={h.fingerprint} className={hqHost ? "relative before:absolute before:top-1/2 before:-left-5 before:w-[18px] before:border-t-2 before:border-border before:content-['']" : ''}>
              <SiteTile host={h} now={now} compact={compact} />
            </li>
          ))}
        </ul>
        {compact && q && shown.length === 0 && <p className="py-1.5 text-small text-text-muted">{`No site matches "${q}".`}</p>}
      </div>
    </section>
  )
}
