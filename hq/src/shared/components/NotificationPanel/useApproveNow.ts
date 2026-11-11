import { useCallback, useState } from 'react'
import {
  useAction, useQuery, getTaskByKey, getTaskSession, getSessionPendingManifest, getNotifications, getMyRuns, approveManifest,
} from 'wasp/client/operations'

type Pending = { runId: string; sessionId: string } | null

/**
 * Approves a task's waiting tool request there and then — the tile's one button.
 * It finds the request the same way the request view does and answers it with
 * the same action. Returns false when it found nothing to approve, so the caller
 * can open the request to show it was answered. A press that failed is said:
 * `failure` holds its words until `clearFailure`, for the caller's dialog.
 */
export function useApproveNow(): {
  approve: (taskKey: string) => Promise<boolean>
  approving: string | null
  failure: string | null
  clearFailure: () => void
} {
  const approveRequest = useAction(approveManifest)
  const { refetch: refetchNotifications } = useQuery(getNotifications)
  const { refetch: refetchRuns } = useQuery(getMyRuns)
  const [approving, setApproving] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)

  const approve = useCallback(async (taskKey: string) => {
    setApproving(taskKey)
    setFailure(null)
    try {
      const task = await getTaskByKey({ taskKey }) as { id: string }
      const session = await getTaskSession({ taskId: task.id }) as { id: string } | null
      const pending = session ? await getSessionPendingManifest({ sessionId: session.id }) as Pending : null
      if (!pending) return false
      await approveRequest({ runId: pending.runId, sessionId: pending.sessionId })
      return true
    } catch (e) {
      setFailure(e instanceof Error && e.message ? e.message : 'The request was not approved. Nothing was changed.')
      return true
    } finally {
      // Whether it was approved or already answered, both panels read the new state.
      await Promise.all([refetchNotifications(), refetchRuns()])
      setApproving(null)
    }
  }, [approveRequest, refetchNotifications, refetchRuns])

  const clearFailure = useCallback(() => setFailure(null), [])
  return { approve, approving, failure, clearFailure }
}
