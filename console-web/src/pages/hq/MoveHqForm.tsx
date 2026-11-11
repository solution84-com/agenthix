import { useState } from 'react'
import { FormField, Input, StatePill } from '@agenthix/ui/primitives'
import { Notice, parseWhen } from '../../components'
import { api } from '../../api/client'
import { useDraft } from '../../forms/drafts'
import { MaintenanceEnding } from '../../forms/MaintenanceEnding'
import { useWhenChoice } from '../../forms/useChangeCommand'
import type { FleetHost } from '../dashboard/types'
import { Section, type StartedMove } from '../site/move/MoveForm'
import { commandWords, hasOwnDomain, whatFollows } from './hqWords'
import { useHostCommand } from './useHostCommand'

/** The server's own check of a new address: a scheme and a host, perhaps with a port (console/src/move/moves.ts). */
const ADDRESS = /^https?:\/\/[^/\s]+$/

type Where = 'address' | 'machine'

/**
 * *Move* HQ, before it starts (board *Moving hq*): where to, its address, what follows HQ, and when, as all maintenance ends.
 * A new address on the same machine is changed now, by the host service; a new machine gets a one-time code.
 */
export function MoveHqForm({ host, hosts, address, console: fleetConsole, onStarted, pollMs }: {
  host: FleetHost
  hosts: FleetHost[]
  address: string | null
  console: { machineName: string; here: string }
  onStarted: (move: StartedMove, givenAt: Date) => void
  pollMs?: number
}) {
  const [where, setWhere] = useDraft<Where>('where', 'machine')
  const [newAddress, setNewAddress] = useDraft('address', '')
  const [when, setWhen] = useWhenChoice()
  const [errors, setErrors] = useState<{ address?: string; at?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const command = useHostCommand(host.fingerprint, pollMs)

  const ownDomain = address !== null && hasOwnDomain(address)
  // With its own domain, a move to a new machine keeps it; a new address on the same machine is always asked for.
  const asksAddress = where === 'address' || !ownDomain
  const sentAddress = asksAddress ? newAddress.trim() : null
  const moved = whatFollows(hosts, sentAddress || (asksAddress ? 'the new address' : null), fleetConsole, new Date())
  // Staying on the same machine, nothing is restored: HQ's own site and the Fleet Console just follow the address.
  const rows = where === 'machine' ? moved : moved.map((r, i) =>
    i === 0 && host.hqMachine ? { ...r, text: 'Set to the new address by the host service.' }
      : r.name === 'The Fleet Console' ? { ...r, text: "It stays where it runs and dials HQ's new address like a site." } : r)

  const start = (e: React.FormEvent) => {
    e.preventDefault()
    const found: typeof errors = {}
    if (asksAddress && !ADDRESS.test(newAddress.trim())) found.address = 'Give the address as a scheme and a host, perhaps with a port: http://192.168.1.30:7800.'
    const t = where === 'machine' ? parseWhen(when, new Date()) : { ok: true as const, at: null }
    if (!t.ok) found.at = t.error
    setErrors(found)
    if (found.address || !t.ok) return
    if (where === 'address') {
      command.send({ op: 'address.set', target: 'hq', address: newAddress.trim() })
      return
    }
    setBusy(true)
    setError(null)
    api<StartedMove>('/hq/move', { method: 'POST', body: { ...(t.at ? { at: t.at } : {}), ...(sentAddress ? { hqAddress: sentAddress } : {}) } })
      .then(move => onStarted(move, new Date()))
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }

  const radio = (value: Where, title: string, hint: string) => (
    <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-border bg-card px-4 py-3">
      <input type="radio" name="move-hq-where" className="mt-1" checked={where === value} onChange={() => setWhere(value)} />
      <span><b className="font-semibold text-text-primary">{title}</b> <span className="text-small text-text-secondary">{hint}</span></span>
    </label>
  )
  const said = commandWords('address', command.run)

  return (
    <form onSubmit={start} noValidate aria-label="Move HQ">
      <Section title="Where to">
        <div className="flex flex-col gap-2">
          {radio('address', `A new address on ${host.machineName}`, 'HQ stays on this machine and answers at a new address.')}
          {radio('machine', 'A new machine', 'One with no site of its own yet. Starting the move gives a one-time code for its machine admin; the machine then waits to receive HQ.')}
        </div>
      </Section>
      <Section title="Its address">
        {ownDomain && where === 'machine' ? (
          <p className="text-small text-text-primary">
            HQ keeps its own domain, <span className="font-mono">{address}</span>. Once HQ is restored on the new machine, point the domain at it; sites and host services reconnect to the same address.
          </p>
        ) : (
          <>
            <p className="mb-2 text-small text-text-primary">
              {address ? <>{ownDomain ? 'People and sites reach HQ at' : 'HQ has no domain of its own: people and sites reach it at'} <span className="font-mono">{address}</span>.</> : 'HQ has not said its address yet.'}
            </p>
            <FormField label="New address" htmlFor="move-hq-address" error={errors.address}>
              <Input id="move-hq-address" value={newAddress} placeholder="http://192.168.1.30:7800" onChange={e => setNewAddress(e.target.value)} />
            </FormField>
          </>
        )}
      </Section>
      <Section title="What follows HQ">
        <ul className="flex flex-col gap-2">
          {rows.map(r => (
            <li key={r.name} className="flex items-start gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-body font-semibold text-text-primary">{r.name}</p>
                <p className="text-small text-text-secondary">{r.text}</p>
              </div>
              {r.pill && <StatePill tone="warning">{r.pill}</StatePill>}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-small text-text-secondary">
          HQ is read-only while it moves. From the moment the backup starts until the new HQ takes over, people can read but not change anything. Members see a notice in HQ from the moment it is scheduled.
        </p>
      </Section>
      {said?.tone === 'danger' && <Notice kind="alert" title={said.title}>{said.text}</Notice>}
      <MaintenanceEnding idPrefix="move-hq-when" machineName={host.machineName} when={when} onWhen={setWhen} whenError={errors.at}
        run={busy || command.run.phase === 'working' ? { phase: 'working' } : error ? { phase: 'refused', message: error } : { phase: 'idle' }}
        refusedTitle="The move was not started" nowHint="Now: it starts once the new machine has connected and you have confirmed it."
        nowOnly={where === 'address' ? 'Now: a new address on the same machine is changed as soon as you confirm, and cannot be scheduled.' : undefined}
        done={{ title: 'Started.', text: '' }} />
    </form>
  )
}
