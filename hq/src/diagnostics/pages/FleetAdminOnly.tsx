import type { ReactNode } from 'react'
import { useQuery, getFleetAccess } from 'wasp/client/operations'
import { useBackgroundRead } from '@agenthix/ui/attention'

/**
 * Figures, versions and logs are a fleet admin's (host-management spec §10). The server refuses them to anyone else;
 * this only says so on the screen instead of showing an error. It renders nothing of `children` until the role is known.
 */
export function FleetAdminOnly({ what, children }: { what: string; children: ReactNode }) {
  const query = useQuery(getFleetAccess)
  const { data: access } = query
  const read = useBackgroundRead(query, { what: 'Whether you are a fleet admin' })
  if (!access && read.failedWithoutData) return <>{read.nudge}</>
  if (!access) return <p className="text-body text-text-muted">Loading…</p>
  if (!access.fleetAdmin) {
    return (
      <p role="note" className="rounded-xl border border-border bg-surface-1 px-4 py-3 text-small text-text-secondary">
        {what} are shown to fleet admins. When a machine runs short, the Execution Sites screen says so in a sentence and who acts on it.
      </p>
    )
  }
  return <>{children}</>
}
