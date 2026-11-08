import { useCallback } from 'react'
import { useQuery, getNotifications, getMyRunsGoingCount, getMyTasks } from 'wasp/client/operations'
import { useSocketListener } from 'wasp/client/webSocket'
import { countsOnBell } from '../../notifications/notificationKinds'
import { needsYouCount } from '../../projects/pages/toolTaskRows'

// The words and the dot are pure, in `shellCountWords`, so a test that stands in for the counts keeps them.
export interface ShellCounts {
  /** The bell's count: Needs you items not yet seen, and every open persistent one (`countsOnBell`). */
  unreadNotifications: number
  /** The person's own runs going now: the Runs panel's Running group. */
  runsInProgress: number
  /** What needs the person (D9: it lives in Runs only): the work done on their behalf that waits for them. */
  runsNeedingYou: number
}

export function useShellCounts(): ShellCounts {
  const { data: notifications = [] } = useQuery(getNotifications)
  const { data: runsInProgress = 0, refetch: refetchRuns } = useQuery(getMyRunsGoingCount)
  const onRunStatus = useCallback(() => { void refetchRuns() }, [refetchRuns])
  useSocketListener('agentRunStatus', onRunStatus)
  // Until runs carry what needs the person themselves, it is read from the tasks done on the person's behalf.
  const { data: tasks = [] } = useQuery(getMyTasks)
  return {
    unreadNotifications: notifications.filter(countsOnBell).length,
    runsInProgress,
    runsNeedingYou: needsYouCount(tasks),
  }
}

export { formatCount } from './shellCountWords'
