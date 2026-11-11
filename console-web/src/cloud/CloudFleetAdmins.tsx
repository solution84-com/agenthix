import type { CloudFleetAdminListing, CloudView } from '@agenthix/core'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { Card } from '../components'
import { useCloudRead, type CloudRead } from './api'
import { CloudMark, CloudReadFailure } from './CloudMark'
import { CLOUD } from './words'

/**
 * Fleet admins on Cloud, for a connected organisation (board *Signing in, and fleet admins*). A suggestion only: nobody
 * becomes a fleet admin here until a fleet admin here gives the role, or a machine admin of HQ's machine does.
 */
export function CloudFleetAdmins({ org, onGive }: { org: string | null; onGive: () => void }) {
  const view = useCloudRead<CloudView>('/cloud')
  const connected = view.phase === 'ready' && view.value.organisation !== null
  const list = useCloudRead<{ admins: CloudFleetAdminListing[] }>(connected ? '/cloud/fleet-admins' : null)
  if (view.phase !== 'ready') return null
  return <CloudFleetAdminsList connected={connected} list={list} org={org} onGive={onGive} />
}

export function CloudFleetAdminsList({ connected, list, org, onGive }: {
  connected: boolean
  list: CloudRead<{ admins: CloudFleetAdminListing[] }> & { reload?: () => void }
  org: string | null
  onGive: () => void
}) {
  const admins = list.phase === 'ready' ? list.value.admins : null
  return (
    <section aria-label={`Fleet admins on ${CLOUD}`} className="mt-5">
      <h2 className="mb-2 flex items-center gap-2 text-small font-semibold text-text-primary">
        Fleet admins on <CloudMark count={admins?.length} />
      </h2>
      {!connected && (
        <p className="text-small text-text-secondary">
          Once {org ?? 'the organisation'} is connected to {CLOUD}, on HQ's site page, its fleet admins on Cloud are listed here.
        </p>
      )}
      {list.phase === 'failed' && <CloudReadFailure what="Cloud's list" error={list.error} message={list.message} retry={list.reload ?? (() => {})} />}
      {admins && (
        <Card>
          <ul aria-label={`Fleet admins on ${CLOUD}`}>
            {admins.map(a => (
              <li key={a.cloudAccountId} className="flex flex-wrap items-center gap-2.5 border-t border-border-subtle py-2.5 first:border-t-0">
                <div className="min-w-0 flex-1 text-small text-text-primary">
                  <b className="font-semibold">{a.name}</b>
                  {a.email && <span className="ml-2 text-micro text-text-muted">{a.email}</span>}
                </div>
                <StatePill>On Cloud</StatePill>
                {a.fleetAdminInHq
                  ? <StatePill tone="healthy">Fleet admin here too</StatePill>
                  : <><StatePill>Not a fleet admin here</StatePill><Button variant="secondary" size="sm" onClick={onGive}>Give them the role here too</Button></>}
              </li>
            ))}
          </ul>
        </Card>
      )}
      {connected && (
        <p className="mt-2 text-small text-text-muted">
          Cloud's list is a suggestion, never a grant: nobody becomes a fleet admin here until a fleet admin here gives the role,
          or a machine admin of HQ's machine does. Giving it is announced, as always.
        </p>
      )}
    </section>
  )
}
