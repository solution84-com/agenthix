/**
 * The action line and the task card (on-screen spec, Messages): when a turn's tool call changes something and
 * completes, the thread gets one line naming the item with the place to look at it, and for a task created or
 * changed, the task's card. A call that only reads writes nothing, and neither does one that did not complete,
 * and a call detached past the wait limit has its completion card instead.
 *
 * The target's kind is one the tools can mark (shared toolLink.ts); a kind with none (a project, an agent, a team)
 * is named in the line without a link. A task's target is its key, the way the Tasks tool is opened.
 */
import { prisma } from 'wasp/server'
import { isReadTool, isTurnTool } from '../../server/controlplane/turnCaller'
import type { ActionBody, ConversationMessageView, TaskBody } from '../../shared/conversations/protocol'
import type { AppendMessage, TurnCapability } from '../contract'
import { appendMessage } from '../store/messages'
import { conversationEvents } from '../coordinator/events'
import { toolCallTitle } from './turnTools'
import { conversationPlace } from '../memory/turnPrincipal'

export interface TaskFacts { id: string; key: string; title: string }

export interface ActionLineDeps {
  taskOf: (taskId: string) => Promise<TaskFacts | null>
  /** The conversation's place, which an agent's memory of a place is kept for. */
  placeOf: (conversationId: string) => Promise<{ type: string; id: string } | null>
  append: AppendMessage
  emit: (conversationId: string, message: ConversationMessageView) => void
}

type Args = Record<string, unknown>
type Draft = { text: string; target?: ActionBody['target']; task?: TaskFacts }

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** What a call of this tool did, from its arguments and result, once the task it names (if any) is known. */
type Describe = (args: Args, result: Args, task: TaskFacts | null) => Draft

const taskTarget = (task: TaskFacts | null): ActionBody['target'] | undefined =>
  task ? { kind: 'task', id: task.key, label: `${task.key} ${task.title}` } : undefined
const taskName = (task: TaskFacts | null) => (task ? `${task.key} ${task.title}` : 'a task')

/** A change to a task, with its card. */
const onTask = (verb: string, card: boolean): Describe => (_a, _r, task) => ({
  text: `${verb} ${taskName(task)}`,
  ...(task ? { target: taskTarget(task) } : {}),
  ...(card && task ? { task } : {}),
})

const DESCRIBE: Record<string, Describe> = {
  create_task: (a, _r, task) => ({ text: `Created ${task ? taskName(task) : str(a.title) ?? 'a task'}`, ...(task ? { target: taskTarget(task), task } : {}) }),
  update_task: onTask('Updated', true),
  change_tasks: (_a, r) => {
    const changed = Array.isArray(r.changed) ? r.changed.length : 0
    return { text: `Changed ${changed} task${changed === 1 ? '' : 's'}` }
  },
  archive_task: onTask('Archived', false),
  add_comment: onTask('Commented on', false),
  attach_file: (a, _r, task) => ({ text: `Attached ${str(a.filename) ?? 'a file'} to ${taskName(task)}`, ...(task ? { target: taskTarget(task) } : {}) }),
  // The task is gone: named from before the call, with nothing to open.
  delete_task: (_a, _r, task) => ({ text: `Deleted ${taskName(task)}` }),
  create_board: (a, r) => {
    const id = str(r.boardId)
    const name = str(a.name) ?? 'a board'
    return { text: `Created the board ${name}`, ...(id ? { target: { kind: 'board', id, label: name } } : {}) }
  },
  create_project: a => ({ text: `Created the project ${str(a.name) ?? ''}`.trim() }),
  create_team: a => ({ text: `Created the team ${str(a.name) ?? ''}`.trim() }),
  create_agent: a => ({ text: `Created the agent ${str(a.name) ?? ''}`.trim() }),
  remember: (a, r) => {
    const key = str(r.key)
    const title = str(a.title) ?? 'a memory'
    return { text: `Remembered ${title}`, ...(key ? { target: { kind: 'memory', id: key, label: title } } : {}) }
  },
  forget: a => ({ text: `Forgot ${str(a.key) ?? 'a memory'}` }),
}

/** The tools whose argument names the task they change. */
const TASK_ARG = new Set(['update_task', 'archive_task', 'add_comment', 'attach_file', 'delete_task'])

/** Whether a call of this tool, completed, is a change worth a line. Own tools that are not listed (recall, expand) read. */
export function writesLine(toolName: string): boolean {
  if (Object.prototype.hasOwnProperty.call(DESCRIBE, toolName)) return true
  return isTurnTool(toolName) && !isReadTool(toolName)
}

/** The task a call is about: the one it names, or the one it created. */
export function taskIdOf(toolName: string, args: Args, result: Args): string | null {
  if (TASK_ARG.has(toolName)) return str(args.taskId)
  if (toolName === 'create_task') return str(result.taskId)
  return null
}

export function actionDraft(toolName: string, args: Args, result: Args, task: TaskFacts | null): Draft {
  const describe = DESCRIBE[toolName]
  if (describe) return describe(args, result, task)
  return { text: toolCallTitle(toolName) }
}

const asRecord = (v: unknown): Args => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Args) : {})

export interface ActionWriter {
  /** `taskBefore`: a task as it stood before the call, for a call that removes it. */
  write(capability: TurnCapability, toolName: string, args: unknown, result: unknown, taskBefore?: TaskFacts | null): Promise<void>
  /** The task a call is about, read before it runs when the call will remove it. */
  before(toolName: string, args: unknown): Promise<TaskFacts | null>
}

/** What Settings › Memory needs to open on the scope a memory was written in. */
async function memoryParams(deps: ActionLineDeps, capability: TurnCapability, scope: string | null): Promise<Record<string, string>> {
  if (!scope) return {}
  const params: Record<string, string> = { scope: scope.toUpperCase() }
  if (scope === 'person') return params
  if (capability.agentId) params.agent = capability.agentId
  if (scope === 'agent_place') {
    const place = await deps.placeOf(capability.conversationId)
    if (place) params.place = `${place.type}:${place.id}`
  }
  return params
}

export function createActionWriter(deps: ActionLineDeps): ActionWriter {
  return {
    async before(toolName, args) {
      if (toolName !== 'delete_task') return null
      const id = str(asRecord(args).taskId)
      return id ? deps.taskOf(id) : null
    },
    async write(capability, toolName, rawArgs, rawResult, taskBefore = null) {
      if (!writesLine(toolName)) return
      const args = asRecord(rawArgs)
      const result = asRecord(rawResult)
      const taskId = taskIdOf(toolName, args, result)
      const task = taskBefore ?? (taskId ? await deps.taskOf(taskId) : null)
      const draft = actionDraft(toolName, args, result, task)
      if (draft.target?.kind === 'memory') draft.target.params = await memoryParams(deps, capability, str(result.scope))
      const common = { conversationId: capability.conversationId, role: 'AGENT' as const, agentId: capability.agentId, turnId: capability.turnId }
      const body: ActionBody = { text: draft.text, toolName, ...(draft.target ? { target: draft.target } : {}) }
      const line = await deps.append({ ...common, kind: 'ACTION', body })
      deps.emit(capability.conversationId, line.message)
      if (draft.task) {
        const card: TaskBody = { taskId: draft.task.id, taskKey: draft.task.key, title: draft.task.title }
        const stored = await deps.append({ ...common, kind: 'TASK', body: card })
        deps.emit(capability.conversationId, stored.message)
      }
    },
  }
}

async function taskFacts(id: string): Promise<TaskFacts | null> {
  const task = await prisma.task.findUnique({ where: { id }, select: { id: true, number: true, title: true, project: { select: { key: true } } } })
  return task ? { id: task.id, key: `${task.project.key}-${task.number}`, title: task.title } : null
}

async function placeOf(conversationId: string): Promise<{ type: string; id: string } | null> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { id: true, home: true, projectId: true, taskId: true, openedById: true, agentId: true },
  })
  return conversation ? conversationPlace(conversation) : null
}

export const actionWriter: ActionWriter = createActionWriter({
  taskOf: taskFacts,
  placeOf,
  append: appendMessage,
  emit: (conversationId, message) => conversationEvents.message(conversationId, message),
})
