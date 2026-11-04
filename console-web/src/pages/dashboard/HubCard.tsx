import { useId } from 'react'
import { StatePill } from '@agenthix/ui/primitives'
import { CardLink, HqLink } from '../../components'
import { HQ_PATH } from '../../shell/menu'
import { hqHealth } from '../hq/hqWords'
import { hubLine } from './dashboardWords'
import type { FleetHost, FleetResponse } from './types'
import { possessive } from './words'

/**
 * HQ as the hub of the fleet (board *Proposal*, 6): whose it is, how it is, and in one line its address, machine, sites
 * connected, last backup and version. The whole card opens HQ's page; *Open HQ* goes to HQ itself, so it sits outside.
 */
export function HubCard({ fleet, host, now, cloud }: { fleet: FleetResponse; host: FleetHost; now: Date; cloud?: { label: string; words: string } }) {
  const titleId = useId()
  const name = fleet.hq?.organisationName
  const address = fleet.hq?.address
  const health = hqHealth(host.figures?.installs.find(i => i.target === 'hq'), host.online, !!host.figures)
  return (
    <section aria-label="HQ" className="relative">
      <CardLink to={HQ_PATH} labelledBy={titleId} className="block rounded-2xl border-2 border-accent bg-card px-5 py-3.5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 id={titleId} className="mr-1 text-h2 font-bold text-text-primary">{name ? `${possessive(name)} HQ` : 'HQ'}</h3>
          <StatePill tone={health.tone}>{health.label}</StatePill>
        </div>
        <p className="mt-1 text-small text-text-secondary">{hubLine(fleet, host, now)}</p>
        {cloud && <p className="mt-0.5 text-small text-text-secondary">{`${cloud.label} · `}<span>{cloud.words}</span></p>}
      </CardLink>
      {address && <p className="mt-1.5 flex justify-end"><HqLink address={address}>Open HQ ↗</HqLink></p>}
    </section>
  )
}
