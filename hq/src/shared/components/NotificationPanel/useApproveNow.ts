import { useCallback, useState } from 'react'
import {
  useAction, useQuery, getTaskByKey, getTaskSession, getSessionPendingManifest, getNotifications, getMyRuns, approveManifest,
} from 'wasp/client/operations'

type Pending = { runId: string; sessionId: string } | null

/**
 * Approves a task's waiting tool request there and then — the tile's one button.
 * It finds the request the same way the request view does and answers it with
 * the same action. Returns false when it found nothing to approve or the answer
 * failed, so the caller can open the request to show why.
 */
export function useApproveNow(): { approve: (taskKey: string) => Promise<boolean>; approving: string | null } {
  const approveRequest = useAction(approveManifest)
  const { refetch: refetchNotifications } = useQuery(getNotifications)
  const { refetch: refetchRuns } = useQuery(getMyRuns)
  const [approving, setApproving] = useState<string | null>(null)

  const approve = useCallback(async (taskKey: string) => {
    setApproving(taskKey)
    try {
      const task = await getTaskByKey({ taskKey }) as { id: string }
      const session = await getTaskSession({ taskId: task.id }) as { id: string } | null
      const pending = session ? await getSessionPendingManifest({ sessionId: session.id }) as Pending : null
      if (!pending) return false
      await approveRequest({ runId: pending.runId, sessionId: pending.sessionId })
      return true
    } catch {
      return false
    } finally {
      // Whether it was approved or already answered, both panels read the new state.
      await Promise.all([refetchNotifications(), refetchRuns()])
      setApproving(null)
    }
  }, [approveRequest, refetchNotifications, refetchRuns])

  return { approve, approving }
}
