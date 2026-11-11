import { useState } from 'react'
import { useQuery, useAction, getTaskOnBehalfOf, setTaskOnBehalfOf } from 'wasp/client/operations'
import { TaskFact } from '@agenthix/ui/tasks'
import { PersonProfileTrigger } from '../../people/PersonProfileCard'
import { NativeSelect } from '../../shared/components/ui/NativeSelect'
import { retryUnlessDenied } from '../place/retryUnlessDenied'
import { ShowAttention } from '@agenthix/ui/attention'

/**
 * Who the task is done on behalf of, and who queued it (adr-0089). A project
 * admin may choose someone else, which is also how a task blocked because its
 * person lost access is released.
 */
export function TaskOnBehalfOfSection({ taskId, onChanged }: { taskId: string; onChanged?: () => void }) {
  const { data, refetch } = useQuery(getTaskOnBehalfOf, { taskId }, { retry: retryUnlessDenied })
  const setOnBehalfOf = useAction(setTaskOnBehalfOf)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  if (!data) return null
  const { onBehalfOf, queuedBy, blockedForLostAccess, canReassign, candidates } = data
  const name = onBehalfOf.username ?? 'a removed person'

  async function choose(userId: string) {
    if (!userId || (userId === onBehalfOf.userId && !blockedForLostAccess)) return
    setError('')
    setBusy(true)
    try {
      await setOnBehalfOf({ taskId, userId })
      await refetch()
      onChanged?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change who this task is for')
    } finally {
      setBusy(false)
    }
  }

  return (
    <TaskFact label="For">
      <div className="space-y-1.5">
        {blockedForLostAccess && (
          <div className="rounded-lg border border-warning/20 bg-warning/10 px-3 py-2.5 text-small leading-relaxed text-warning">
            {name} no longer has access to this project, so this task is blocked until a project admin chooses
            someone else.
          </div>
        )}
        {canReassign ? (
          <NativeSelect
            size="sm"
            value={candidates.some(c => c.userId === onBehalfOf.userId) ? onBehalfOf.userId : ''}
            disabled={busy}
            onChange={e => void choose(e.target.value)}
            aria-label="On behalf of"
          >
            {!candidates.some(c => c.userId === onBehalfOf.userId) && <option value="">{name} — choose someone</option>}
            {candidates.map(c => (
              <option key={c.userId} value={c.userId}>{c.username ?? c.userId}</option>
            ))}
          </NativeSelect>
        ) : (
          <p>{onBehalfOf.username ? <PersonProfileTrigger userId={onBehalfOf.userId}>{name}</PersonProfileTrigger> : name}</p>
        )}
        {queuedBy && (
          <p className="text-micro text-text-muted">
            Queued by{' '}
            {queuedBy.kind === 'person'
              ? (queuedBy.person.username
                ? <PersonProfileTrigger userId={queuedBy.person.userId}>{queuedBy.person.username}</PersonProfileTrigger>
                : 'a removed person')
              : `${queuedBy.agentHandle ? `@${queuedBy.agentHandle}` : 'an agent'} during a run`}
          </p>
        )}
        <ShowAttention kind="alert" text={error} title="The task was not reassigned" onClose={() => setError('')} />
      </div>
    </TaskFact>
  )
}
