/** A task's plan, an epic's span and the rules of epics and milestones (adr-0098). Pure. */
import { HttpError } from 'wasp/server'
import { AGENT_BEFORE_EPIC } from './epicRules'

type Plan = { planStart: Date | null; planFinish: Date | null }

function toDay(value: string, what: string): Date {
  const at = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00.000Z` : value)
  if (Number.isNaN(at.getTime())) throw new HttpError(400, `The ${what} "${value}" is not a date`)
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
}

/** The plan fields a change writes: a date string sets one, null clears it, absent leaves it. */
export function planDates(input: { planStart?: string | null; planFinish?: string | null }): Partial<Plan> {
  const out: Partial<Plan> = {}
  if (input.planStart !== undefined) out.planStart = input.planStart === null ? null : toDay(input.planStart, 'start date')
  if (input.planFinish !== undefined) out.planFinish = input.planFinish === null ? null : toDay(input.planFinish, 'finish date')
  if (out.planStart && out.planFinish && out.planFinish < out.planStart) {
    throw new HttpError(400, 'A plan\'s finish date cannot be before its start date')
  }
  return out
}

/** Refuses a finish before a start once a change is merged with what the task already has. */
export function refuseInvertedPlan(plan: Plan): void {
  if (plan.planStart && plan.planFinish && plan.planFinish < plan.planStart) {
    throw new HttpError(400, 'A plan\'s finish date cannot be before its start date')
  }
}

/** An epic's span: its own plan, each end it lacks taken from the span of its tasks' plans. */
export function epicSpan(epic: Plan, tasks: Plan[]): { start: Date; finish: Date; fromTasks: boolean } | null {
  const dates = tasks.flatMap(t => [t.planStart, t.planFinish]).filter((d): d is Date => d !== null)
  const min = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null
  const max = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null
  const start = epic.planStart ?? min
  const finish = epic.planFinish ?? max
  if (!start || !finish) return null
  return { start, finish, fromTasks: !epic.planStart && !epic.planFinish }
}

type TaskSide = { id: string; projectId: string; isEpic: boolean; epicId: string | null; hasTasks: boolean; assignedAgentId?: string | null }
type Change = {
  isEpic?: boolean
  epic?: { id: string; projectId: string; isEpic: boolean } | null
  milestone?: { projectId: string } | null
}

/** A task belongs to at most one epic, an epic to none, and only an epic has a milestone. */
export function refuseEpicRules(task: TaskSide, change: Change): void {
  const isEpic = change.isEpic ?? task.isEpic
  if (change.isEpic === false && task.isEpic && task.hasTasks) {
    throw new HttpError(400, 'This epic still groups tasks: move them out of it first')
  }
  if (change.isEpic === true && !task.isEpic && task.assignedAgentId) throw new HttpError(400, AGENT_BEFORE_EPIC)
  const inEpic = change.epic !== undefined ? change.epic !== null : task.epicId !== null
  if (isEpic && inEpic) throw new HttpError(400, 'An epic cannot belong to an epic')
  if (change.epic) {
    if (change.epic.id === task.id) throw new HttpError(400, 'A task cannot be its own epic')
    if (!change.epic.isEpic) throw new HttpError(400, 'That task is not an epic')
    if (change.epic.projectId !== task.projectId) throw new HttpError(400, 'An epic groups tasks of its own project')
  }
  if (change.milestone) {
    if (!isEpic) throw new HttpError(400, 'Only an epic has a milestone')
    if (change.milestone.projectId !== task.projectId) throw new HttpError(400, 'A milestone belongs to its own project')
  }
}
