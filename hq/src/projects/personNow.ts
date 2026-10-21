/**
 * One person's share of a project's work (personWork.ts reads the rows). A task
 * waits on the person its run is for — who started the run when someone did,
 * else the person it is done on behalf of (adr-0095); their tasks are the ones
 * done on their behalf. Pure, so the rule is tested on its own.
 */
import { countByState, summariseNow, nowItems, type AgentNow, type NowItem, type TaskStateCounts, type WorkTask } from '../agents/agentNow'

export type PersonNow = Omit<AgentNow, 'next'>

export type PersonWork = {
  now: PersonNow
  items: NowItem[]
  tasks: TaskStateCounts
  lastActiveAt: Date | null
}

export type PersonTask = WorkTask & { onBehalfOfUserId: string; runOnBehalfOfUserId: string | null }

const runPersonOf = (t: Pick<PersonTask, 'onBehalfOfUserId' | 'runOnBehalfOfUserId'>) => t.runOnBehalfOfUserId ?? t.onBehalfOfUserId

/** Pure: one person's share of the project's open tasks and done counts. */
export function workOfPerson(
  userId: string,
  open: PersonTask[],
  doneByPerson: Map<string, number>,
): Omit<PersonWork, 'lastActiveAt'> {
  const waitingOn = open.filter(t => runPersonOf(t) === userId)
  const { next: _next, ...now } = summariseNow(waitingOn, [], new Date())
  const tasks = countByState(open.filter(t => t.onBehalfOfUserId === userId))
  const done = doneByPerson.get(userId) ?? 0
  return { now, items: nowItems(waitingOn), tasks: { ...tasks, done: tasks.done + done, total: tasks.total + done } }
}

