import { useId } from 'react'
import { StatePill } from '@agenthix/ui/primitives'
import { CardLink } from '../../components'
import { sitePath } from '../../shell/menu'
import { siteLine } from './dashboardWords'
import type { FleetHost } from './types'
import { describeHost } from './words'

/**
 * A site hanging from HQ (board *Proposal*, 6): its machine's name, its state, and one line — what it is, its runs, its
 * disk, and a planned change or an overdue backup. The whole tile opens the site's page.
 */
export function SiteTile({ host, now, compact = false }: { host: FleetHost; now: Date; compact?: boolean }) {
  const words = describeHost(host, now)
  const titleId = useId()
  return (
    <article aria-label={host.machineName} className="flex">
      <CardLink
        to={sitePath(host.fingerprint)}
        labelledBy={titleId}
        className={`flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 border border-border bg-card ${compact ? 'rounded-lg px-3 py-2' : 'rounded-xl px-4 py-2.5'}`}
      >
        <h3 id={titleId} className="min-w-0 truncate text-body font-semibold text-text-primary">{host.machineName}</h3>
        <StatePill tone={words.tone}>{words.label}</StatePill>
        <p className="min-w-0 basis-full text-small text-text-secondary sm:basis-auto sm:flex-1 sm:text-right">{siteLine(host, now)}</p>
      </CardLink>
    </article>
  )
}
