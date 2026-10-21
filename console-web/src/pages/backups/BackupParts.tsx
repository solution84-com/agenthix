import { useState } from 'react'
import { Button, copyText, COPY_FAILED_WORDS } from '@agenthix/ui/primitives'
import { Notice } from '../../components'
import type { FleetHost } from '../dashboard/types'
import type { TakeState } from './commands'
import { locationCommand, takenWords } from './words'

/** The command that sets a backup location, to run on the machine itself; there is no control for it here. */
export function LocationCommand({ machineName }: { machineName: string }) {
  const [said, setSaid] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-small text-text-secondary">A backup location is set on the machine itself. On {machineName}, run:</p>
      <code className="block rounded-lg bg-surface-2 px-3 py-2 font-mono text-small text-text-primary">{locationCommand}</code>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => void copyText(locationCommand).then(ok => setSaid(ok ? 'Copied.' : COPY_FAILED_WORDS))}>Copy the command</Button>
        {said && <span role="status" className="text-small text-text-secondary">{said}</span>}
      </div>
    </div>
  )
}

/** What *Take a backup now* answered: the backup, or the host service's own words. */
export function TakeOutcome({ state, host, onDismiss }: { state: TakeState; host: FleetHost; onDismiss: () => void }) {
  if (state.phase === 'working') return <p role="status" className="text-small text-text-primary">Taking a sealed backup on {host.machineName}…</p>
  if (state.phase === 'done') {
    return (
      <Notice tone="healthy" title="Backed up" action={<Button variant="secondary" onClick={onDismiss}>Close</Button>}>
        {takenWords(state.backup, host.machineName, host.figures?.backups.locationSet ?? false)}
      </Notice>
    )
  }
  if (state.phase === 'refused') {
    return <Notice tone="danger" title="Not backed up" action={<Button variant="secondary" onClick={onDismiss}>Close</Button>}>{state.message}</Notice>
  }
  return null
}
