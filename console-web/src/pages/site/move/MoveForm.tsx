import { useEffect, useState } from 'react'
import { NOTIFY_HINT, NotifyChoice, parseWhen } from '../../../components'
import { api } from '../../../api/client'
import { useDraft } from '../../../forms/drafts'
import { MaintenanceEnding } from '../../../forms/MaintenanceEnding'
import { useWhenChoice } from '../../../forms/useChangeCommand'
import type { FleetHost, FleetResponse } from '../../dashboard/types'
import { runsSite } from '../../dashboard/words'
import type { Move } from './moveWords'

/** What `POST /api/hosts/:fingerprint/move` answers: the move, and the new machine's code, this once. */
export type StartedMove = Move & { code: string; expiresAt: string }
/** The same, with no code when the move goes to a machine already connected. */
export type StartedSiteMove = Move & Partial<Pick<StartedMove, 'code' | 'expiresAt'>>

/** Machines already connected that could receive the site: online, running no site, in no move. */
function useConnectedTargets(from: string): FleetHost[] {
  const [hosts, setHosts] = useState<FleetHost[]>([])
  useEffect(() => {
    let live = true
    api<FleetResponse>('/fleet')
      .then(f => { if (live) setHosts(f.hosts.filter(h => h.fingerprint !== from && h.online && !h.leftByItself && !h.move && !runsSite(h))) })
      .catch(() => {})
    return () => { live = false }
  }, [from])
  return hosts
}

export const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section aria-label={title} className="mb-4">
    <p className="mb-1.5 text-small font-semibold text-text-primary">{title}</p>
    {children}
  </section>
)

const CODE_WORDS = "Starting the move gives a one-time code for the new machine's admin. The machine then waits for the move and starts no site of its own."

const Choice = ({ name, checked, onChange, title, hint }: { name: string; checked: boolean; onChange: () => void; title: string; hint: string }) => (
  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3">
    <input type="radio" name={name} className="mt-1" checked={checked} onChange={onChange} />
    <span><b className="font-semibold text-text-primary">{title}</b> <span className="text-small text-text-secondary">{hint}</span></span>
  </label>
)

/**
 * *Move* a site, before it starts: what moves; where to — a new machine, which the move's code brings, or one already
 * connected that runs no site; and when, as all maintenance ends.
 */
export function MoveForm({ host, onStarted }: { host: FleetHost; onStarted: (move: StartedSiteMove, at: Date) => void }) {
  const [when, setWhen] = useWhenChoice()
  const [atError, setAtError] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const targets = useConnectedTargets(host.fingerprint)
  // null: a new machine, with a code; otherwise the fingerprint of a machine already connected.
  const [to, setTo] = useDraft<string | null>('to', null)
  // Asked only of a new machine, which joins with the code; one already connected keeps its own setting.
  const [notify, setNotify] = useDraft('notify', true)

  const start = (e: React.FormEvent) => {
    e.preventDefault()
    const t = parseWhen(when, new Date())
    if (!t.ok) return setAtError(t.error)
    const body = { ...(t.at ? { at: t.at } : {}), ...(to ? { to } : { notify }) }
    setAtError(undefined)
    setBusy(true)
    setError(null)
    api<StartedSiteMove>(`/hosts/${host.fingerprint}/move`, { method: 'POST', body })
      .then(move => onStarted(move, new Date()))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  return (
    <form onSubmit={start} noValidate aria-label="Move the site">
      <Section title="What moves">
        <div className="rounded-xl border border-border bg-card px-4 py-3 text-small text-text-primary">
          <p><b className="font-semibold">Everything the site holds.</b> Its workspaces, its runs' records and its credential, as a sealed backup passed straight to the new machine.</p>
          <p className="mt-1.5 text-text-secondary">It keeps its workspaces and its place in HQ, and takes the new machine's name.</p>
          <p className="mt-1.5 text-text-secondary">The site is read-only while it moves. Its runs pause a few minutes before; members whose work runs here see a notice from the moment it is scheduled.</p>
        </div>
      </Section>
      <Section title="The new machine">
        {targets.length === 0 ? (
          <p className="mb-2 text-small text-text-secondary">{CODE_WORDS}</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Choice name="move-to" checked={to === null} onChange={() => setTo(null)} title="A new machine" hint={CODE_WORDS} />
            {targets.map(t => (
              <Choice key={t.fingerprint} name="move-to" checked={to === t.fingerprint} onChange={() => setTo(t.fingerprint)}
                title={t.machineName} hint="Connected already, with no site. It is asked to receive the site at once; no code is needed." />
            ))}
          </div>
        )}
        {to === null && <div className={targets.length > 0 ? 'mt-2' : ''}><NotifyChoice checked={notify} onChange={setNotify} hint={NOTIFY_HINT} /></div>}
      </Section>
      <MaintenanceEnding idPrefix="move-when" machineName={host.machineName} when={when} onWhen={setWhen} whenError={atError}
        run={busy ? { phase: 'working' } : error ? { phase: 'refused', message: error } : { phase: 'idle' }}
        refusedTitle="The move was not started" nowHint="Now: it starts once the new machine has connected."
        done={{ title: 'Started.', text: '' }} />
    </form>
  )
}
