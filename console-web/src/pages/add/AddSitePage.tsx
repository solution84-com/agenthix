import { useState } from 'react'
import { Button } from '@agenthix/ui/primitives'
import { Card, HowThisWorks, HqLink, Notice, NOTIFY_HINT, NotifyChoice, PageHeading } from '../../components'
import { api } from '../../api/client'
import { useSessionDetails } from '../../auth/useSessionDetails'
import { navigate } from '../../router'
import { codeLifetime, connectCommand, timeLeft, type OpenedJoin } from './joinWords'
import { CodePanel, MachineCheck, Steps, WaitingRow } from './JoinParts'
import { useJoin } from './useJoin'

/** *Add a site* (board *Add a site*, spec §6): first what is being added, then a new site's code and its machine. */
export function AddSitePage({ pollMs }: { pollMs?: number }) {
  const [opened, setOpened] = useState<{ join: OpenedJoin; at: Date } | null>(null)
  const [opening, setOpening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notify, setNotify] = useState(true)

  const open = () => {
    setOpening(true)
    setError(null)
    api<OpenedJoin>('/joins', { method: 'POST', body: { notify } })
      .then(join => setOpened({ join, at: new Date() }))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setOpening(false))
  }

  if (opened) return <NewSite opened={opened} again={() => { setOpened(null); open() }} pollMs={pollMs} />
  return (
    <>
      <PageHeading title="Add a site" help={<HowThisWorks topic="add-a-site" />} />
      <h2 className="mb-2.5 text-micro font-semibold uppercase tracking-[.06em] text-text-muted">What are you adding?</h2>
      {error && <Notice tone="danger" title="No code was made">{error}</Notice>}
      <div className="grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
        <Card className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold text-text-primary">A new site</h3>
          <p className="flex-1 text-small text-text-secondary">On a machine that runs none yet. You get a one-time code to connect it with.</p>
          <NotifyChoice checked={notify} onChange={setNotify} hint={NOTIFY_HINT} />
          <div><Button variant="primary" disabled={opening} onClick={open}>Continue</Button></div>
        </Card>
        <Card className="flex flex-col gap-2">
          <h3 className="text-h3 font-semibold text-text-primary">Restore from a backup</h3>
          <p className="flex-1 text-small text-text-secondary">A site whose machine was lost, brought back on a new machine from its backup. You need the backup and its key.</p>
          <div><Button variant="secondary" onClick={() => navigate('/fleet/add/restore')}>Restore from a backup…</Button></div>
        </Card>
      </div>
    </>
  )
}

function NewSite({ opened, again, pollMs }: { opened: { join: OpenedJoin; at: Date }; again: () => void; pollMs?: number }) {
  const { join, at } = opened
  const address = useSessionDetails()?.hq?.address ?? null
  const { phase, busy, error, confirm, refuse } = useJoin(join.joinId, pollMs)
  const [cancelling, setCancelling] = useState(false)
  const cancel = () => {
    setCancelling(true)
    api<void>(`/joins/${join.joinId}`, { method: 'DELETE' }).catch(() => {}).finally(() => navigate('/'))
  }
  const p = phase ?? { phase: 'waiting' as const, left: timeLeft(join.expiresAt, new Date()) }

  if (p.phase === 'arrived') {
    return (
      <>
        <PageHeading title="Add a site" lede="Step 2 of 2 — a machine used the code. Check it is the one you meant." />
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="max-w-2xl">
          <MachineCheck machine={p.machine} warnings={p.warnings} confirmLabel={`Confirm ${p.machine.name}`} busy={busy} onConfirm={confirm} onRefuse={refuse} />
          <p className="mt-4 text-small text-text-muted">
            Then the Fleet Console and the machine remember each other. The machine dials out to HQ, and its site is started on it,
            named {p.machine.name} to begin with, after the machine; from then on the two names are stored apart.
          </p>
        </div>
      </>
    )
  }
  if (p.phase === 'working' || p.phase === 'done' || p.phase === 'failed') {
    const done = p.phase === 'done'
    return (
      <>
        <PageHeading title="Add a site" lede={done ? `Confirmed. ${p.siteName} is connected.` : p.phase === 'failed' ? undefined : 'Confirmed. The site is being started…'} />
        {error && <Notice tone="danger">{error}</Notice>}
        {p.phase === 'failed' && (
          <Notice tone="danger" title="The site was not added" action={p.canRetry ? <Button variant="secondary" disabled={busy} onClick={confirm}>Try again</Button> : undefined}>{p.problem}</Notice>
        )}
        {done && p.note && <Notice tone="warning">{p.note}</Notice>}
        <div className="max-w-2xl"><Steps steps={p.steps} /></div>
        {done && (
          <>
            <p className="mt-3 max-w-2xl text-small text-text-secondary">
              The site on it has started and takes part in HQ, with its machine's name to begin with. Organisation admins see it, read-only,
              under Where work runs in HQ. You can leave this page.
            </p>
            <div className="mt-3 flex gap-2">
              {address && <HqLink address={address} path="/settings">Open Where work runs in HQ ↗</HqLink>}
              <Button variant="secondary" onClick={() => navigate('/')}>Back to the dashboard</Button>
            </div>
          </>
        )}
      </>
    )
  }
  const ended = p.phase === 'expired' || p.phase === 'refused'
  return (
    <>
      <PageHeading title="Add a site" help={<HowThisWorks topic="add-a-site" />} lede={ended ? undefined : 'Step 1 of 2 — give this code to the machine admin of the new machine.'} />
      {p.phase === 'expired' && (
        <Notice tone="warning" title="The code ran out" action={<Button variant="primary" onClick={again}>Make a new code</Button>}>
          No machine was added with it. Make a new code and give it to the machine admin.
        </Notice>
      )}
      {p.phase === 'refused' && (
        <Notice title="Refused" action={<Button variant="primary" onClick={again}>Make a new code</Button>}>
          The machine was turned away and the code no longer works. Nothing was added.
        </Notice>
      )}
      {!ended && (
        <div className="flex max-w-2xl flex-col gap-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <CodePanel code={join.code} lifetime={codeLifetime(join.expiresAt, at)} command={connectCommand(address, join.code)} />
          <WaitingRow left={p.phase === 'waiting' ? p.left : ''} />
          <div><Button variant="secondary" disabled={cancelling} onClick={cancel}>Cancel</Button></div>
        </div>
      )}
    </>
  )
}
