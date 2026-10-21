/** What each Show choice puts on the timeline, as an ordered list of rows (spec §3). Pure. */
import { ms } from './layout'
import type {
  TimelineBoardData, TimelineData, TimelineEpicData, TimelineMilestoneData, TimelineRoundsData, TimelineShow, TimelineTaskData,
} from './types'

export type TimelineRow =
  | { kind: 'lane'; board: TimelineBoardData; folded: boolean }
  | { kind: 'sprints'; board: TimelineBoardData }
  | { kind: 'epic'; epic: TimelineEpicData; indent: boolean }
  | { kind: 'task'; task: TimelineTaskData; indent: boolean }
  | { kind: 'rounds'; rounds: TimelineRoundsData }
  | { kind: 'milestone'; milestone: TimelineMilestoneData }
  | { kind: 'heading'; id: string; label: string }
  | { kind: 'empty'; id: string; label: string }

export interface RowOptions {
  show: TimelineShow
  /** Lanes the person chose not to show (Boards ▾). */
  hiddenBoardIds: ReadonlySet<string>
  /** Lanes folded away. */
  foldedBoardIds: ReadonlySet<string>
  /** Off on a board's own timeline, where the lane would only repeat the board. */
  laneHeaders?: boolean
}

const when = (t: TimelineTaskData): number => {
  const at = t.planStart ?? t.planFinish ?? t.startAt ?? t.roundAt
  return at ? ms(at) : Number.MAX_SAFE_INTEGER
}
const epicWhen = (e: TimelineEpicData): number => (e.span ? ms(e.span.start) : when(e))
const byWhen = <T,>(key: (x: T) => number) => (a: T, b: T) => key(a) - key(b)

function laneRows(data: TimelineData, board: TimelineBoardData, show: TimelineShow): TimelineRow[] {
  const epics = data.epics.filter(e => e.boardId === board.id).sort(byWhen(epicWhen))
  const rows: TimelineRow[] = []
  if (board.sprints.length > 0) rows.push({ kind: 'sprints', board })

  if (show === 'epics') {
    for (const epic of epics) rows.push({ kind: 'epic', epic, indent: false })
  } else {
    const inLane = new Set(epics.map(e => e.id))
    const mine = data.tasks.filter(t => t.boardId === board.id)
    for (const epic of epics) {
      rows.push({ kind: 'epic', epic, indent: false })
      for (const task of mine.filter(t => t.epicId === epic.id).sort(byWhen(when))) rows.push({ kind: 'task', task, indent: true })
    }
    for (const task of mine.filter(t => !t.epicId || !inLane.has(t.epicId)).sort(byWhen(when))) {
      rows.push({ kind: 'task', task, indent: false })
    }
    for (const rounds of data.routineRounds.filter(r => r.boardId === board.id)) rows.push({ kind: 'rounds', rounds })
  }
  if (rows.length === (board.sprints.length > 0 ? 1 : 0)) rows.push({ kind: 'empty', id: board.id, label: 'Nothing here in this range.' })
  return rows
}

function milestoneRows(data: TimelineData, hidden: ReadonlySet<string>): TimelineRow[] {
  const rows: TimelineRow[] = []
  const epicById = new Map(data.epics.filter(e => !e.boardId || !hidden.has(e.boardId)).map(e => [e.id, e]))
  const placed = new Set<string>()
  for (const milestone of [...data.milestones].sort(byWhen(m => ms(m.date)))) {
    rows.push({ kind: 'milestone', milestone })
    for (const id of milestone.epicIds) {
      const epic = epicById.get(id)
      if (!epic) continue
      placed.add(id)
      rows.push({ kind: 'epic', epic, indent: true })
    }
  }
  const rest = [...epicById.values()].filter(e => !placed.has(e.id)).sort(byWhen(epicWhen))
  if (rest.length > 0) {
    rows.push({ kind: 'heading', id: 'no-milestone', label: 'Not under a milestone in view' })
    for (const epic of rest) rows.push({ kind: 'epic', epic, indent: false })
  }
  if (rows.length === 0) rows.push({ kind: 'empty', id: 'milestones', label: 'No milestones or epics in this range.' })
  return rows
}

export function buildRows(data: TimelineData, { show, hiddenBoardIds, foldedBoardIds, laneHeaders = true }: RowOptions): TimelineRow[] {
  if (show === 'milestones') return milestoneRows(data, hiddenBoardIds)
  return data.boards
    .filter(b => !hiddenBoardIds.has(b.id))
    .flatMap<TimelineRow>(board => {
      if (!laneHeaders) return laneRows(data, board, show)
      const folded = foldedBoardIds.has(board.id)
      return [{ kind: 'lane', board, folded }, ...(folded ? [] : laneRows(data, board, show))]
    })
}

/** The task a row stands for, if any, so a run's slices can be found for it. */
export const slicesFor = (data: TimelineData, taskId: string) => data.runs.slices.filter(s => s.taskId === taskId)
