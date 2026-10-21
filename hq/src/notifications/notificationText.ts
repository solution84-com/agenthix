/**
 * The two lines of a notification (every screen reviewed spec §6). Line 1 is
 * the task with its key when it is about one, else its title; line 2 says why
 * it is here. Pure: the query hands it the rows it read.
 */
import type { NotificationItem } from './notificationKinds'

export type PendingRequest = { command: string | null; tool: string | null; more: number }

export type TaskOfNotification = NonNullable<NotificationItem['task']> & { request: PendingRequest | null }

type Row = { type: string; body: string; status?: string }

/** The first thing a stored tool request (`{ pendingManifest: { bashPatterns, tools } }`) asks for. */
export function firstRequest(json: string | undefined): PendingRequest | null {
  if (!json) return null
  try {
    const manifest = (JSON.parse(json) as { pendingManifest?: { bashPatterns?: { pattern?: unknown }[]; tools?: { name?: unknown }[] } })
      .pendingManifest
    const patterns = (manifest?.bashPatterns ?? []).map(p => p.pattern).filter((p): p is string => typeof p === 'string' && !!p)
    const tools = (manifest?.tools ?? []).map(t => t.name).filter((t): t is string => typeof t === 'string' && !!t)
    if (patterns.length + tools.length === 0) return null
    return { command: patterns[0] ?? null, tool: patterns.length ? null : tools[0], more: patterns.length + tools.length - 1 }
  } catch {
    return null
  }
}

/** What a "needs you" notice adds after its fixed opening: the reason the task stopped. */
function waitingReason(body: string): string | null {
  const rest = body.replace(/^".*" is waiting for you\.\s*/s, '').trim()
  return rest && rest !== body ? rest : null
}

function why(n: Row, task: TaskOfNotification | null): { detail: string; command: string | null } {
  // A request or notice that stopped waiting says so, rather than what it once asked.
  if (n.status === 'handled' && (n.type === 'tool_approval' || n.type === 'task_waiting')) {
    return { detail: 'No longer waiting', command: null }
  }
  switch (n.type) {
    case 'tool_approval': {
      const request = task?.request
      const more = request && request.more > 0 ? ` and ${request.more} more` : ''
      // The command is drawn as code after "Wants to run"; the line says what follows it.
      if (request?.command) return { detail: more.trim(), command: request.command }
      if (request?.tool) return { detail: `Wants to use ${request.tool}${more}`, command: null }
      return { detail: 'Wants to use tools it is not allowed', command: null }
    }
    case 'task_waiting':
      return { detail: waitingReason(n.body) ?? 'Waiting for you', command: null }
    default:
      return { detail: n.body, command: null }
  }
}

export function describeNotification(n: Row, task: TaskOfNotification | null): Pick<NotificationItem, 'task' | 'detail' | 'command'> {
  return { task: task && { key: task.key, title: task.title, agent: task.agent }, ...why(n, task) }
}
