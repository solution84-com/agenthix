/**
 * What a worker's run gives back, in text the lead reads (workers and results spec, Results › Worker): its result
 * summary — the result it stated with set_result, or else its last reply — and, when it asks for approval, what it
 * wants to do and its own words about it as the reason; the frame a run's row stands for. Pure: the
 * reads are the caller's.
 */
import type { RunRow, RunStatusEvent } from '@agenthix/core'
import { RESULT_CAP_CHARS, RESULT_TOO_LARGE, type OperationResult } from '../../../shared/conversations/protocol'
import { cutShort, plainText } from '../../plainText'

/** What a WORKER operation keeps in `args`: the start_work arguments it was given. */
export type WorkerArgs = { effort?: 'light' | 'heavy'; /** The model the person's words named: a picker value (`<providerId>/<model>`). */ model?: string }

/** The summary when a run ended saying nothing at all. */
export const NO_SUMMARY = 'The work ended without saying what it found.'
/** The longest reason an approval request carries: a card's line. */
export const APPROVAL_REASON_MAX_CHARS = 280
/** The reason when the run said nothing about what it asked for. */
export const NO_REASON = 'It did not say why.'

/**
 * Told to the background session with an approval's answer: only the run's last reply reaches the conversation, so
 * that reply must hold the whole result, whatever the run before the request already said.
 */
export const RESTATE_RESULT =
  'When you finish, end with your whole result, in your own voice, as you will tell it to the person — everything you found, including anything you said before you asked: only your final reply reaches them.'

/** Text cut to the result cap, with the line telling the lead to brief a worker for the rest. */
export function capText(text: string, cap = RESULT_CAP_CHARS): string {
  if (text.length <= cap) return text
  const tail = `\n[${RESULT_TOO_LARGE}]`
  return `${text.slice(0, cap - tail.length)}${tail}`
}

/** The operation's result from what the run stated, or its last reply when it stated none. */
export function workerResult(
  runId: string,
  stated: { result: string | null; stated: boolean } | null,
  lastReply: string | null,
): OperationResult {
  if (stated?.stated && stated.result?.trim()) return { summary: capText(stated.result.trim()), stated: true, runId }
  return { summary: capText(lastReply?.trim() || NO_SUMMARY), stated: false, runId }
}

type PendingRequest = { tools?: Array<{ name?: unknown; reason?: unknown }>; bashPatterns?: Array<{ pattern?: unknown; reason?: unknown }> }

const strings = (values: unknown[]): string[] => values.filter((v): v is string => typeof v === 'string' && v.trim().length > 0).map(v => v.trim())

function readRequest(request: unknown) {
  const r = (request ?? {}) as PendingRequest
  return {
    tools: strings((r.tools ?? []).map(t => t.name)),
    commands: strings((r.bashPatterns ?? []).map(p => p.pattern)),
    /** The command lines it tried, as the site recorded them. */
    tried: strings((r.bashPatterns ?? []).map(p => p.reason)),
  }
}

/** What a run asked to do, in plain words, from its pending request (`{ tools: [{ name }], bashPatterns: [{ pattern, reason? }] }`). */
export function requestedWhat(request: unknown): string {
  const { tools, commands } = readRequest(request)
  const parts = [
    ...(tools.length > 0 ? [`use ${tools.join(', ')}`] : []),
    ...(commands.length > 0 ? [`run ${commands.map(c => `“${c}”`).join(', ')}`] : []),
  ]
  if (parts.length === 0) return 'Use a tool that needs approval'
  const said = parts.join(' and ')
  return `${said.charAt(0).toUpperCase()}${said.slice(1)}`
}

function escaped(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The sentences of a reply, each made plain; a heading or a list item is one of its own. */
function sentences(reply: string): string[] {
  return reply.split('\n').flatMap(line => plainText(line).split(/(?<=[.!?…:])\s+/)).map(s => s.trim()).filter(s => s !== '')
}

/** A sentence in which the run says what it needs: "I need to run the benchmark to measure the resize step." */
const SAYS_IT_NEEDS = /\b(I|I'd|I'll|I'm|we)\b[^.!?]*\b(need|needs|want|wanted|would like)\b/i

/**
 * Why it asks, in the run's own words (on screen spec, Approvals say why), made plain and cut to a card's line:
 * the last sentence of its reply that speaks of what it asked for — the command or tool by name, or approval or
 * permission — else the last in which it says what it needs. Never more of the reply, nor a sentence that says
 * neither: a run that went on to its result before ending says that result too, and the card is not where it is
 * told. With none of these, the command it tried, or that it gave no reason.
 */
export function requestReason(lastReply: string | null, request: unknown): string {
  const { tools, commands, tried } = readRequest(request)
  const names = [...tools, ...commands.map(c => c.split(/\s+/)[0]!), ...tried].map(n => n.toLowerCase())
  const about = new RegExp(`(^|[^\\w-])(${[...new Set(names)].map(escaped).join('|') || '(?!)'})(?![\\w-])|\\b(approv\\w*|permission)\\b`, 'i')
  const said = sentences(lastReply ?? '')
  const reason = said.filter(s => about.test(s)).at(-1) ?? said.filter(s => SAYS_IT_NEEDS.test(s)).at(-1)
  if (reason) return cutShort(reason, APPROVAL_REASON_MAX_CHARS)
  if (tried.length > 0) return cutShort(`It tried to run ${tried.map(c => `“${c}”`).join(', ')}.`, APPROVAL_REASON_MAX_CHARS)
  return NO_REASON
}

/** The run's input after an approval: the approval's note, when there is one, before today's continue message. */
export function continueAfterApprovalText(note: string | null, continueMessage: string): string {
  const said = note?.trim()
  return said ? `[A person approved your request. Their note: ${said}${/[.!?]$/.test(said) ? '' : '.'}]\n\n${continueMessage}` : continueMessage
}

export type WorkerFrame = Pick<RunStatusEvent, 'runId' | 'status' | 'error' | 'manifestPending'>

/** A run as the site holds it, read as the frame it would have sent: for a run whose frame may have come too early. */
export function frameOfRun(run: RunRow): WorkerFrame {
  if (run.status === 'PENDING' || run.status === 'RUNNING') return { runId: run.id, status: 'RUNNING', error: null, manifestPending: null }
  const manifestPending = run.manifestStatus === 'PENDING_APPROVAL'
    ? { runId: run.id, summary: null, pendingManifest: run.pendingManifest }
    : null
  return { runId: run.id, status: run.status, error: run.error, manifestPending }
}
