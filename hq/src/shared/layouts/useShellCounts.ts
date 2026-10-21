import { useCallback } from 'react'
import { useQuery, getNotifications, getMyRunsGoingCount, getMyTasks } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import { countsOnBell } from '../../notifications/notificationKinds'
import { needsYouCount } from '../../projects/pages/toolTaskRows'

export interface ShellCounts {
  /** The bell's count: Needs you items not yet seen, and every open persistent one (`countsOnBell`). */
  unreadNotifications: number
  /** The person's own runs going now: the Runs panel's Running group. */
  runsInProgress: number
  tasksNeedingYou: number
}

export function useShellCounts(): ShellCounts {
  const { data: notifications = [] } = useQuery(getNotifications)
  const { data: runsInProgress = 0, refetch: refetchRuns } = useQuery(getMyRunsGoingCount)
  const onRunStatus = useCallback(() => { void refetchRuns() }, [refetchRuns])
  useSocketListener('agentRunStatus', onRunStatus)
  // The tasks done on the person's behalf, as Your tasks lists them.
  const { data: tasks = [] } = useQuery(getMyTasks)
  return {
    unreadNotifications: notifications.filter(countsOnBell).length,
    runsInProgress,
    tasksNeedingYou: needsYouCount(tasks),
  }
}

export function formatCount(n: number): string {
  return n > 99 ? '99+' : String(n)
}
