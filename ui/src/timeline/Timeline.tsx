import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { buildRows } from './rows'
import {
  chartView, dayAtScroll, DAY_MS, formatDay, LABEL_PX, ms, percentAt, PX_PER_DAY, scrollToDay, STEP_DAYS, todayUtc, trackPx,
  type TimelineView,
} from './layout'
import { TimelineRowView } from './TimelineRows'
import { TimelineToolbar } from './TimelineToolbar'
import { TimelineAgenda } from './TimelineAgenda'
import type {
  PlanChange, TimelineData, TimelineScale, TimelineShow, TimelineTaskData,
} from './types'

/** Below this width the timeline is an agenda. */
export const AGENDA_BELOW_PX = 640

// One shared set, so a board's own timeline (no hidden boards) does not rebuild its rows on every render.
const NO_HIDDEN_BOARDS: ReadonlySet<string> = new Set<string>()

export interface TimelineProps {
  scale: TimelineScale
  show: TimelineShow
  onScale: (scale: TimelineScale) => void
  onShow: (show: TimelineShow) => void
  data: TimelineData | undefined
  loading?: boolean
  now: Date
  /** Lane choice (the project's timeline); a board's own has none. */
  chooseBoards?: boolean
  hiddenBoardIds?: ReadonlySet<string>
  onToggleBoard?: (boardId: string) => void
  /** `auto` follows the width; the others force one. */
  layout?: 'auto' | 'grid' | 'agenda'
  onOpenTask: (task: TimelineTaskData) => void
  onChangePlan?: (task: TimelineTaskData, change: PlanChange) => void
  onChangeStartTime?: (task: TimelineTaskData, at: Date) => void
  /** A line above the chart for a failed change. */
  notice?: string
}

function useWidth(): [React.RefObject<HTMLDivElement | null>, number | null] {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const read = () => setWidth(el.getBoundingClientRect().width)
    read()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(read)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}

function Header({ view }: { view: TimelineView }) {
  return (
    <div className="border-b border-border bg-surface-1">
      <div className="flex">
        <div className="sticky left-0 z-10 w-44 shrink-0 bg-surface-1" />
        <div className="relative h-5 flex-1">
          {view.groups.map(g => (
            <span
              key={g.start} className="absolute truncate border-l border-border-subtle pl-1 text-micro font-medium text-text-muted"
              style={{ left: `${percentAt(view, g.start)}%`, width: `${percentAt(view, g.end) - percentAt(view, g.start)}%` }}
            >
              {g.label}
            </span>
          ))}
        </div>
      </div>
      <div className="flex">
        <div className="sticky left-0 z-10 w-44 shrink-0 bg-surface-1" />
        <div className="relative h-6 flex-1">
          {view.columns.map(c => (
            <span
              key={c.start} className={`absolute truncate text-center text-micro ${c.weekend ? 'text-text-muted' : 'text-text-secondary'}`}
              style={{ left: `${percentAt(view, c.start)}%`, width: `${percentAt(view, c.end) - percentAt(view, c.start)}%` }}
            >
              {c.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * The timeline (spec §3): a chart on a wide surface, an agenda on a narrow one. The chart covers every date
 * known and scrolls sideways across them, opening at today; ‹ › move by the scale.
 */
export function Timeline(props: TimelineProps) {
  const { scale, show, data, now, hiddenBoardIds, layout = 'auto', loading } = props
  const [wrapRef, width] = useWidth()
  const [folded, setFolded] = useState<ReadonlySet<string>>(new Set())
  const [leftDay, setLeftDay] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const positionedFor = useRef<TimelineScale | null>(null)
  const leftDayRef = useRef<number | null>(null)
  const today = todayUtc(now)
  const knownFrom = data?.from ? ms(data.from) : null
  const knownTo = data?.to ? ms(data.to) : null
  const view = useMemo(
    () => chartView(scale, knownFrom !== null && knownTo !== null ? { from: knownFrom, to: knownTo } : null, today, width ?? 960),
    [scale, knownFrom, knownTo, today, width],
  )
  const hidden = hiddenBoardIds ?? NO_HIDDEN_BOARDS
  const rows = useMemo(
    () => (data ? buildRows(data, { show, hiddenBoardIds: hidden, foldedBoardIds: folded, laneHeaders: !!props.chooseBoards }) : []),
    [data, show, hidden, folded, props.chooseBoards],
  )
  const agenda = layout === 'agenda' || (layout === 'auto' && width !== null && width > 0 && width < AGENDA_BELOW_PX)
  const toggleLane = useCallback((id: string) => setFolded(prev => {
    const next = new Set(prev)
    if (!next.delete(id)) next.add(id)
    return next
  }), [])
  const todayPercent = percentAt(view, today + 12 * 60 * 60 * 1000)
  const hasData = !!data

  // Opening, and a new scale, scroll to today; a range that grows keeps the date at the left edge where it was.
  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el || !hasData || width === null) return
    const viewport = el.clientWidth || width || 0
    const left = positionedFor.current !== scale || leftDayRef.current === null
      ? scrollToDay(view, today, viewport)
      : Math.round(((leftDayRef.current - view.from) / DAY_MS) * PX_PER_DAY[scale])
    el.scrollLeft = left
    positionedFor.current = scale
    leftDayRef.current = dayAtScroll(view, left)
    setLeftDay(leftDayRef.current)
  }, [view, scale, hasData, agenda, width === null]) // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scrollerRef.current
    if (!el) return
    leftDayRef.current = dayAtScroll(view, el.scrollLeft)
    setLeftDay(leftDayRef.current)
  }
  const scrollTo = (left: number, smooth: boolean) => {
    const el = scrollerRef.current
    if (!el) return
    if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' })
    else el.scrollLeft = left
  }
  const onStep = (d: 1 | -1) => {
    const el = scrollerRef.current
    if (el) scrollTo(el.scrollLeft + d * STEP_DAYS[scale] * PX_PER_DAY[scale], true)
  }
  const onToday = () => scrollTo(scrollToDay(view, today, scrollerRef.current?.clientWidth || width || 0), true)

  const visibleDays = Math.max(1, Math.round(((scrollerRef.current?.clientWidth || width || 960) - LABEL_PX) / PX_PER_DAY[scale]))
  const rangeText = leftDay === null || agenda ? '' : `${formatDay(leftDay)} – ${formatDay(leftDay + (visibleDays - 1) * DAY_MS)}`

  return (
    <div ref={wrapRef} className="pb-6">
      <TimelineToolbar
        rangeText={rangeText} scale={scale} show={show} onScale={props.onScale} onShow={props.onShow}
        onStep={onStep} onToday={onToday}
        boards={props.chooseBoards ? data?.boards : undefined} hiddenBoardIds={hidden} onToggleBoard={props.onToggleBoard}
      />
      {props.notice && <p role="status" className="px-4 pb-2 text-small text-text-secondary">{props.notice}</p>}
      {data?.runs.unavailable && <p className="px-4 pb-2 text-small text-text-muted">Runs could not be read from the site, so the work done is not shown.</p>}
      {data?.runs.truncated && <p className="px-4 pb-2 text-small text-text-muted">Older work in this range is left out.</p>}
      {data?.capped && <p className="px-4 pb-2 text-small text-text-muted">This project reaches further than a timeline can show: it shows only the part around today.</p>}
      {!data ? (
        <p className="px-4 py-6 text-small text-text-muted">{loading === false ? 'Nothing to show.' : 'Loading…'}</p>
      ) : agenda ? (
        <TimelineAgenda data={data} today={today} onOpen={props.onOpenTask} />
      ) : (
        <div ref={scrollerRef} className="overflow-x-auto" onScroll={onScroll} data-testid="timeline-scroller">
          <div className="relative border-y border-border" style={{ width: LABEL_PX + trackPx(view) }}>
            <div className="pointer-events-none absolute inset-y-0 left-44 right-0 z-0" ref={trackRef} data-testid="timeline-track" aria-hidden>
              {view.columns.map(c => (
                <span key={c.start} className={`absolute inset-y-0 border-l border-border-subtle ${c.weekend ? 'bg-surface-2/60' : ''}`}
                  style={{ left: `${percentAt(view, c.start)}%`, width: `${percentAt(view, c.end) - percentAt(view, c.start)}%` }} />
              ))}
              {todayPercent >= 0 && todayPercent <= 100 && (
                <span data-testid="today-line" className="absolute inset-y-0 w-px bg-accent" style={{ left: `${percentAt(view, today)}%` }} />
              )}
            </div>
            <Header view={view} />
            <div className="relative z-[1]">
              {rows.map((row, i) => (
                <TimelineRowView
                  key={`${row.kind}-${i}`} row={row} data={data} view={view} now={now.getTime()} trackRef={trackRef}
                  onChangePlan={props.onChangePlan} onChangeStartTime={props.onChangeStartTime} onOpen={props.onOpenTask}
                  onToggleLane={toggleLane}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
