/**
 * The brief a run of a task carries when its task's thread asked for it (the overview's task-thread rules, 6): the
 * person's ask, kept sealed on the run_task operation the thread made, given to the run with its first message.
 * Read when the run is dispatched, from the oldest operation of the thread still waiting for a run.
 */
import { prisma } from 'wasp/server'
import { pickedSkillOf, type PickedSkill } from '@agenthix/core'
import { openJson, openText } from '../sealing'
import { BEFORE_ITS_RUN } from '../work/tasks/taskOperations'

export async function briefForTaskRun(taskId: string): Promise<string | null> {
  return (await askForTaskRun(taskId))?.brief ?? null
}

/** The thread's ask for the run: its brief, and the skill the person picked with `/` for it, when they picked one. */
export async function askForTaskRun(taskId: string): Promise<{ brief: string; skill: PickedSkill | null } | null> {
  const op = await prisma.operation.findFirst({
    where: { kind: 'TASK', taskId, state: { in: BEFORE_ITS_RUN }, brief: { not: null }, conversation: { home: 'TASK', taskId } },
    orderBy: { createdAt: 'asc' },
    select: { brief: true, args: true },
  })
  if (!op?.brief) return null
  const skill = op.args ? pickedSkillOf(openJson<{ skill?: unknown }>(op.args).skill) : null
  return { brief: openText(op.brief), skill }
}

const BRIEF_LEAD = "A person asked for this in the task's conversation. Do it now, in this run, even if the task is already " +
  'done or in review: it is new work on the same task.'

/**
 * The run's first message with the thread's brief after it. A person's ask is this run's work even on a task that is
 * done: without saying so, an agent that reads the task as complete only reports it.
 */
export function withBrief(inputText: string, brief: string | null): string {
  if (!brief) return inputText
  return `${inputText}\n\n${BRIEF_LEAD}\n\n${brief}`
}

