import { useState } from 'react'
import { useAuth } from 'wasp/client/auth'
import { useAction, updateRoutine } from 'wasp/client/operations'
import { NativeSelect } from '@agenthix/ui/primitives'
import type { RoutineDetail } from '../../shared/routineTypes'

const LINK = 'text-accent hover:underline disabled:opacity-40'

/**
 * On behalf of (spec §3): the routine's person, with Change for a project admin, and a warning when that person can no
 * longer work in the project — with Take it over for an admin, which also turns a routine paused for it back on.
 */
export function RoutineOnBehalfOf({ routine, canStartRuns, busy, act }: {
  routine: RoutineDetail
  canStartRuns: boolean
  busy: boolean
  act: (fn: () => Promise<unknown>) => Promise<void>
}) {
  const { data: me } = useAuth()
  const updateFn = useAction(updateRoutine)
  const [changing, setChanging] = useState(false)
  const name = routine.onBehalfOf.username ?? 'someone'
  const admin = routine.isProjectAdmin && canStartRuns
  const handTo = (userId: string) => act(async () => {
    await updateFn({ routineId: routine.id, onBehalfOfUserId: userId })
    setChanging(false)
  })

  return (
    <div className="space-y-1">
      {changing ? (
        <NativeSelect
          aria-label="On behalf of"
          value={routine.onBehalfOf.userId}
          disabled={busy}
          onChange={e => void handTo(e.target.value)}
        >
          {!routine.candidates.some(c => c.userId === routine.onBehalfOf.userId) && <option value={routine.onBehalfOf.userId}>{name}</option>}
          {routine.candidates.map(c => <option key={c.userId} value={c.userId}>{c.username ?? c.userId}</option>)}
        </NativeSelect>
      ) : (
        <span>
          {name}
          {admin && <> · <button type="button" disabled={busy} className={LINK} onClick={() => setChanging(true)}>Change</button></>}
        </span>
      )}
      {!routine.onBehalfOfHasAccess && (
        <p className="text-small text-warning">
          {name} can no longer work in this project{routine.pausedReason ? ', so the routine is paused' : ''}.
          {admin && me && <> <button type="button" disabled={busy} className={LINK} onClick={() => void handTo(me.id)}>Take it over</button></>}
        </p>
      )}
    </div>
  )
}
