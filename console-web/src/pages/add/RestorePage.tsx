import { useState } from 'react'
import { Button, StatePill } from '@agenthix/ui/primitives'
import { Card, HowThisWorks, Notice, NOTIFY_HINT, NotifyChoice, PageHeading } from '../../components'
import { api } from '../../api/client'
import { useSessionDetails } from '../../auth/useSessionDetails'
import { navigate } from '../../router'
import { useFleet } from '../dashboard/useFleet'
import type { FleetHost } from '../dashboard/types'
import { codeLifetime, timeLeft, type OpenedJoin } from './joinWords'
import { CodePanel, MachineCheck, Steps, WaitingRow } from './JoinParts'
import { candidates, confirmWarning, lastHeard, restoreCommand, restoreSteps, restoreWarning } from './restoreWords'
import { useJoin } from './useJoin'
import { notifies } from '../dashboard/words'

/**
 * *Add a site › Restore from a backup* (adr-0119; board *Backups — the journeys* 5): a site whose machine was lost,
 * brought back as itself on a new machine. The fleet admin chooses the site and reads the warning, then gives a code
 * to the new machine's admin, who chooses the backup there and types its key there — the key never reaches the Fleet
 * Console or HQ. The fleet admin compares the fingerprint and sees when the backup was taken before confirming.
 */
export function RestorePage({ pollMs }: { pollMs?: number }) {
  const fleet = useFleet()
  const [chosen, setChosen] = useState<FleetHost | null>(null)
  const [opened, setOpened] = useState<{ join: OpenedJoin; at: Date } | null>(null)

  if (opened && chosen) return <Restoring lost={chosen} opened={opened} pollMs={pollMs} />
  const hosts = 'fleet' in fleet && fleet.fleet ? fleet.fleet.hosts : null
  return (
    <>
      <PageHeading
        title="Restore a site from a backup"
        help={<HowThisWorks topic="backups-and-restoring" section="restore-a-lost-site" />}
        lede="A site whose machine was lost, brought back as itself on a new machine, from its backup in the backup location or an export file."
      />
      <div className="flex max-w-2xl flex-col gap-4">
        {fleet.phase === 'failed' && <Notice tone="danger">{fleet.message}</Notice>}
        {chosen
          ? <Warning lost={chosen} back={() => setChosen(null)} onOpened={join => setOpened({ join, at: new Date() })} />
          : hosts && <ChooseSite hosts={hosts} choose={setChosen} />}
        <p className="text-small text-text-muted">
          If the machine that held HQ and this Fleet Console is the one lost, its machine admin restores it on a new machine with{' '}
          <code className="font-mono">restore --from &lt;folder or file&gt;</code>, without a code.
        </p>
      </div>
    </>
  )
}

function ChooseSite({ hosts, choose }: { hosts: FleetHost[]; choose: (h: FleetHost) => void }) {
  const now = new Date()
  const list = candidates(hosts)
  if (list.length === 0) return <Notice>There is no site in the fleet besides HQ's own, so there is nothing to restore.</Notice>
  return (
    <section aria-label="Which site" className="flex flex-col gap-2">
      <h2 className="text-micro font-semibold uppercase tracking-[.06em] text-text-muted">Which site was lost?</h2>
      {list.map(({ host, restorable, why }) => (
        <Card key={host.fingerprint} className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-body font-semibold text-text-primary">{host.siteName} <span className="font-normal text-text-secondary">on {host.machineName}</span></p>
            <p className="text-small text-text-secondary">{restorable ? lastHeard(host.since, now) : why}</p>
          </div>
          {restorable
            ? <Button variant="secondary" onClick={() => choose(host)}>Restore {host.siteName}…</Button>
            : <StatePill tone="neutral">{host.online ? 'Online' : 'Busy'}</StatePill>}
        </Card>
      ))}
    </section>
  )
}

function Warning({ lost, back, onOpened }: { lost: FleetHost; back: () => void; onOpened: (join: OpenedJoin) => void }) {
  const warning = restoreWarning(lost.siteName, lost.machineName, lost.since, new Date(), notifies(lost))
  const [understood, setUnderstood] = useState(false)
  // The new machine's own setting, asked here; the lost machine's is where it starts.
  const [notify, setNotify] = useState(true)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const open = () => {
    setOpening(true)
    setError(null)
    api<OpenedJoin>('/joins', { method: 'POST', body: { restoreMachine: lost.fingerprint, notify } })
      .then(onOpened)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setOpening(false))
  }
  return (
    <>
      <Notice tone={warning.strong ? 'danger' : 'warning'} title={warning.title}>
        {warning.paragraphs.map(p => <p key={p} className="mb-1 last:mb-0">{p}</p>)}
      </Notice>
      <p className="text-small text-text-secondary">{lastHeard(lost.since, new Date())} Every fleet admin and organisation admin is told when it is restored.</p>
      {error && <Notice tone="danger" title="No code was made">{error}</Notice>}
      <label className="flex items-start gap-2 text-small text-text-primary">
        <input type="checkbox" checked={understood} onChange={e => setUnderstood(e.target.checked)} className="mt-0.5" />
        <span>I understand that {lost.machineName} is replaced, and that what {lost.siteName} did after its backup is lost.</span>
      </label>
      <NotifyChoice checked={notify} onChange={setNotify} hint={`For the new machine. ${NOTIFY_HINT}`} />
      <div className="flex gap-2">
        <Button variant="primary" disabled={!understood || opening} onClick={open}>Make a code for the new machine</Button>
        <Button variant="secondary" onClick={back}>Back</Button>
      </div>
    </>
  )
}

function Restoring({ lost, opened, pollMs }: { lost: FleetHost; opened: { join: OpenedJoin; at: Date }; pollMs?: number }) {
  const { join, at } = opened
  const address = useSessionDetails()?.hq?.address ?? null
  const { view, phase, busy, error, confirm, refuse } = useJoin(join.joinId, pollMs)
  const now = new Date()
  const p = phase ?? { phase: 'waiting' as const, left: timeLeft(join.expiresAt, now) }

  if (p.phase === 'arrived' && view) {
    return (
      <>
        <PageHeading title={`Restore ${lost.siteName}`} lede="A machine used the code. Check it is the new machine, and the backup it restores." />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="max-w-2xl">
          <MachineCheck machine={p.machine} warnings={confirmWarning(view, now)} confirmLabel={`Confirm ${p.machine.name} and restore ${lost.siteName}`} busy={busy} onConfirm={confirm} onRefuse={refuse} />
        </div>
      </>
    )
  }
  if ((p.phase === 'working' || p.phase === 'done' || p.phase === 'failed') && view) {
    return (
      <>
        <PageHeading title={`Restore ${lost.siteName}`} lede={p.phase === 'done' ? `${lost.siteName} is restored, on ${view.machine?.name ?? 'the new machine'}.` : p.phase === 'working' ? 'Confirmed. The site is being restored on the new machine…' : undefined} />
        {p.phase === 'failed' && <Notice tone="danger" title={`${lost.siteName} was not restored`}>{p.problem}</Notice>}
        {p.phase === 'done' && p.note && <Notice tone="warning">{p.note}</Notice>}
        <div className="max-w-2xl"><Steps steps={restoreSteps(view)} /></div>
        {p.phase === 'done' && (
          <>
            <p className="mt-3 max-w-2xl text-small text-text-secondary">
              HQ says on the site what was lost since its backup. Every fleet admin and organisation admin has been told.
            </p>
            <div className="mt-3"><Button variant="secondary" onClick={() => navigate('/')}>Back to the dashboard</Button></div>
          </>
        )}
      </>
    )
  }
  const ended = p.phase === 'expired' || p.phase === 'refused'
  return (
    <>
      <PageHeading title={`Restore ${lost.siteName}`} lede={ended ? undefined : 'Give this code to the machine admin of the new machine.'} />
      {ended && (
        <Notice title={p.phase === 'expired' ? 'The code ran out' : 'Refused'} action={<Button variant="primary" onClick={() => navigate('/fleet/add')}>Start again</Button>}>
          Nothing was restored, and {lost.machineName} is still the site's machine.
        </Notice>
      )}
      {!ended && (
        <div className="flex max-w-2xl flex-col gap-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <CodePanel code={join.code} lifetime={codeLifetime(join.expiresAt, at)} command={restoreCommand(address, join.code)} />
          <p className="text-small text-text-secondary">
            On the new machine, where nothing runs yet, its machine admin chooses the backup — the backup location's folder or the export
            file — and types its key there. The key never reaches the Fleet Console or HQ.
          </p>
          <WaitingRow left={p.phase === 'waiting' ? p.left : ''} />
        </div>
      )}
    </>
  )
}
