import { useState, type ReactNode } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { FactCard, HowThisWorks, Say } from '../../components'
import { useShellPanel } from '../../shell/useShellPanel'
import type { FleetHost } from '../dashboard/types'
import { HQ_KEY } from '../maintenance/things'
import { locationWords, nightLine, nightName, useNights, whereWords } from './nights'

const SHOWN = 7

/**
 * The nights a machine holds, and those of its own in its backup location, newest first, each with *Restore…*, which
 * opens *Plan maintenance* on *Restore a backup* with that night chosen: one form, two doors.
 */
export function NightsCard({ host, summary, schedule, aside }: { host: FleetHost; summary: string; schedule: string | null; aside: ReactNode }) {
  const nights = useNights(host.fingerprint, host.online)
  const { openRestore } = useShellPanel()
  const [all, setAll] = useState(false)
  const which = host.hqMachine ? HQ_KEY : host.fingerprint
  const list = nights.phase === 'ready' ? nights.list.backups : []
  const shown = all ? list : list.slice(0, SHOWN)
  return (
    <FactCard title="Nights" wide aside={aside} help={<HowThisWorks topic="backups-and-restoring" section="go-back-to-an-earlier-night" className="normal-case tracking-normal" />}>
      <p className="text-body font-semibold text-text-primary">{summary}</p>
      {schedule && <p className="text-small text-text-secondary">{schedule}</p>}
      {!host.online && <p className="text-small text-text-muted">{host.machineName} is not answering, so its nights cannot be listed now.</p>}
      {host.online && nights.phase === 'loading' && <p role="status" className="text-small text-text-secondary">Asking {host.machineName} which nights it holds…</p>}
      {nights.phase === 'failed' && (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-small text-text-secondary">The nights could not be listed: {nights.message}</p>
          <Button variant="secondary" onClick={nights.refresh}>Try again</Button>
        </div>
      )}
      {nights.phase === 'ready' && (
        <>
          {locationWords(nights.list, host.machineName) && <Say warn>{locationWords(nights.list, host.machineName)}</Say>}
          {list.length === 0 ? <p className="text-small text-text-secondary">No night to restore yet.</p> : (
            <ul aria-label="Nights to restore" className="mt-1 flex flex-col divide-y divide-border-subtle">
              {shown.map(b => (
                <li key={b.id} className="flex flex-wrap items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-body text-text-primary">{nightName(b.night)}</p>
                    <p className="text-small text-text-secondary">{nightLine(b)} · {whereWords(b, host.machineName)}</p>
                  </div>
                  <Button variant="secondary" aria-label={`Restore the night of ${nightName(b.night)}…`} onClick={() => openRestore(which, b.id)}>Restore…</Button>
                </li>
              ))}
            </ul>
          )}
          {list.length > SHOWN && !all && <div><Button variant="secondary" onClick={() => setAll(true)}>{`Show all ${list.length} nights`}</Button></div>}
          <p className="text-small text-text-muted">A restore backs up what is there now first. A night only in the backup location needs its key.</p>
        </>
      )}
    </FactCard>
  )
}
