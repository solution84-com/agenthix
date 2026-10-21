/**
 * The cards the mailbox writes (conversation layer spec, A completion while a reply streams; workers and results
 * spec, Results): a RESULT card from an ended operation's row, an APPROVAL_REQUEST card from a request, the one
 * line each stands for in a notification, and how the lead reads a card in its context. Pure.
 */
import {
  RESULT_TOO_LARGE,
  type ApprovalAnswerBody,
  type ApprovalRequestBody,
  type OperationOutcome,
  type OperationResult,
  type ResultBody,
} from '../../shared/conversations/protocol'
import { cutShort, plainText } from '../plainText'

/** The longest line a notification carries. */
export const NOTIFICATION_LINE_MAX = 300
/** The longest reason an approval card carries. */
export const APPROVAL_REASON_MAX = 300

/** A request's reason as its card shows it: plain words, one line, cut short. */
export function cardLine(text: string): string {
  return cutShort(plainText(text), APPROVAL_REASON_MAX)
}

export type EndedState = 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'DETACHED'

export interface EndedOperation {
  title: string
  state: EndedState
  result: OperationResult | null
  error: string | null
  boundaryName?: string
  task?: { id: string; key: string } | null
}

const OUTCOME: Record<EndedState, OperationOutcome> = {
  COMPLETED: 'completed', FAILED: 'failed', CANCELLED: 'cancelled', DETACHED: 'detached',
}

/** What the card says when the operation left nothing to say. */
function fallbackSummary(state: EndedState): string {
  switch (state) {
    case 'COMPLETED': return 'Done.'
    case 'FAILED': return 'It failed without saying why.'
    case 'CANCELLED': return 'Stopped.'
    case 'DETACHED': return 'No longer followed here; the task carries on.'
  }
}

export function resultBodyOf(op: EndedOperation): ResultBody {
  const summary = op.state === 'COMPLETED'
    ? op.result?.summary
    : op.error ?? op.result?.summary
  return {
    title: op.title,
    summary: summary?.trim() || fallbackSummary(op.state),
    outcome: OUTCOME[op.state],
    ...(op.boundaryName ? { boundaryName: op.boundaryName } : {}),
    ...(op.result?.stated !== undefined ? { stated: op.result.stated } : {}),
    ...(op.result?.taskState ? { taskState: op.result.taskState } : {}),
    ...(op.task ? { taskId: op.task.id, taskKey: op.task.key } : {}),
  }
}

/** The first line of something said, clipped: what a notification shows of it. Null when there is no text. */
export function firstLine(text: string | null | undefined, max = NOTIFICATION_LINE_MAX): string | null {
  const line = (text ?? '').split('\n').map(l => l.trim()).find(l => l !== '')
  if (!line) return null
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** The card's own one line, for when no reply can present it: "Review the README · Found 3 issues". */
export function resultLine(body: ResultBody): string {
  const what = body.outcome === 'completed' ? firstLine(body.summary) : `${capitalise(body.outcome)}: ${firstLine(body.summary) ?? ''}`
  return firstLine(`${body.title} · ${what}`)!
}

export function approvalLine(body: ApprovalRequestBody): string {
  return firstLine(`${body.askedBy} asks to ${lowerFirst(body.what ?? body.title)}`)!
}

function capitalise(word: string): string {
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`
}

function lowerFirst(text: string): string {
  return `${text.charAt(0).toLowerCase()}${text.slice(1)}`
}

/** Whether a result came back capped: the lead offers a brief for the rest rather than starting one. */
export function wasCapped(body: ResultBody): boolean {
  return body.summary.includes(RESULT_TOO_LARGE)
}

/** How the agent's own work ended, as it is told: "finished", "failed". */
const ENDED_AS: Record<OperationOutcome, string> = {
  completed: 'finished', failed: 'failed', cancelled: 'was stopped', detached: 'is no longer followed here; the task carries on',
}

/**
 * A card as the lead reads it in its context: hq's words, not the person's. Work in the background is the agent's
 * own, in another session, so it is told of it as its own — never as someone else's that came back.
 */
export function resultForLead(body: ResultBody): string {
  const where = body.boundaryName ? ` in ${body.boundaryName}` : ''
  const lines = [`[Your work${where} ${ENDED_AS[body.outcome]}: "${body.title}"]`]
  if (body.stated === false) lines.push('(You stated no result there; this is the last thing you said.)')
  lines.push(body.summary)
  if (body.taskKey && body.taskState) lines.push(`${body.taskKey} is now in ${body.taskState}.`)
  return lines.join('\n')
}

/**
 * `self`: the name of the agent reading it. A request from a task's run by another agent is that agent's work, named;
 * the agent's own otherwise, and when `self` is not known. A request takes no turn: the agent says nothing of it.
 */
export function approvalForLead(body: ApprovalRequestBody, self?: string): string {
  const where = body.boundaryName ? ` in ${body.boundaryName}` : ''
  const whose = self === undefined || body.askedBy === self
    ? `Your work${where} on "${body.title}"`
    : `${body.askedBy}'s work${where} on "${body.title}", which you started,`
  const what = body.what ? lowerFirst(body.what) : 'go on'
  return `[${whose} needs the person's okay to ${what}, because: ${body.reason.trim().replace(/\.+$/, '')}. They answer it on its card; say nothing about it unless they ask.]`
}

/** A person's answer to a request, as the lead reads it: the turn on it says what happens next. */
export function answerForLead(body: ApprovalAnswerBody): string {
  const lines = [`[The person answered your request: ${body.answer === 'approve' ? 'approved; the work goes on now' : 'declined'}]`]
  if (body.note) lines.push(`Their note: ${body.note}`)
  return lines.join('\n')
}
