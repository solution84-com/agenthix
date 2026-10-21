/** What the timeline screens draw. The shape is the timeline query's, with dates as dates or their ISO strings. */

export type Instant = Date | string

export interface TimelineAgent { id: string; name: string; handle: string }

export interface TimelineTaskData {
  id: string
  key: string
  title: string
  boardId: string | null
  column: string | null
  status: string
  runState: string
  needsYou: boolean
  assignedAgent: TimelineAgent | null
  epicId?: string | null
  milestoneId?: string | null
  planStart: Instant | null
  planFinish: Instant | null
  /** ▶ the task's own start time. */
  startAt: Instant | null
  /** ▶ the round of the routine that made it. */
  roundAt: Instant | null
  routineId: string | null
}

export interface TimelineEpicData extends TimelineTaskData {
  span: { start: Instant; finish: Instant; fromTasks: boolean } | null
  taskIds: string[]
}

export interface TimelineSprintData {
  id: string
  number: number
  label: string
  startDate: Instant
  finishDate: Instant
  finishedAt: Instant | null
}

export interface TimelineBoardData {
  id: string
  name: string
  kind: string
  backlogCount: number
  sprints: TimelineSprintData[]
}

export interface TimelineMilestoneData { id: string; name: string; date: Instant; epicIds: string[] }

export interface TimelineRoundsData { routineId: string; title: string; boardId: string; at: Instant[]; more: boolean }

export interface TimelineSlice { runId: string; taskId: string; status: string; start: string; end: string | null }

export interface TimelineData {
  /** The range the timeline was read for: all that is known, or a window around today when it is more than a range may be. */
  from?: Instant
  to?: Instant
  capped?: boolean
  boards: TimelineBoardData[]
  tasks: TimelineTaskData[]
  epics: TimelineEpicData[]
  milestones: TimelineMilestoneData[]
  routineRounds: TimelineRoundsData[]
  runs: { slices: TimelineSlice[]; unavailable: string | null; truncated: boolean }
}

export type TimelineScale = 'week' | 'month' | 'quarter'
/** What is drawn: tasks under their epic, epics, or milestones with their epics under them. */
export type TimelineShow = 'tasks' | 'epics' | 'milestones'

export const SCALE_LABEL: Record<TimelineScale, string> = { week: 'Week', month: 'Month', quarter: 'Quarter' }
export const SHOW_LABEL: Record<TimelineShow, string> = { tasks: 'Tasks', epics: 'Epics', milestones: 'Milestones' }

/** Each scale opens on what suits it (spec §3): Week on tasks, Month on epics, Quarter on milestones. */
export const DEFAULT_SHOW: Record<TimelineScale, TimelineShow> = { week: 'tasks', month: 'epics', quarter: 'milestones' }

/** A plan change a drag makes: whole days, `YYYY-MM-DD`. */
export interface PlanChange { planStart: string; planFinish: string }
