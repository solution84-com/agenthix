/**
 * The brief a run of a task carries when its task's thread asked for it (the overview's task-thread rules, 6): the
 * person's ask, kept sealed on the run_task operation the thread made, given to the run with its first message.
 * Read when the run is dispatched, from the oldest operation of the thread still waiting for a run.
 */
import { prisma } from 'wasp/server'
import { openText } from '../sealing'
import { BEFORE_ITS_RUN } from '../work/tasks/taskOperations'

export async function briefForTaskRun(taskId: string): Promise<string | null> {
  const op = await prisma.operation.findFirst({
    where: { kind: 'TASK', taskId, state: { in: BEFORE_ITS_RUN }, brief: { not: null }, conversation: { home: 'TASK', taskId } },
    orderBy: { createdAt: 'asc' },
    select: { brief: true },
  })
  return op?.brief ? openText(op.brief) : null
}

/** The run's first message with the thread's brief after it. */
export function withBrief(inputText: string, brief: string | null): string {
  return brief ? `${inputText}\n\nWhat was asked for in the task's conversation:\n\n${brief}` : inputText
}
