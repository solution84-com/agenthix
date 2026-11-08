import type { RefObject } from 'react'
import { dragPlan, formatDay, formatTime, moveStartTime, ms, percentAt, planBox, sliceBox, type DragMode, type TimelineView } from './layout'
import { barTone, NEEDS_YOU_OUTLINE } from './barStyle'
import { useBarDrag } from './useBarDrag'
import type { PlanChange, TimelineEpicData, TimelineSlice, TimelineTaskData } from './types'

type Mode = DragMode | 'start-time'

export interface TaskBarProps {
  task: TimelineTaskData | TimelineEpicData
  view: TimelineView
  now: number
  slices: TimelineSlice[]
  trackRef: RefObject<HTMLElement | null>
  /** Absent: a plan cannot be dragged here. */
  onChangePlan?: (task: TimelineTaskData, change: PlanChange) => void
  /** Absent: ▶ cannot be dragged here. */
  onChangeStartTime?: (task: TimelineTaskData, at: Date) => void
  onOpen: (task: TimelineTaskData) => void
}

const isEpic = (t: TimelineTaskData | TimelineEpicData): t is TimelineEpicData => 'span' in t

/**
 * One task's row on the track, three things kept apart (adr-0098): the bar is its
 * plan, ▶ is when its agent is set to start, and the darker slices are the runs.
 * Dragging the bar or an end changes only the plan; dragging ▶ changes only the
 * start time.
 */
export function TaskBar({ task, view, now, slices, trackRef, onChangePlan, onChangeStartTime, onOpen }: TaskBarProps) {
  const epic = isEpic(task) ? task : null
  const derived = !!epic?.span?.fromTasks && !task.planStart && !task.planFinish
  const plan = derived ? { planStart: epic!.span!.start, planFinish: epic!.span!.finish } : { planStart: task.planStart, planFinish: task.planFinish }
  const startTime = task.startAt

  const { drag, begin, onClick, onKeyDown } = useBarDrag<Mode>({
    trackRef, view,
    enabled: mode => (mode === 'start-time' ? !!onChangeStartTime && !!startTime : !!onChangePlan && !derived),
    onCommit: (mode, days) => {
      if (mode === 'start-time') { if (startTime) onChangeStartTime?.(task, moveStartTime(startTime, days)) }
      else {
        const next = dragPlan(plan, mode, days)
        if (next) onChangePlan?.(task, next)
      }
    },
    onClick: () => onOpen(task),
  })

  const shownPlan = drag && drag.mode !== 'start-time' ? dragPlan(plan, drag.mode, drag.days) : null
  const box = planBox(view, shownPlan?.planStart ?? plan.planStart, shownPlan?.planFinish ?? plan.planFinish)
  const tone = barTone(task)
  const markerAt = startTime ? (drag?.mode === 'start-time' ? moveStartTime(startTime, drag.days) : startTime) : null
  const markerPercent = markerAt ? percentAt(view, ms(markerAt)) : null
  const draggablePlan = !!onChangePlan && !derived

  const planTitle = [
    task.title,
    plan.planStart ? `Plan ${formatDay(plan.planStart)}${plan.planFinish ? ` to ${formatDay(plan.planFinish)}` : ''}` : null,
    derived ? 'Spans its tasks' : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="relative h-8">
      {box && (
        <div
          role="button" tabIndex={0} title={planTitle} aria-label={`${task.title}, open`}
          data-testid={`bar-${task.id}`}
          className={`absolute top-1 flex h-6 select-none items-center overflow-hidden rounded-md border ${tone.bar} ${
            task.needsYou ? NEEDS_YOU_OUTLINE : ''} ${derived ? 'border-dashed' : ''} ${draggablePlan ? 'cursor-grab touch-none' : 'cursor-pointer'}`}
          style={{ left: `${box.left}%`, width: `${box.width}%` }}
          onPointerDown={begin('move')} onClick={onClick} onKeyDown={onKeyDown}
        >
          {draggablePlan && !box.clippedStart && (
            <span data-testid={`start-${task.id}`} className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-ew-resize" onPointerDown={begin('start')} />
          )}
          <span className={`relative truncate px-2 text-micro text-text-primary ${epic ? 'font-semibold' : ''}`}>{task.title}</span>
          {draggablePlan && !box.clippedEnd && (
            <span data-testid={`finish-${task.id}`} className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-ew-resize" onPointerDown={begin('finish')} />
          )}
        </div>
      )}
      {/* Work done is drawn where it happened: inside the plan's bar, or outside it when the run kept to no plan. */}
      {slices.map(s => {
        const slice = sliceBox(view, s.start, s.end, now)
        if (!slice) return null
        return (
          <span
            key={s.runId} data-testid="slice" title={`Work ${formatDay(s.start)}, ${formatTime(s.start)}`}
            className={`pointer-events-none absolute top-2 z-[5] h-4 rounded-sm ${tone.slice}`} style={{ left: `${slice.left}%`, width: `${slice.width}%` }}
          />
        )
      })}
      {markerPercent !== null && markerPercent >= 0 && markerPercent <= 100 && markerAt && (
        <span
          data-testid={`play-${task.id}`}
          title={`Starts ${formatDay(markerAt)}, ${formatTime(markerAt)}`}
          className={`absolute top-1.5 z-20 -ml-1.5 select-none text-small leading-5 text-text-primary ${startTime && onChangeStartTime ? 'cursor-ew-resize touch-none' : ''}`}
          style={{ left: `${markerPercent}%` }}
          onPointerDown={begin('start-time')}
        >
          ▶
        </span>
      )}
    </div>
  )
}
