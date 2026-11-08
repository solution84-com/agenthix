import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSocketListener } from 'wasp/client/webSocket'
import { useAttention } from '../../shared/components/AttentionDialog'
import { refusalText } from '../../shared/refusal'
import { localMidnight } from './workroomWords'

/** How often a Workroom moves its clocks and reads again while open, when no run's status says something changed. */
const TICK_MS = 15_000

/** The clock a Workroom's times are read against, and the start of the viewer's today, sent with each read. */
export function useWorkroomClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), TICK_MS)
    return () => clearInterval(id)
  }, [])
  const day = now.toDateString()
  const todayFrom = useMemo(() => localMidnight(new Date(day)), [day])
  return { now, todayFrom }
}

/**
 * What keeps a Workroom live: a read again on each tick of its clock and whenever a run's status changes, and one way
 * to do something that shows a refusal as a centred dialog (with Try again) and reads again either way.
 */
export function useWorkroomActs(refetch: () => unknown, now: Date) {
  useEffect(() => { void refetch() }, [now, refetch])
  const onRunStatus = useCallback(() => { void refetch() }, [refetch])
  useSocketListener('agentRunStatus', onRunStatus)

  const attention = useAttention()
  const show = attention.show
  const [busy, setBusy] = useState(false)
  const act = useCallback(function act(title: string, work: () => Promise<unknown>, then?: () => void) {
    setBusy(true)
    work().then(
      () => { then?.(); void refetch() },
      (err) => { void refetch(); show({ title, text: refusalText(err), retry: () => act(title, work, then) }) },
    ).finally(() => setBusy(false))
  }, [refetch, show])
  return { act, busy, dialog: attention.dialog }
}
