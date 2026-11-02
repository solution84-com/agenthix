/**
 * run_task as a conversation's operation-returning tool (workers and results spec, Results): a new run of the
 * task, started as the person's Run would start it, followed as the conversation's operation and completed by
 * that run. It returns at once; the run's result comes back as a completion.
 *
 * In a task's thread it is the start-work tool (the overview's task-thread rules, 6): it runs the thread's own
 * task when no other is named, with the person's ask as the run's brief, kept on the operation.
 */
import { z } from 'zod'
import { Logger } from '../../../server/utils/logger'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../../contract'
import { idempotencyKey } from '../../tools/turnTools'
import { continuationFor, THEN_DESCRIPTION } from '../continuation'
import { refusedBy, taskToolRefusal } from './gate'
import { taskIdFor } from '../../../server/controlplane/taskKey'
import { pendingWithKey } from './taskOperations'
import { queueAsPerson, startTaskOperation } from './startRun'
import { pickedSkillOfTurn } from '../pickedSkill'

const logger = new Logger('ConversationTasks')

export const RUN_TASK = 'run_task'

export const BRIEF_MAX_CHARS = 8_000

const input = z.object({
  taskId: z.string().optional().describe("The task to run, by its key (e.g. WAL-2) or its id; in a task's conversation, leave it out to run this conversation's task"),
  brief: z.string().max(BRIEF_MAX_CHARS).optional()
    .describe("In a task's conversation: what the person asked for, in full, as the run's brief. It sees nothing of this conversation."),
  then: z.string().optional().describe(THEN_DESCRIPTION),
})

export const RUN_TASK_DESCRIPTION =
  'Start a new run of a task now, as the person you are talking to would press Run. It returns at once: the run ' +
  'goes on in the background, starting when the task\'s agent is free, and its result comes back to this ' +
  'conversation when it ends: do not wait for it. When you start it, say in one short line, in the first person ' +
  'and in the same step as the call, what you are doing. The task needs an agent assigned to it.'

export function describeRunTask(capability: Pick<TurnCapability, 'home'>): string {
  if (capability.home !== 'TASK') return RUN_TASK_DESCRIPTION
  return 'Start work on this conversation\'s task: a new run of it, as the person you are talking to would press ' +
    'Run, with what they asked for as `brief` — everything the run needs, since it sees nothing of this ' +
    'conversation. Leave `taskId` out. It returns at once; the run goes on in the background and its result comes ' +
    'back here when it ends: do not wait for it. When you start it, say in one short line, in the first person and ' +
    'in the same step as the call, what you are doing. Use it for anything the task\'s own work does, whatever the ' +
    'task\'s state, a done task too: changing its code, or starting, changing or reloading its app in the live ' +
    'preview, since its run works on the task\'s branch and has the app tools.'
}

export async function runTaskCall(capability: TurnCapability, raw: unknown): Promise<ToolCallOutcome> {
  const refusal = taskToolRefusal(capability, RUN_TASK)
  const person = capability.actingUserId
  if (refusal || !person) return { status: 'refused', reason: refusal ?? 'This turn acts for no one' }
  const parsed = input.safeParse(raw ?? {})
  if (!parsed.success) return { status: 'refused', reason: `The arguments do not fit ${RUN_TASK}: ${parsed.error.issues.map(i => i.message).join('; ')}` }
  const named = parsed.data.taskId ?? (capability.home === 'TASK' ? capability.taskId : null)
  if (!named) return { status: 'refused', reason: 'Name the task to run' }
  const found = await taskIdFor(named)
  if ('refusal' in found) return { status: 'refused', reason: found.refusal }
  const { taskId } = found
  const { then } = parsed.data
  const brief = capability.home === 'TASK' && taskId === capability.taskId ? parsed.data.brief?.trim() || null : null

  const key = idempotencyKey(RUN_TASK, { taskId })
  const pending = await pendingWithKey(capability.conversationId, key)
  if (pending) return { status: 'accepted', operationId: pending }

  const turn = { ...capability, actingUserId: person }
  const task = await queueAsPerson(turn, taskId, RUN_TASK)
  if ('refusal' in task) return { status: 'refused', reason: task.refusal }
  return startTaskOperation({
    capability: turn,
    task,
    toolName: RUN_TASK,
    idempotencyKey: key,
    continuation: continuationFor(capability, then),
    brief,
    skill: brief ? await pickedSkillOfTurn(capability.turnId) : null,
  })
}

export const runTaskTool: ConversationTool = {
  name: RUN_TASK,
  input,
  async describe(capability) {
    return describeRunTask(capability)
  },
  async offered(capability) {
    return taskToolRefusal(capability, RUN_TASK) === null
  },
  async run(capability, raw) {
    try {
      return await runTaskCall(capability, raw)
    } catch (err) {
      return refusedBy(RUN_TASK, err, (message, e) => logger.error(message, e))
    }
  },
}
