import { useState } from 'react'
import { useQuery, useAction, getTimeline, updateTaskPlan, setTaskSchedule } from 'wasp/client/operations'
import {
  DEFAULT_SHOW,
  type PlanChange, type TimelineData, type TimelineScale, type TimelineShow, type TimelineTaskData,
} from '@agenthix/ui/timeline'
import { useNow } from '../pages/useNow'
import { useMayWork } from '../../shared/hooks/useMayWork'

/** How often the timeline is read again, so a run's slice grows while the person watches. */
const TIMELINE_REFRESH_MS = 30_000

const failure = (e: unknown) => (e instanceof Error ? e.message : 'That did not work')

/**
 * The timeline's state and reads for one project, or one of its boards: the scale,
 * what is shown, the timeline read across everything known, and
 * the two changes a drag can make — the plan, and the start time. Nothing else
 * moves from here (adr-0098).
 */
export function useTimelineScreen({ projectId, boardId, initialScale }: {
  projectId: string
  boardId?: string
  initialScale: TimelineScale
}) {
  const now = useNow()
  const [scale, setScaleState] = useState<TimelineScale>(initialScale)
  const [showChoice, setShowChoice] = useState<TimelineShow | null>(null)
  const [notice, setNotice] = useState('')
  const canStart = useMayWork(projectId)
  const planFn = useAction(updateTaskPlan)
  const startFn = useAction(setTaskSchedule)

  // No range is asked for: the server reads everything known, and the chart scrolls across it.
  const { data, isLoading } = useQuery(getTimeline, { projectId, boardId }, { refetchInterval: TIMELINE_REFRESH_MS })

  return {
    now,
    scale,
    show: showChoice ?? DEFAULT_SHOW[scale],
    data: data as unknown as TimelineData | undefined,
    loading: isLoading,
    notice,
    onScale: (next: TimelineScale) => { setScaleState(next); setShowChoice(null) },
    onShow: setShowChoice,
    onChangePlan: async (task: TimelineTaskData, change: PlanChange) => {
      setNotice('')
      try { await planFn({ taskId: task.id, ...change }) } catch (e) { setNotice(failure(e)) }
    },
    onChangeStartTime: canStart
      ? async (task: TimelineTaskData, at: Date) => {
        setNotice('')
        try { await startFn({ taskId: task.id, at: at.toISOString() }) } catch (e) { setNotice(failure(e)) }
      }
      : undefined,
  }
}
