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

export interface TaskFacts { id: string; key: string; title: string }

export interface ActionLineDeps {
  taskOf: (taskId: string) => Promise<TaskFacts | null>
  /** The agent's name now, for the "Remembered" line. */
  agentName: (agentId: string) => Promise<string | null>
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
  // The agent's name is put in by the writer; the line stores no title, scope or tags (ADR-0188): its label is generic.
  remember: (_a, r) => {
    const key = str(r.key)
    const itemId = str(r.itemId)
    return { text: 'remembered this', ...(key ? { target: { kind: 'memory', id: key, label: 'a memory', ...(itemId ? { params: { item: itemId } } : {}) } } : {}) }
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

/**
 * Only a memory the person asked for gets a line (ADR-0188): one quiet line, "Kernel remembered this", whose target
 * names the memory by its id (`params.item`), the dialog's way in. The scope parameters an older line carries
 * (`scope`, `agent`, `place`) are deprecated: nothing writes them now.
 */
function skipsLine(toolName: string, result: Args): boolean {
  return toolName === 'remember' && result.requested !== true
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
      if (skipsLine(toolName, result)) return
      const taskId = taskIdOf(toolName, args, result)
      const task = taskBefore ?? (taskId ? await deps.taskOf(taskId) : null)
      const draft = actionDraft(toolName, args, result, task)
      if (toolName === 'remember') draft.text = `${(await deps.agentName(capability.agentId)) ?? 'The agent'} ${draft.text}`
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

async function agentName(agentId: string): Promise<string | null> {
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { name: true } })
  return agent?.name ?? null
}

export const actionWriter: ActionWriter = createActionWriter({
  taskOf: taskFacts,
  agentName,
  append: appendMessage,
  emit: (conversationId, message) => conversationEvents.message(conversationId, message),
})
