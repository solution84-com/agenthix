/**
 * What the demo's lead says at each step of a turn, chosen from the scripts with no model (ADR-0186). Pure.
 *
 * The first step of a turn that answers a person: the reply of the agent's intent nearest their words, then that
 * intent's tool calls, which hq's real tools carry out; with no intent close enough, the agent's fallback. Every
 * later step of the same turn — a tool's result come back, a note from hq — closes the turn with a short line
 * instead of a second answer. A turn that presents finished work says so in one line. The closing lines are the
 * agent's own (`spoken` in its script, each with its clip for the demo voice); the constants below stand in for an
 * agent with no script.
 */
import { matchDemoIntent, type DemoLeadScript, type DemoLeadToolCall, type DemoScripts } from '@agenthix/core'
import { STARTS_WORK } from '../../conversations/coordinator/startedWords'

export type DemoTurnTrigger = 'MESSAGE' | 'REPORT' | 'CONTINUATION'

/** The turn a model call belongs to, as the demo reads it from hq's records. */
export interface DemoTurn {
  turnId: string
  trigger: DemoTurnTrigger
  /** The agent speaking in it, by handle and id; null when it has none. */
  agentHandle: string | null
  agentId: string | null
  /** The person it acts as (`InferenceTurn.actingUserId`); null for a turn that acts for no one. */
  personId: string | null
  /** The words of the person's messages the turn answers, joined. */
  personText: string
}

/** What one tool call gave, as the lead reads it back, and the tool that gave it. */
export type DemoToolResult = { toolName: string; output: { status?: unknown; reason?: unknown } | unknown }

export interface DemoStep {
  text: string
  toolCalls: DemoLeadToolCall[]
}

export const DEMO_NO_SCRIPT = 'This is a demo, so I can only answer a few things here. Try one of the suggestions above the message box.'
export const DEMO_REPORT_LINE = "That work has come back: its card above shows what it did."
export const DEMO_CONTINUATION_LINE = "That's the next step under way: I'll say here when it comes back."
export const DEMO_DONE_LINE = "That's done."
export const DEMO_WAITING_LINE = 'It is waiting for your okay above.'
export const DEMO_NOTHING_MORE = 'Nothing more was started.'
export const DEMO_CANNOT_HERE = "I can't do that from this conversation."

/** The lead script of the agent speaking in a turn, if it has one. */
export function leadOf(scripts: DemoScripts, turn: Pick<DemoTurn, 'agentHandle'> | null): DemoLeadScript | null {
  return (turn?.agentHandle ? scripts.agents[turn.agentHandle]?.lead : undefined) ?? null
}

/** The first step of a turn: the scripted answer, with the calls it makes. */
export function firstStep(scripts: DemoScripts, turn: DemoTurn | null): DemoStep {
  if (!turn) return { text: DEMO_NO_SCRIPT, toolCalls: [] }
  const lead = leadOf(scripts, turn)
  if (turn.trigger === 'REPORT') return { text: lead?.spoken.workCameBack.text ?? DEMO_REPORT_LINE, toolCalls: [] }
  if (turn.trigger === 'CONTINUATION') return { text: DEMO_CONTINUATION_LINE, toolCalls: [] }
  if (!lead) return { text: DEMO_NO_SCRIPT, toolCalls: [] }
  const intent = matchDemoIntent(turn.personText, lead.intents)
  return intent ? { text: intent.reply, toolCalls: intent.toolCalls } : { text: lead.fallback.text, toolCalls: [] }
}

function refusalOf({ output }: DemoToolResult): string | null {
  if (typeof output !== 'object' || output === null) return null
  const { status, reason } = output as { status?: unknown; reason?: unknown }
  if (status !== 'refused') return null
  return typeof reason === 'string' && reason.trim() ? reason.trim() : 'it was refused'
}

const isWaiting = ({ output }: DemoToolResult) =>
  typeof output === 'object' && output !== null && (output as { status?: unknown }).status === 'waitingApproval'

/**
 * A later step of the same turn: what the tool results that came back say, in one line; with none (hq asked for
 * words only, or said nothing was started), that nothing more was started. After lookups alone it says nothing: the
 * reply already gave what they found, and "That's done." would claim work that was not done.
 */
export function followUpStep(results: readonly DemoToolResult[], lead: Pick<DemoLeadScript, 'spoken'> | null = null): DemoStep {
  if (results.length === 0) return { text: DEMO_NOTHING_MORE, toolCalls: [] }
  const refused = results.map(refusalOf).find((r): r is string => r !== null)
  if (refused) return { text: refusedLine(refused, lead), toolCalls: [] }
  if (results.some(isWaiting)) return { text: lead?.spoken.waiting.text ?? DEMO_WAITING_LINE, toolCalls: [] }
  if (!results.some(r => STARTS_WORK.has(r.toolName))) return { text: '', toolCalls: [] }
  return { text: lead?.spoken.done.text ?? DEMO_DONE_LINE, toolCalls: [] }
}

/** The agent's refused line, spoken from its clip, then the refusal's own words as a sentence of their own. */
function refusedLine(reason: string, lead: Pick<DemoLeadScript, 'spoken'> | null): string {
  const words = reason.replace(/[.\s]+$/, '')
  if (!lead) return `That didn't go through: ${words}.`
  return `${lead.spoken.refused.text.trim()} ${words.charAt(0).toUpperCase()}${words.slice(1)}.`
}

const TITLE_WORDS = 6
const TITLE_ASK = /^The person said: ([\s\S]*?)(?:\n\nThe reply:|$)/

/** A conversation's title, from the person's first words: at most six of them, with no closing punctuation. */
export function demoTitle(prompt: string): string {
  const ask = TITLE_ASK.exec(prompt)?.[1]?.trim() || prompt.trim()
  const words = ask.split(/\s+/).filter(Boolean).slice(0, TITLE_WORDS).join(' ').replace(/[.?!,;:]+$/, '')
  return words ? `${words.charAt(0).toUpperCase()}${words.slice(1)}` : 'A demo conversation'
}

/** The summariser's answer, in the JSON it reads: a demo conversation keeps no more than that it happened. */
export function demoSummary(): string {
  return JSON.stringify({
    brief: 'A conversation in the demo.',
    summary: 'A conversation in the demo: the agent answered from its script and made only what the script names.',
  })
}
