import { useState } from 'react'
import { TASK_BUTTON, TASK_BUTTON_PRIMARY } from '../tasks/TasksToolParts'
import type { SprintInfo } from './types'

export type UnfinishedDestination = 'next' | 'backlog'

function Choice({ chosen, title, children, onPick }: { chosen: boolean; title: string; children: string; onPick: () => void }) {
  return (
    <button
      type="button" role="radio" aria-checked={chosen} onClick={onPick}
      className={`rounded-xl border p-2.5 text-left text-small ${chosen ? 'border-accent bg-accent/10' : 'border-border hover:border-accent'}`}
    >
      <b className="block text-text-primary">{title}</b>
      <span className="text-text-secondary">{children}</span>
    </button>
  )
}

/**
 * Finish sprint, in place (every screen reviewed spec §3): what stays recorded, and where the unfinished tasks
 * go. Nothing is chosen until the person chooses, and the button waits.
 */
export function FinishSprintForm({ sprint, doneCount, unfinishedCount, lengthDays, onFinish, onCancel }: {
  sprint: Pick<SprintInfo, 'number' | 'label'>
  doneCount: number
  unfinishedCount: number
  lengthDays: number
  onFinish: (destination: UnfinishedDestination) => Promise<void>
  onCancel: () => void
}) {
  const [destination, setDestination] = useState<UnfinishedDestination | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const finish = async () => {
    if (!destination || busy) return
    setBusy(true)
    setError('')
    try {
      await onFinish(destination)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That did not work')
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3 px-4 pt-4">
      <p className="rounded-xl border border-border-subtle bg-surface-1 px-3 py-2 text-small text-text-primary">
        <b>{doneCount} done</b> stay recorded in {sprint.label}
      </p>
      <div>
        <p className="pb-1.5 text-micro font-medium uppercase tracking-wide text-text-muted">
          {unfinishedCount} not done go to
        </p>
        <div role="radiogroup" aria-label="Where the unfinished tasks go" className="grid grid-cols-2 gap-2">
          <Choice chosen={destination === 'next'} title="The next sprint" onPick={() => setDestination('next')}>
            {`Sprint ${sprint.number + 1} starts now, ${lengthDays} days like this one`}
          </Choice>
          <Choice chosen={destination === 'backlog'} title="The Backlog" onPick={() => setDestination('backlog')}>Plan them again</Choice>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={TASK_BUTTON_PRIMARY} disabled={!destination || busy} onClick={() => void finish()}>
          {busy ? 'Finishing…' : 'Finish sprint'}
        </button>
        <button type="button" className={TASK_BUTTON} onClick={onCancel}>Cancel</button>
      </div>
      {!destination && <p className="text-micro text-text-muted">Nothing is chosen for you: Finish sprint waits until one is picked. An agent finishing a sprint has to say which as well.</p>}
      {error && <p role="alert" className="text-small text-danger">{error}</p>}
    </div>
  )
}
