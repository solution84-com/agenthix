/**
 * An approval request in plain words, and its answer (every screen reviewed,
 * *An approval asked mid-run*): each item as what the agent will do and the
 * thing it named — never "manifest", "extended access" or "Bash prefixes" —
 * and the answer as the request's own state: approved, denied, or not
 * answered because a newer message replaced it. The same words in the
 * conversation and in Notifications.
 *
 * What a request records today is the tool and what the call named (a path, a
 * web address), or the whole command. The agent's own reason for asking is not
 * collected, so `why` is what the call named, when it named anything.
 */
import type { TranscriptApproval } from './transcript.js'
import { toolAsk } from './workSteps.js'

export type ApprovalItem = {
  /** What it will do: "Fetch a web page", or the command itself when `command` is set. */
  does: string
  /** What the call named, when it named anything: "https://…/releases", "package.json". */
  why: string | null
  /** `does` is a command, shown as one. */
  command: boolean
}

export type ApprovalAnswer = 'waiting' | 'approved' | 'denied' | 'not_answered'

type Request = { tools?: Array<{ name?: unknown; reason?: unknown }>; bashPatterns?: Array<{ pattern?: unknown; reason?: unknown }> }

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** A request's items, in plain words: the tools first, then the commands. */
export function approvalItems(request: unknown): ApprovalItem[] {
  const r = (request && typeof request === 'object' ? request : {}) as Request
  // A stored request may be damaged or from another version: anything not shaped as expected counts as empty.
  const list = <T extends object>(v: unknown): T[] => (Array.isArray(v) ? v.filter((x): x is T => !!x && typeof x === 'object') : [])
  const tools = list<{ name?: unknown; reason?: unknown }>(r.tools).flatMap(t => {
    const name = text(t.name)
    return name ? [{ does: toolAsk(name), why: text(t.reason), command: false }] : []
  })
  // A command request is the whole command, and approving it grants exactly that command: the card shows what is granted.
  const commands = list<{ pattern?: unknown; reason?: unknown }>(r.bashPatterns).flatMap(p => {
    const command = text(p.pattern)
    return command ? [{ does: command, why: null, command: true }] : []
  })
  return [...tools, ...commands]
}

export function approvalAnswer(status: TranscriptApproval['status']): ApprovalAnswer {
  switch (status) {
    case 'APPROVED': return 'approved'
    case 'REJECTED': return 'denied'
    case 'SUPERSEDED': return 'not_answered'
    default: return 'waiting'
  }
}

/** The folded line's list: "fetch a web page, npm install +3" — the first two items, and how many more. */
export function approvalItemsLine(items: ApprovalItem[], shown = 2): string {
  const named = items.slice(0, shown).map(i => (i.command ? i.does : i.does.charAt(0).toLowerCase() + i.does.slice(1)))
  const more = items.length - shown
  return more > 0 ? `${named.join(', ')} +${more}` : named.join(', ')
}
