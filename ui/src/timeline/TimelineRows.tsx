import { memo, type ReactNode } from 'react'
import { formatDay, ms, percentAt, spanBox, type TimelineView } from './layout'
import { TaskBar, type TaskBarProps } from './TaskBar'
import { slicesFor, type TimelineRow } from './rows'
import type { TimelineData } from './types'

type Shared = Pick<TaskBarProps, 'view' | 'now' | 'trackRef' | 'onChangePlan' | 'onChangeStartTime' | 'onOpen'>

const LABEL = 'sticky left-0 z-10 w-44 shrink-0 truncate bg-surface-1 px-3 text-small leading-8'

function Row({ label, indent, children }: { label: ReactNode; indent?: boolean; children?: ReactNode }) {
  return (
    <div className="flex border-t border-border-subtle">
      <div className={`${LABEL} ${indent ? 'pl-6' : ''}`}>{label}</div>
      <div className="relative min-w-0 flex-1">{children}</div>
    </div>
  )
}

function EpicMark() {
  return <span className="mr-1.5 rounded-md bg-accent-subtle px-1 text-micro font-medium text-accent">Epic</span>
}

function RowViewImpl({ row, data, onToggleLane, ...shared }: Shared & {
  row: TimelineRow
  data: TimelineData
  onToggleLane: (boardId: string) => void
}) {
  const { view } = shared
  switch (row.kind) {
    case 'lane':
      return (
        <div className="flex border-t border-border bg-surface-2">
          <button
            type="button" aria-expanded={!row.folded} onClick={() => onToggleLane(row.board.id)}
            className="sticky left-0 z-10 flex w-44 shrink-0 items-center gap-1 bg-surface-2 px-3 text-left text-small font-semibold leading-8 text-text-primary"
          >
            <span aria-hidden>{row.folded ? '▸' : '▾'}</span>
            <span className="truncate">{row.board.name}</span>
          </button>
          <span className="flex-1 px-2 text-micro leading-8 text-text-muted">
            {row.board.backlogCount > 0 ? `Backlog ${row.board.backlogCount}` : ''}
          </span>
        </div>
      )
    case 'sprints':
      return (
        <Row label={<span className="text-text-muted">Sprints</span>}>
          <div className="relative h-8">
            {row.board.sprints.map(s => {
              const box = spanBox(view, s.startDate, s.finishDate)
              if (!box) return null
              return (
                <span
                  key={s.id} title={`${s.label} · ${formatDay(s.startDate)} to ${formatDay(s.finishDate)}`}
                  className={`absolute top-1 flex h-6 items-center overflow-hidden rounded-md border px-2 text-micro ${
                    s.finishedAt ? 'border-border bg-surface-2 text-text-muted' : 'border-accent/40 bg-accent-subtle text-text-primary'}`}
                  style={{ left: `${box.left}%`, width: `${box.width}%` }}
                >
                  <span className="truncate">{s.label}</span>
                </span>
              )
            })}
          </div>
        </Row>
      )
    case 'epic':
      return (
        <Row label={<><EpicMark /><span className="font-semibold" title={row.epic.title}>{row.epic.title}</span></>} indent={row.indent}>
          <TaskBar task={row.epic} slices={slicesFor(data, row.epic.id)} {...shared} />
        </Row>
      )
    case 'task':
      return (
        <Row label={<span title={row.task.title}>{row.task.title}</span>} indent={row.indent}>
          <TaskBar task={row.task} slices={slicesFor(data, row.task.id)} {...shared} />
        </Row>
      )
    case 'rounds':
      return (
        <Row label={<span className="text-text-secondary" title={row.rounds.title}>{row.rounds.title}</span>}>
          <div className="relative h-8" data-testid={`rounds-${row.rounds.routineId}`}>
            {row.rounds.at.map(at => {
              const p = percentAt(view, ms(at))
              return p >= 0 && p <= 100
                ? <span key={String(at)} title={`Round ${formatDay(at)}`} className="absolute top-1.5 -ml-1.5 text-small leading-5 text-text-secondary" style={{ left: `${p}%` }}>▶</span>
                : null
            })}
            {row.rounds.more && <span className="absolute right-1 top-1.5 text-micro text-text-muted">more rounds not shown</span>}
          </div>
        </Row>
      )
    case 'milestone': {
      const p = percentAt(view, ms(row.milestone.date))
      return (
        <Row label={<span className="font-semibold">⚑ {row.milestone.name}</span>}>
          <div className="relative h-8">
            {p >= 0 && p <= 100 && (
              <span
                data-testid={`milestone-${row.milestone.id}`} title={`${row.milestone.name}, ${formatDay(row.milestone.date)}`}
                className="absolute top-1 -ml-1.5 whitespace-nowrap text-small leading-6 text-accent" style={{ left: `${p}%` }}
              >
                ⚑ <span className="text-micro text-text-secondary">{formatDay(row.milestone.date)}</span>
              </span>
            )}
          </div>
        </Row>
      )
    }
    case 'heading':
      return <div className="border-t border-border-subtle px-3 pt-2 text-micro font-medium uppercase tracking-wide text-text-muted">{row.label}</div>
    case 'empty':
      // Held at the left like the row labels, so it stays readable however far the chart is scrolled.
      return <div className="border-t border-border-subtle"><span className="sticky left-0 inline-block px-3 py-2 text-small text-text-muted">{row.label}</span></div>
  }
}


/** Memoised: scrolling re-renders the chart's frame, not every row of it. */
export const TimelineRowView = memo(RowViewImpl)
