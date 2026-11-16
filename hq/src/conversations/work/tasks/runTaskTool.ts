/**
 * run_task as a conversation's operation-returning tool (workers and results spec, Results): a new run of the
 * task, started as the person's Run would start it, followed as the conversation's operation and completed by
 * that run. It returns at once; the run's result comes back as a completion.
 *
 * In a task's thread it is the start-work tool (the overview's task-thread rules, 6): it runs the thread's own
 * task when no other is named, with the person's ask as the run's brief, kept on the operation.
 */
import { z } from 'zod'
import { prisma } from 'wasp/server'
import { Logger } from '../../../server/utils/logger'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../../contract'
import { idempotencyKey } from '../../tools/turnTools'
import { continuationFor, THEN_DESCRIPTION } from '../continuation'
import { refusedBy, taskToolRefusal } from './gate'
import { taskIdFor } from '../../../server/controlplane/taskKey'
import { pendingWithKey } from './taskOperations'
import { queueAsPerson, startTaskOperation } from './startRun'
import { pickedSkillOfTurn } from '../pickedSkill'
import { livePreviewFeatureOn } from '../../../livePreviews/flag'
import { MODEL_CHOICE_MAX_CHARS, checkedTaskModel } from '../../../models-settings/taskModelChoice'
import { describeWorkerModels } from '../../../models-settings/startWorkModels'

const logger = new Logger('ConversationTasks')

export const RUN_TASK = 'run_task'

export const BRIEF_MAX_CHARS = 8_000

const input = z.object({
  taskId: z.string().optional().describe("The task's key or id; in a task's conversation, leave it out for this conversation's task"),
  brief: z.string().max(BRIEF_MAX_CHARS).optional()
    .describe("In a task's conversation: what the person asked for, in full. The run starts from this brief alone."),
  then: z.string().optional().describe(THEN_DESCRIPTION),
  model: z.string().max(MODEL_CHOICE_MAX_CHARS).optional().describe("Only when the person names a model: one of the values listed in this tool's description."),
})

export const RUN_TASK_DESCRIPTION =
  'Start a new run of a task now, as the person would press Run. It starts when the task\'s agent is free, and its ' +
  'result comes back here: do not wait for it. The task needs an agent.'

/** `livePreview`: whether the live preview's flag is on; off, the description says nothing of its app (adr-0172). */
export function describeRunTask(capability: Pick<TurnCapability, 'home'>, livePreview = false): string {
  if (capability.home !== 'TASK') return RUN_TASK_DESCRIPTION
  return 'Start work on this conversation\'s task: a new run of it, with what the person asked for as `brief`. ' +
    'Leave `taskId` out. Its result comes back here: do not wait for it. Use it for anything the task\'s own work ' +
    'does, whatever the ' +
    (livePreview
      ? 'task\'s state, a done task too: changing its code, or starting, changing or reloading its app in the live ' +
        'preview, since its run works on the task\'s branch and has the app tools.'
      : 'task\'s state, a done task too, such as changing its code, since its run works on the task\'s branch.')
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
  // A model the person named for this run is checked before anything is queued, and kept for this run only.
  const model = parsed.data.model ? await checkedTaskModel(parsed.data.model, await taskWhere(taskId, person)) : null
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
    model,
  })
}

async function taskWhere(taskId: string, userId: string) {
  const task = await prisma.task.findUniqueOrThrow({ where: { id: taskId }, select: { projectId: true, assignedAgentId: true } })
  return { projectId: task.projectId, agentId: task.assignedAgentId, userId }
}

export const runTaskTool: ConversationTool = {
  name: RUN_TASK,
  area: 'tasks',
  input,
  async describe(capability) {
    const described = describeRunTask(capability, capability.home === 'TASK' && (await livePreviewFeatureOn()))
    const personId = capability.actingUserId ?? capability.readerUserId
    // The models are a help to the lead; a description that cannot list them still describes the tool.
    const models = personId ? await describeWorkerModels(capability.agentId, personId).catch(() => []) : []
    return [described, ...models].join('\n')
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
