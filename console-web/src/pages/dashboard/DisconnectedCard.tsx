import { useState } from 'react'
import { Button, HostingBadge, StatePill } from '@agenthix/ui/primitives'
import { api } from '../../api/client'
import { Notice } from '../../components'
import { navigate } from '../../router'
import type { DisconnectedMachine } from './types'
import { whenIs } from './words'

/**
 * A machine a fleet admin disconnected here (board *Fleet*, spec §6): who did it and when, until it is added again or
 * removed from the list. Its site no longer takes part in HQ (spec §10). A machine a restore of its site onto another
 * replaced (adr-0119) says so instead: its site takes part from the other machine, and HQ refuses this one. The card
 * is not a link: the machine has no page here any more, and its two actions are its buttons.
 */
export function DisconnectedCard({ machine, now, onRemoved }: { machine: DisconnectedMachine; now: Date; onRemoved: () => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const remove = () => {
    setBusy(true)
    setError(null)
    api<void>(`/fleet/disconnected/${machine.id}`, { method: 'DELETE' })
      .then(onRemoved)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false))
  }
  // A site is named after its machine, so the machine's name is the one thing to call it by.
  const name = machine.machineName
  const replacedBy = machine.replacedBy
  return (
    <article aria-label={name} className="flex flex-col gap-2 rounded-[14px] border border-border bg-card px-4 py-3.5">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-h3 font-semibold text-text-primary">{name}</h3>
        <StatePill>{replacedBy ? 'Replaced' : 'Disconnected'}</StatePill>
      </div>
      <div className="flex items-center gap-1.5 text-small text-text-secondary">
        <HostingBadge where="self-hosted" />
        {machine.siteName ? 'Site' : 'A machine with no site'}
      </div>
      <p className="text-small text-text-secondary">
        {replacedBy
          ? `Replaced ${whenIs(machine.at, now)}: its site was restored onto ${replacedBy.machineName}, and is named ${replacedBy.machineName} now. HQ refuses this machine. It stays listed until you remove it from the list; nothing on the machine changes.`
          : <>Disconnected by {machine.by.name} {whenIs(machine.at, now)}.{machine.siteName && ' Its site no longer takes part in HQ.'} To manage it again, add it with a new code.</>}
      </p>
      {error && <Notice tone="danger">{error}</Notice>}
      <div className="mt-auto flex flex-wrap gap-2">
        {!replacedBy && <Button variant="secondary" onClick={() => navigate('/fleet/add')}>Add it again</Button>}
        <Button variant="secondary" disabled={busy} onClick={remove}>Remove from the list</Button>
      </div>
    </article>
  )
}
