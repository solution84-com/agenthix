import { useCallback, useEffect, useRef, useState } from 'react'
import type { ScheduledChange } from '@agenthix/core'
import { runCommand } from '../../api/command'

export type ActionState = { phase: 'idle' } | { phase: 'working' } | { phase: 'refused'; message: string }

/** Changing a scheduled change's time, or cancelling it: sent to the machine that holds it, which answers. */
export function useScheduleActions(onDone: () => void, pollMs = 1500) {
  const [state, setState] = useState<ActionState>({ phase: 'idle' })
  const alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])

  const send = useCallback((c: ScheduledChange, request: Parameters<typeof runCommand>[1]) => {
    setState({ phase: 'working' })
    return runCommand(c.machine.fingerprint, request, pollMs, () => alive.current).then(outcome => {
      if (!outcome) return false
      if (outcome.ok) { setState({ phase: 'idle' }); onDone(); return true }
      setState({ phase: 'refused', message: outcome.message })
      return false
    })
  }, [onDone, pollMs])

  return {
    state,
    reset: () => setState({ phase: 'idle' }),
    changeTime: (c: ScheduledChange, at: string) => send(c, { op: 'schedule.change', changeId: c.id, at }),
    cancel: (c: ScheduledChange) => send(c, { op: 'schedule.cancel', changeId: c.id }),
  }
}
