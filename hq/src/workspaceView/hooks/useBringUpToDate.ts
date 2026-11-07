import { useCallback, useEffect, useState } from 'react'
import { useAction, bringBranchUpToDate } from 'wasp/client/operations'
import type { BranchLineView } from '../../branches/views'
import { followUpdate, type UpdateAsk } from '../nextStep'
import { UPDATE_FAILED } from '../words'

/**
 * *Bring up to date* for the branch in view: asks its own agent through hq, then holds *Updating…* until the agent that
 * started on it stops. A merge that clashed is remembered per branch, so the button says *Bring up to date* until then.
 */
export function useBringUpToDate(line: BranchLineView | null) {
  const bring = useAction(bringBranchUpToDate)
  const [ask, setAsk] = useState<UpdateAsk | null>(null)
  const [clashed, setClashed] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const working = !!line?.working
  const lineId = line?.id ?? null
  useEffect(() => {
    const next = followUpdate(ask, lineId ? { id: lineId, working } : null)
    if (next === ask) return
    setAsk(next)
    // Brought up to date: a clash it had is behind it.
    if (ask && !next) setClashed(s => { const n = new Set(s); n.delete(ask.branchId); return n })
  }, [ask, lineId, working])
  useEffect(() => { setError(null) }, [lineId])

  const start = useCallback(async () => {
    if (!line) return
    setError(null)
    setAsk({ branchId: line.id, sawWorking: false })
    try {
      await bring({ branchId: line.id })
    } catch (e) {
      setAsk(null)
      setError(e instanceof Error && e.message ? e.message : UPDATE_FAILED)
    }
  }, [bring, line])

  const markClashed = useCallback((branchId: string) => setClashed(s => new Set(s).add(branchId)), [])

  return {
    updating: !!line && ask?.branchId === line.id,
    clashed: !!line && clashed.has(line.id),
    error,
    dismissError: () => setError(null),
    start,
    markClashed,
  }
}

export type BringUpToDate = ReturnType<typeof useBringUpToDate>
