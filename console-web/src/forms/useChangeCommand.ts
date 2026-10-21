import { useCallback } from 'react'
import type { ChangeRequest, HostResult } from '@agenthix/core'
import { runCommand } from '../api/command'
import { NOW_CHOICE, scheduleRequest, type WhenChoice } from '../components'
import { useDraft, useDraftsAlive } from './drafts'

export type ChangeRun =
  | { phase: 'idle' }
  | { phase: 'working' }
  /** Done now; `result` is the machine's answer. */
  | { phase: 'done'; result: (HostResult & { ok: true })['result'] }
  /** Held by the machine's host service until `at`. */
  | { phase: 'scheduled'; at: string }
  /** The machine refused (its own sentence), or the command did not reach it. */
  | { phase: 'refused'; message: string }

/**
 * Sends one piece of work of the closed set — now, or scheduled for `at` — through the command route to the machine
 * it affects, and follows it until it ends. The answer is kept with the form's drafts, so it is there when the person
 * comes back to the form in *Plan maintenance*.
 */
export function useChangeCommand(fingerprint: string, pollMs = 1500): { run: ChangeRun; send: (change: ChangeRequest, at?: string | null) => void; reset: () => void } {
  const [run, setRun] = useDraft<ChangeRun>('run', { phase: 'idle' })
  const alive = useDraftsAlive()

  const send = useCallback((change: ChangeRequest, at: string | null = null) => {
    setRun({ phase: 'working' })
    void runCommand(fingerprint, scheduleRequest(change, at), pollMs, alive).then(outcome => {
      if (!outcome) return
      if (!outcome.ok) return setRun({ phase: 'refused', message: outcome.message })
      setRun(at ? { phase: 'scheduled', at } : { phase: 'done', result: outcome.result.result })
    })
  }, [fingerprint, pollMs, alive, setRun])

  const reset = useCallback(() => setRun({ phase: 'idle' }), [setRun])
  return { run, send, reset }
}

/** *When*, one for every form in the panel: changing what to do keeps it. */
export const useWhenChoice = () => useDraft<WhenChoice>('when', NOW_CHOICE, { shared: true })
