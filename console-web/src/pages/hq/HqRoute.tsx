import { EmptyState } from '@agenthix/ui/primitives'
import { Notice, PageHeading } from '../../components'
import { ComesLaterPage } from '../ComesLaterPage'
import { NotFoundPage } from '../NotFoundPage'
import { SiteBackupsPage } from '../backups/SiteBackupsPage'
import { useFleet } from '../dashboard/useFleet'
import { AddressPage } from './AddressPage'
import { HqPage } from './HqPage'

/**
 * HQ's pages, at `/hq` and `/hq/<part>`: HQ is one, so its address names no machine; the machine it runs on is found in
 * the fleet. `/hq/upgrade`, `/capacity` and `/suspend` open *Plan maintenance* on this page, and `/hq/move` follows a move
 * (pages/maintenance/routes.tsx).
 */
export function HqRoute({ part, pollMs }: { part: string | null; pollMs?: number }) {
  const state = useFleet()
  const fleet = state.phase === 'loading' ? null : state.fleet
  if (state.phase === 'failed' && !fleet) {
    return (
      <>
        <PageHeading title="HQ" />
        <Notice title="The fleet could not be read" retry={state.refresh}>{state.message}</Notice>
      </>
    )
  }
  if (!fleet) return null
  const host = fleet.hosts.find(h => h.hqMachine)
  if (!host) {
    return (
      <>
        <PageHeading title="HQ" />
        <EmptyState variant="inline" title="HQ's machine is not connected to this Fleet Console, so there is nothing to show of it here." />
      </>
    )
  }
  const now = state.phase === 'loading' ? new Date() : state.readAt ?? new Date()
  switch (part) {
    case null:
      return <HqPage fleet={fleet} host={host} now={now} failure={state.phase === 'failed' ? state.message : null} refresh={state.refresh} pollMs={pollMs} />
    case 'address':
      return <AddressPage fingerprint={host.fingerprint} pollMs={pollMs} />
    case 'backups':
      return <SiteBackupsPage fingerprint={host.fingerprint} pollMs={pollMs} />
    case 'logs':
      return <ComesLaterPage title="HQ's logs" />
    default:
      return <NotFoundPage />
  }
}
