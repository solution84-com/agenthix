/**
 * create_task as a conversation's tool (workers and results spec, Results): the three asks, by `when`. *Now*
 * creates it and starts its run as the person's, followed as an operation; *later* creates it in the backlog,
 * a quick call with no operation to follow; *at a time* creates it with that start time, and setting it is done
 * in the turn: its run at that time is the task's own, and nothing comes back to the conversation (walkthrough
 * finding 33). The task itself is created through the one tool entry, as the person, under the same rules as
 * every other caller of create_task.
 */
import { z } from 'zod'
import { prisma } from 'wasp/server'
import { callOperation } from '../../../server/controlplane/operations'
import { CONTROL_PLANE_TOOLS } from '../../../server/controlplane/toolSchemas'
import { ControlPlaneError } from '../../../server/controlplane/types'
import { readingZone } from '../../../server/controlplane/personTimezone'
import { readTimeIn } from '../../../automation/zonedInput'
import { isValidTimezone } from '../../../automation/scheduleRule'
import { ScheduleError, setTaskSchedule, toStartTime } from '../../../automation/taskSchedule'
import { requireProjectEntitlement } from '../../../server/controlplane/authorize'
import { Logger } from '../../../server/utils/logger'
import type { ConversationTool, ToolCallOutcome, TurnCapability } from '../../contract'
import { idempotencyKey } from '../../tools/turnTools'
import { operationRows } from '../../tools/operationRows'
import { continuationFor, THEN_DESCRIPTION } from '../continuation'
import { refusedBy, taskToolRefusal } from './gate'
import { createSetTaskOperation, pendingWithKey } from './taskOperations'
import { admittedBoundaries, placeLine, placesNamed, projectWords } from '../boundaries'
import { workspaceLines } from '../../../branches/leadWorkspaces'
import { queueAsPerson, startTaskOperation } from './startRun'
import { laterLine, readWhen, WHEN_DESCRIPTION, type TaskWhen } from './when'
import { modelForCreatedTask } from './taskModel'
import { MODEL_CHOICE_MAX_CHARS } from '../../../models-settings/taskModelChoice'
import { describeWorkerModels } from '../../../models-settings/startWorkModels'

const logger = new Logger('ConversationTasks')

/** A task set for a time does not come back to the conversation, so nothing can follow it here. */
export const NO_THEN_AT_A_TIME =
  "A task set for a time does not come back to this conversation, so nothing can follow it here: leave out `then`, or start it now"

export const CREATE_TASK = 'create_task'

// create_task's own fields; whether it runs is what `when` says, so its `queue` is not offered here.
// workspaceId is asked for on every call, null allowed, so a model decides it rather than leaving it out; a call
// without it reads as null, and null as no workspace.
const { workspaceId: _workspaceId, queue: _queue, ...fields } = CONTROL_PLANE_TOOLS.find(t => t.name === CREATE_TASK)!.schema
const input = z.object({
  ...fields,
  projectId: z.string().describe("The project this task belongs to: its key (the letters before a task's number), its name, or its id"),
  workspaceId: z.preprocess(v => v ?? null, z.string().nullable()).describe(
    'The workspace the task works in: the workspaceId of a code workspace for work that changes its code, or null for work in the project\'s files',
  ),
  when: z.string().describe(WHEN_DESCRIPTION),
  timezone: z.string().optional().describe('IANA timezone an offset-less `when` time is read in; omit it for the person\'s own'),
  then: z.string().optional().describe(THEN_DESCRIPTION),
  model: z.string().max(MODEL_CHOICE_MAX_CHARS).optional().describe("The model the person's own words name for this task, exactly as one of the values listed in this tool's description. Leave out unless they name one: the task then keeps this conversation's model."),
})
/** The fields this tool reads itself; the rest go to create_task as they came, validated by its own schema. */
type Args = Record<string, unknown> & {
  title: string
  projectId: string
  columnId?: string
  state?: string
  assignedAgentId?: string
  when: string
  timezone?: string
  then?: string
  model?: string
}
type Person = TurnCapability & { actingUserId: string }

export const CREATE_TASK_DESCRIPTION =
  'Create a task in a project, for now, for later, or for a time. For now, the work then goes on in the background ' +
  'and its first run\'s result comes back to this conversation, so do not wait for it. When you start it, say in ' +
  'one short line, in the first person and in the same step as the call, what you are doing: "I\'ve started WAL-5 ' +
  'Tidy the backlog." For a time, setting it is the whole of it: its runs are the project\'s own, seen on its ' +
  'board, and nothing comes back here. Say when it starts: "I\'ve set Morning check to start tomorrow at 9:00." ' +
  'Later runs of the task are the project\'s own.'

/** The project's id, from its id, key or name as the lead passed it, or why the words name no one project. */
export async function projectIdFor(personId: string, words: string): Promise<{ projectId: string } | { refusal: string }> {
  const byId = await prisma.project.findUnique({ where: { id: words.trim() }, select: { id: true } })
  if (byId) return { projectId: byId.id }
  const found = (await placesNamed(personId, words)).filter(p => p.type === 'project')
  if (found.length === 1) return { projectId: found[0]!.id }
  if (found.length > 1) return { refusal: `more than one project is called "${projectWords(words)}": ${found.map(placeLine).join(', ')}; pass the key of the one you mean` }
  return { refusal: `there is no project with the key or name "${words.trim()}"; list_projects shows each project's key and name` }
}

/** The start time an `at` ask names, or why it cannot be one. */
async function startTimeOf(when: Extract<TaskWhen, { kind: 'at' }>, timezone: string | undefined, person: string): Promise<string> {
  if (timezone && !isValidTimezone(timezone)) throw new ControlPlaneError('invalid', `"${timezone}" is not a timezone`)
  const zone = await readingZone(timezone, person)
  try {
    return toStartTime({ at: readTimeIn(when.at, zone.timezone) }, new Date()).toISOString()
  } catch (err) {
    if (err instanceof ScheduleError) throw new ControlPlaneError('invalid', `${err.message}. "when" is "now", "later", or a time`)
    throw err
  }
}

type Created = { taskId: string; task: { state: string; column: string | null }; note?: string }

/**
 * `placed`: where work asked for now goes when the lead names no column or state: To do, decided to be done. The task
 * keeps the model the person named, else this conversation's (taskModel.ts); a named one that may not run there is
 * refused before anything is created.
 */
async function createIt(capability: Person, args: Args, placed?: { state: string }) {
  const { when: _w, timezone: _tz, then: _then, model: named, ...taskFields } = args
  const modelChoice = await modelForCreatedTask({
    named, conversationId: capability.conversationId, projectId: args.projectId, agentId: args.assignedAgentId, userId: capability.actingUserId,
  })
  const placedBy = args.columnId !== undefined || args.state !== undefined
  const created = await callOperation(CREATE_TASK, { kind: 'turn', turn: capability }, { ...taskFields, ...(!placedBy && placed ? placed : {}) }) as Created
  if (modelChoice) await prisma.task.update({ where: { id: created.taskId }, data: { modelChoice } })
  return created
}

/** Later: a quick call, its row created and completed at once, with no operation to follow. */
async function later(capability: Person, args: Args, key: string): Promise<ToolCallOutcome> {
  const { operationId } = await operationRows.admit({ capability, toolName: CREATE_TASK, idempotencyKey: key, title: 'Create task' })
  try {
    const created = await createIt(capability, args)
    const line = laterLine(created.task.state === 'BACKLOG' ? undefined : (created.task.column ?? undefined), !!args.assignedAgentId)
    const result = { ...created, note: created.note ? `${created.note} ${line}` : line }
    await operationRows.settle(operationId, { state: 'COMPLETED', result })
    return { status: 'done', operationId, result }
  } catch (err) {
    await operationRows.settle(operationId, { state: 'FAILED', error: err instanceof ControlPlaneError ? err.message : `${CREATE_TASK} failed` })
    throw err
  }
}

export async function createTaskCall(capability: TurnCapability, raw: unknown): Promise<ToolCallOutcome> {
  const refusal = taskToolRefusal(capability, CREATE_TASK)
  const person = capability.actingUserId
  if (refusal || !person) return { status: 'refused', reason: refusal ?? 'This turn acts for no one' }
  const parsed = input.safeParse(raw ?? {})
  if (!parsed.success) {
    return { status: 'refused', reason: `The arguments do not fit ${CREATE_TASK}: ${parsed.error.issues.map(i => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ')}` }
  }
  const project = await projectIdFor(person, parsed.data.projectId)
  if ('refusal' in project) return { status: 'refused', reason: project.refusal }
  // The shared schema is untyped (ZodRawShape); its own fields are checked by the parse above. No workspace is no field.
  const { workspaceId, ...rest } = parsed.data
  const args = { ...rest, ...(workspaceId ? { workspaceId } : {}), projectId: project.projectId } as Args
  const turn: Person = { ...capability, actingUserId: person }
  const when = readWhen(args.when)
  const { then, ...asked } = args
  const key = idempotencyKey(CREATE_TASK, asked)
  const pending = await pendingWithKey(capability.conversationId, key)
  if (pending) return { status: 'accepted', operationId: pending }

  if (when.kind === 'later') return later(turn, args, key)
  if (!args.assignedAgentId) return { status: 'refused', reason: 'Work to do now or at a time needs an agent to do it: name assignedAgentId' }
  await requireProjectEntitlement({ kind: 'turn', turn }, args.projectId, CREATE_TASK, 'work')
  const continuation = continuationFor(capability, then)

  if (when.kind === 'now') {
    const created = await createIt(turn, args, { state: 'TODO' })
    const task = await queueAsPerson(turn, created.taskId, CREATE_TASK)
    if ('refusal' in task) return { status: 'refused', reason: `The task was created, but not started: ${task.refusal}` }
    return startTaskOperation({ capability: turn, task, toolName: CREATE_TASK, idempotencyKey: key, continuation })
  }

  if (when.kind === 'at' && then?.trim()) return { status: 'refused', reason: NO_THEN_AT_A_TIME }
  const at = await startTimeOf(when, args.timezone, person)
  const created = await createIt(turn, args, { state: 'TODO' })
  await setTaskSchedule(created.taskId, { at }, { kind: 'person', userId: person })
  const task = await prisma.task.findUniqueOrThrow({ where: { id: created.taskId }, select: { number: true, project: { select: { key: true } } } })
  const { operationId } = await createSetTaskOperation({
    capability: turn, toolName: CREATE_TASK, idempotencyKey: key, startsAt: at,
    title: `${task.project.key}-${task.number} ${args.title}`, taskId: created.taskId, projectId: args.projectId,
  })
  return { status: 'accepted', operationId }
}

export const createTaskTool: ConversationTool = {
  name: CREATE_TASK,
  input,
  async describe(capability) {
    // The places' workspaces, and which are code workspaces (live preview spec, part 2).
    const personId = capability.actingUserId ?? capability.readerUserId
    if (!personId) return CREATE_TASK_DESCRIPTION
    const places = await admittedBoundaries(personId, capability.agentId, 'start_work', capability.conversationId).catch(() => [])
    const [workspaces, models] = await Promise.all([workspaceLines(places), describeWorkerModels(capability.agentId, personId).catch(() => [])])
    return [CREATE_TASK_DESCRIPTION, ...workspaces, ...models].join('\n')
  },
  async offered(capability) {
    return taskToolRefusal(capability, CREATE_TASK) === null
  },
  async run(capability, raw) {
    try {
      return await createTaskCall(capability, raw)
    } catch (err) {
      return refusedBy(CREATE_TASK, err, (message, e) => logger.error(message, e))
    }
  },
}
