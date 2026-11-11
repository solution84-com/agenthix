import { useId } from 'react'
import { Button, EmptyState, StatePill } from '@agenthix/ui/primitives'
import { CardLink, HowThisWorks, ListTitleRow } from '../../components'
import { navigate } from '../../router'
import { useFleet, useFleetRead } from '../dashboard/useFleet'
import type { FleetHost } from '../dashboard/types'
import { runsSite } from '../dashboard/words'
import { TakeOutcome } from './BackupParts'
import { useTakeBackup } from './commands'
import { backupsLede, carriesHq, siteBackupWords } from './words'

export const RESTORE_A_LOST_SITE = '/fleet/add/restore'
export const backupsPath = (fingerprint: string): string => `/backups/${fingerprint}`

/**
 * Backups (board *Proposal*, 4): HQ and every site in a row, each with *Back up now* and *Export…*; the row opens its
 * backups. *Restore a lost site…* at the top. Each machine backs up on its own; there is no combined backup.
 */
export function BackupsPage({ pollMs }: { pollMs?: number } = {}) {
  const state = useFleet()
  const read = useFleetRead(state, 'The list')
  const fleet = state.phase === 'loading' ? null : state.fleet
  const now = state.phase === 'loading' ? new Date() : state.readAt ?? new Date()
  // A machine with no site holds no site's backups: what its log says may be an earlier site's. HQ's comes first.
  const rows = fleet
    ? fleet.hosts.filter(h => runsSite(h) && !h.leftByItself)
      .sort((a, b) => Number(carriesHq(b)) - Number(carriesHq(a)) || a.machineName.localeCompare(b.machineName))
    : []
  return (
    <>
      <ListTitleRow
        title="Backups"
        help={<HowThisWorks topic="backups-and-restoring" />}
        lede={(fleet && backupsLede(rows)) ?? 'Every site and HQ backs up on its own each night, on its own machine, sealed.'}
        add={<Button variant="secondary" onClick={() => navigate(RESTORE_A_LOST_SITE)}>Restore a lost site…</Button>}
        meta={!read.failedWithoutData ? read.nudge : null}
      />
      {read.failedWithoutData && read.nudge}
      {fleet && (rows.length === 0
        ? <EmptyState title="No site is connected yet." hint="Add a site from the dashboard; it backs up each night from then on." />
        : rows.map(h => <BackupRow key={h.fingerprint} host={h} now={now} pollMs={pollMs} onTaken={state.refresh} />))}
    </>
  )
}

/** One row: the row opens the thing's backups; *Back up now* and *Export…* sit beside it, outside the link. */
function BackupRow({ host, now, pollMs, onTaken }: { host: FleetHost; now: Date; pollMs?: number; onTaken: () => void }) {
  const w = siteBackupWords(host, now)
  const take = useTakeBackup(host.fingerprint, pollMs, onTaken)
  const nameId = useId()
  const busy = take.state.phase === 'working'
  const refusal = w.canAsk ? undefined : { reason: `${host.machineName} is not answering, so it cannot be asked to back up or export now.` }
  return (
    <article aria-label={w.name} className="mb-2 rounded-[14px] border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 pr-5">
        <CardLink to={backupsPath(host.fingerprint)} labelledBy={nameId} className="flex min-w-0 flex-1 flex-wrap items-center gap-3 rounded-[14px] px-5 py-[18px]">
          <div className="min-w-0 flex-1">
            <p id={nameId} className="font-semibold text-text-primary">{w.name}</p>
            <p className="text-small text-text-secondary">{w.last} · holds {w.holds}</p>
            {w.location && <p className="text-small text-text-secondary">{w.location}</p>}
          </div>
          <StatePill tone={w.pill.tone}>{w.pill.label}</StatePill>
        </CardLink>
        <Button variant="secondary" onClick={take.take} refusal={refusal} disabled={w.canAsk && busy}>{busy ? 'Backing up…' : 'Back up now'}</Button>
        <Button variant="secondary" onClick={() => navigate(`${backupsPath(host.fingerprint)}/export`)} refusal={refusal} disabled={w.canAsk && busy}>Export…</Button>
      </div>
      <TakeOutcome state={take.state} />
    </article>
  )
}
