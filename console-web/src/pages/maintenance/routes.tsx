import { useEffect, type ReactNode } from 'react'
import { navigate } from '../../router'
import { HQ_PATH, sitePath } from '../../shell/menu'
import { BackupsPage } from '../backups/BackupsPage'
import { SiteBackupsPage } from '../backups/SiteBackupsPage'
import { MaintenancePage } from './MaintenancePage'
import { MoveFollowPage } from './MoveFollowPage'
import { maintenanceAddress } from './panelAddress'
import { HQ_KEY, type ChangeKind } from './things'

export const MAINTENANCE_PATH = '/maintenance'

function Redirect({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }) }, [to])
  return null
}

const KINDS: Record<string, ChangeKind> = { upgrade: 'upgrade', capacity: 'capacity', resize: 'capacity', move: 'move', suspend: 'suspend' }

/**
 * The screens of Maintenance and Backups, and the older addresses of each kind of work — `/hq/<kind>` and
 * `/sites/<fingerprint>/<kind>` (or `/fleet/…`), `/changes`, `/changes/new` and `/scheduled` — which now open *Plan
 * maintenance* with that kind chosen, or the Maintenance page. A move is still followed at its own address, and a
 * notice's move, under way or over, at that address with `?move=<id>`. Null for any other path.
 */
export function maintenanceAndBackupsScreen(path: string, search: string, pollMs?: number): ReactNode | null {
  if (path === MAINTENANCE_PATH) return <MaintenancePage />
  if (path === '/scheduled' || path === '/changes') return <Redirect to={MAINTENANCE_PATH} />
  if (path === '/changes/new') {
    const q = new URLSearchParams(search)
    return <Redirect to={maintenanceAddress(MAINTENANCE_PATH, q.get('thing'), KINDS[q.get('change') ?? ''] ?? null)} />
  }
  // A notice names the move it is about (`?move=<id>`): followed while under way, its outcome once over.
  const moveId = new URLSearchParams(search).get('move')
  const hq = /^\/hq\/([^/]+)$/.exec(path)
  if (hq && hq[1] === 'move') return <MoveFollowPage key={`${path}:${moveId}`} thing={HQ_KEY} moveId={moveId} pollMs={pollMs} />
  if (hq && KINDS[hq[1]]) return <Redirect to={maintenanceAddress(HQ_PATH, HQ_KEY, KINDS[hq[1]])} />
  // Under /fleet only a fingerprint is a site: /fleet/add and /fleet/cloud are other pages.
  const m = /^\/(?:fleet\/([0-9a-f]{64})|sites\/([^/]+))\/([^/]+)$/.exec(path)
  const site = m ? { fingerprint: m[1] ?? m[2], part: m[3] } : null
  if (site && site.part === 'move') return <MoveFollowPage key={`${path}:${moveId}`} thing={site.fingerprint} moveId={moveId} pollMs={pollMs} />
  if (site && KINDS[site.part]) return <Redirect to={maintenanceAddress(sitePath(site.fingerprint), site.fingerprint, KINDS[site.part])} />
  if (site && site.part === 'backups') return <Redirect to={`/backups/${site.fingerprint}`} />
  if (path === '/backups') return <BackupsPage />
  const backups = /^\/backups\/([^/]+)(\/export)?$/.exec(path)
  if (backups) return <SiteBackupsPage key={path} fingerprint={backups[1]} exporting={Boolean(backups[2])} />
  return null
}
