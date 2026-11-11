import { useState } from 'react'
import { Button, copyText, COPY_FAILED_WORDS } from '@agenthix/ui/primitives'
import { Notice } from '../../components'
import type { TakeState } from './commands'
import { locationCommand } from './words'

/** The command that sets a backup location, to run on the machine itself; there is no control for it here. */
export function LocationCommand({ machineName }: { machineName: string }) {
  const [copy, setCopy] = useState<'idle' | 'copied' | 'failed'>('idle')
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-small text-text-secondary">A backup location is set on the machine itself. On {machineName}, run:</p>
      <code className="block rounded-lg bg-surface-2 px-3 py-2 font-mono text-small text-text-primary">{locationCommand}</code>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => void copyText(locationCommand).then(ok => setCopy(ok ? 'copied' : 'failed'))}>{copy === 'copied' ? 'Copied' : 'Copy the command'}</Button>
      </div>
      {copy === 'failed' && <Notice kind="alert" title="Not copied">{COPY_FAILED_WORDS}</Notice>}
    </div>
  )
}

/** What *Take a backup now* answered. A backup made shows in the Nights card; only a refusal needs the person. */
export function TakeOutcome({ state }: { state: TakeState }) {
  return state.phase === 'refused' ? <Notice kind="alert" title="Not backed up">{state.message}</Notice> : null
}
