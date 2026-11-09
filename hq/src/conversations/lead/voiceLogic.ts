/**
 * The lead's voice logic as one module (voice that stays in the conversation, spec §1 to §3; plan task 4b.1), with no
 * database and no Wasp: the `keep_listening` tool (how the lead says a person who spoke has not finished), the rule
 * for when a turn may be held, how much a step reasons, the voice turn block, and the reading of one model step's
 * stream into the reply's text, a hold and work started. hq's turn (coordinator/turn.ts) and the voice playground
 * (conversations/voice/playground/) both run it, so what is tried in the playground is what ships.
 */
import { z } from 'zod'
import type { LeadStreamEvent, LeadToolCall, LeadToolDefinition, ToolCallOutcome } from '../contract'

export { voiceTurnBlock, type VoiceTurn } from './voiceTurnBlock'

export const KEEP_LISTENING = 'keep_listening'

/** As the accepted instruction was checked with (version 36). */
export const KEEP_LISTENING_DESCRIPTION =
  'Use this when the person has not finished their thought. Write no text with this call. They will carry on ' +
  'speaking, and their next words join the same message.'

export const keepListeningInput = z.object({
  reason: z.string().max(300).describe('One short sentence naming the cue, for example "ended on and".'),
})

/** The tool as the model is offered it. */
export function keepListeningDefinition(): LeadToolDefinition {
  return { name: KEEP_LISTENING, description: KEEP_LISTENING_DESCRIPTION, input: keepListeningInput }
}

/** What the model is told of a call made where it cannot hold the turn. */
export const NOT_HELD: ToolCallOutcome = {
  status: 'refused',
  reason: `${KEEP_LISTENING} holds only a spoken message that is not finished, before any work starts. Answer the person.`,
}

/** The reason a call gave, short enough for one log line. */
export function holdReason(call: LeadToolCall): string {
  const reason = (call.input as { reason?: unknown } | null | undefined)?.reason
  return typeof reason === 'string' && reason.trim() ? reason.trim().slice(0, 200) : '(no reason given)'
}

/** A hold may end the turn only while nothing it did is in the thread: no work started, nothing waiting for an okay. */
export function canHold(found: readonly { outcome: ToolCallOutcome }[]): boolean {
  return !found.some(d => d.outcome.status === 'accepted' || d.outcome.status === 'waitingApproval')
}

/**
 * How much a step reasons: a reply someone hears reasons little; the first step of a reply to a spoken message under
 * the voice turn block reasons least, so its first word comes sooner, and its later steps think freely.
 */
export function reasoningFor(step: { heard: boolean; spokenMessage: boolean; step: number }): { spoken?: true; firstSpokenStep?: true } {
  if (!step.heard) return {}
  if (!step.spokenMessage) return { spoken: true }
  return step.step === 0 ? { spoken: true, firstSpokenStep: true } : {}
}

/** One line for the log when a step held the turn: its reason, words withdrawn, and the calls not run beside it. */
export function heldNote(held: LeadToolCall, calls: readonly LeadToolCall[], replyText: string): string {
  const wrote = replyText.trim() ? '; the words it wrote first were withdrawn' : ''
  const others = calls.filter(c => c.name !== KEEP_LISTENING).map(c => c.name)
  return `${holdReason(held)}${wrote}${others.length ? `; not run: ${others.join(', ')}` : ''}`
}

export interface StepReaderDeps {
  /** The message this turn answers was spoken, under the voice turn block: only then may a step hold it. */
  spokenMessage: boolean
  /** Whether a hold may end the turn now (`canHold` over what the turn's earlier steps did). */
  mayHold(): boolean
  /** The reply's text so far, across its steps. */
  replied(): string
  /** One piece of the reply, streamed as it comes. */
  stream(piece: string): void
  /** The step held the turn open: nothing more of it is streamed. */
  hold(call: LeadToolCall): void
  finish(event: Extract<LeadStreamEvent, { type: 'finish' }>): void
  /** The tools whose calls start work; none when absent. */
  startsWork?: ReadonlySet<string>
}

export interface StepReading {
  /** What this step wrote, before any hold. */
  text: string
  /** Every call the step made, the hold's included. */
  calls: LeadToolCall[]
  /** The keep_listening call that held the turn, or null. */
  held: LeadToolCall | null
  /** The calls that start work. */
  work: LeadToolCall[]
}

/** Reads one model step's stream, event by event, in the order the turn streams it. */
export function readLeadStep(deps: StepReaderDeps) {
  let text = ''
  const calls: LeadToolCall[] = []
  let held: LeadToolCall | null = null
  return {
    take(event: LeadStreamEvent): void {
      if (event.type === 'text') {
        if (!event.text || held) return
        const before = deps.replied()
        if (text === '' && before !== '' && !before.endsWith('\n')) deps.stream('\n\n')
        text += event.text
        deps.stream(event.text)
      } else if (event.type === 'tool-call') {
        if (!held && event.call.name === KEEP_LISTENING && deps.spokenMessage && deps.mayHold()) {
          held = event.call
          deps.hold(event.call)
        }
        calls.push(event.call)
      } else {
        deps.finish(event)
      }
    },
    result(): StepReading {
      const startsWork = deps.startsWork
      return { text, calls: [...calls], held, work: startsWork ? calls.filter(c => startsWork.has(c.name)) : [] }
    },
  }
}

export type LeadStepReader = ReturnType<typeof readLeadStep>
