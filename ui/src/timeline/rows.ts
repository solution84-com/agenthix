/** What each Show choice puts on the timeline, as an ordered list of rows (spec §3). Pure. */
import { ms } from './layout'
import type {
  TimelineLaneData, TimelineData, TimelineEpicData, TimelineMilestoneData, TimelineShow, TimelineTaskData,
} from './types'

export type TimelineRow =
  | { kind: 'lane'; lane: TimelineLaneData; folded: boolean }
  | { kind: 'sprints'; lane: TimelineLaneData }
  | { kind: 'epic'; epic: TimelineEpicData; indent: boolean }
  | { kind: 'task'; task: TimelineTaskData; indent: boolean }
  | { kind: 'milestone'; milestone: TimelineMilestoneData }
  | { kind: 'heading'; id: string; label: string }
  | { kind: 'empty'; id: string; label: string }

export interface RowOptions {
  show: TimelineShow
  /** Lanes the person chose not to show (Types ▾). */
  hiddenLaneIds: ReadonlySet<string>
  /** Lanes folded away. */
  foldedLaneIds: ReadonlySet<string>
  /** Off where there is one lane, which its header would only repeat. */
  laneHeaders?: boolean
}

const when = (t: TimelineTaskData): number => {
  const at = t.planStart ?? t.planFinish ?? t.startAt
  return at ? ms(at) : Number.MAX_SAFE_INTEGER
}
const epicWhen = (e: TimelineEpicData): number => (e.span ? ms(e.span.start) : when(e))
const byWhen = <T,>(key: (x: T) => number) => (a: T, b: T) => key(a) - key(b)

function laneRows(data: TimelineData, lane: TimelineLaneData, show: TimelineShow): TimelineRow[] {
  const epics = data.epics.filter(e => e.laneId === lane.id).sort(byWhen(epicWhen))
  const rows: TimelineRow[] = []
  if (lane.sprints.length > 0) rows.push({ kind: 'sprints', lane })

  if (show === 'epics') {
    for (const epic of epics) rows.push({ kind: 'epic', epic, indent: false })
  } else {
    const inLane = new Set(epics.map(e => e.id))
    const mine = data.tasks.filter(t => t.laneId === lane.id)
    for (const epic of epics) {
      rows.push({ kind: 'epic', epic, indent: false })
      for (const task of mine.filter(t => t.epicId === epic.id).sort(byWhen(when))) rows.push({ kind: 'task', task, indent: true })
    }
    for (const task of mine.filter(t => !t.epicId || !inLane.has(t.epicId)).sort(byWhen(when))) {
      rows.push({ kind: 'task', task, indent: false })
    }
  }
  if (rows.length === (lane.sprints.length > 0 ? 1 : 0)) rows.push({ kind: 'empty', id: lane.id, label: 'Nothing here in this range.' })
  return rows
}

function milestoneRows(data: TimelineData, hidden: ReadonlySet<string>): TimelineRow[] {
  const rows: TimelineRow[] = []
  const epicById = new Map(data.epics.filter(e => !e.laneId || !hidden.has(e.laneId)).map(e => [e.id, e]))
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

export function buildRows(data: TimelineData, { show, hiddenLaneIds, foldedLaneIds, laneHeaders = true }: RowOptions): TimelineRow[] {
  if (show === 'milestones') return milestoneRows(data, hiddenLaneIds)
  return data.lanes
    .filter(l => !hiddenLaneIds.has(l.id))
    .flatMap<TimelineRow>(lane => {
      if (!laneHeaders) return laneRows(data, lane, show)
      const folded = foldedLaneIds.has(lane.id)
      return [{ kind: 'lane', lane, folded }, ...(folded ? [] : laneRows(data, lane, show))]
    })
}

/** The task a row stands for, if any, so a run's slices can be found for it. */
export const slicesFor = (data: TimelineData, taskId: string) => data.runs.slices.filter(s => s.taskId === taskId)
