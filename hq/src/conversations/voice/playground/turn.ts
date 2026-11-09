/**
 * One turn of the playground's lead, read by the lead's voice logic (lead/voiceLogic.ts) as hq's turn reads it: the
 * reply streamed to the page and spoken while voice is on; a keep_listening call that holds a spoken message ends
 * the turn with nothing said and the holder told; a call of the stand-in start_work is work started, which runs
 * nothing. One model step: there are no tools to answer, so there is no second.
 *
 * Each decision goes to the page's Decisions panel; each model call's usage to the page, as a development call.
 */
import { CONVERSATION_SOCKET, type ConversationDeltaEvent, type ConversationTurnEvent } from '../../../shared/conversations/protocol'
import { VOICE_PLAYGROUND_SOCKET as P, type PlaygroundDecision, type PlaygroundEntry, type PlaygroundUsage } from '../../../shared/voicePlayground'
import { canHold, heldNote, readLeadStep } from '../../lead/voiceLogic'
import { STARTS_WORK } from '../../coordinator/startedWords'
import type { PlaygroundConversation } from './conversation'
import { readable, type PlaygroundTurn } from './context'
import { spokenMessageOf, type LeadRun } from './leads'

export interface Running { turnId: string; controller: AbortController; rerun: boolean }

function workTitle(input: unknown, name: string): string {
  const { title, brief } = (input ?? {}) as { title?: unknown; brief?: unknown }
  return typeof title === 'string' && title.trim() ? title.trim() : typeof brief === 'string' && brief.trim() ? brief.trim() : name
}

/** Runs one turn; whether it must run again because the person's words joined its message meanwhile. */
export async function runPlaygroundTurn(c: PlaygroundConversation, lead: LeadRun, answers: PlaygroundEntry[], adaptiveVoice: boolean): Promise<boolean> {
  const { conversationId } = c
  const turnId = c.newId()
  const controller = new AbortController()
  const running: Running = { turnId, controller, rerun: false }
  c.running = running
  for (const a of answers) { a.turnId = turnId; c.emitEntry(a) }
  const voice = c.voice
  const turn: PlaygroundTurn = {
    history: readable(c.entries), answers, listening: voice !== null,
    trailedOff: answers.some(a => a.trailedOff), wentOn: voice?.wentOnAfterHold === true, adaptiveVoice,
  }
  if (voice) voice.wentOnAfterHold = false
  const speech = voice?.speechFor(turnId) ?? null
  const agent: PlaygroundEntry = { id: c.newId(), role: 'agent', text: '', turnId, state: 'RUNNING', at: c.now(), ...(voice && { spoken: true }) }
  c.entries.push(agent)
  c.hq(CONVERSATION_SOCKET.turn, { conversationId, turnId, state: 'RUNNING' } satisfies ConversationTurnEvent)
  c.emitEntry(agent)

  let text = ''
  const decide = (d: Omit<PlaygroundDecision, 'turnId' | 'at'>) => c.deps.out(P.decision, { turnId, at: c.now(), ...d } satisfies PlaygroundDecision)
  const reading = readLeadStep({
    spokenMessage: spokenMessageOf(turn), mayHold: () => canHold([]), replied: () => text, startsWork: STARTS_WORK,
    stream(piece) {
      agent.firstTextAt ??= c.now()
      c.hq(CONVERSATION_SOCKET.delta, { conversationId, turnId, offset: text.length, text: piece } satisfies ConversationDeltaEvent)
      text += piece
      speech?.text(text)
      agent.text = text
      c.emitEntry(agent)
    },
    hold(call) {
      speech?.hold()
      decide({ kind: 'held', text: heldNote(call, [], '') })
    },
    finish(event) {
      if (!lead.model) return
      c.deps.out(P.usage, { turnId, model: lead.model, inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens } satisfies PlaygroundUsage)
      c.deps.log(`voice playground: a development call on ${lead.model}, ${event.usage.inputTokens} tokens in, ${event.usage.outputTokens} out`)
    },
  })

  let state: 'COMPLETED' | 'FAILED' | 'CANCELLED' = 'COMPLETED'
  let error: string | undefined
  try {
    for await (const event of lead.events(turn, controller.signal)) {
      if (controller.signal.aborted) break
      reading.take(event)
    }
    if (controller.signal.aborted) state = 'CANCELLED'
  } catch (err) {
    state = controller.signal.aborted ? 'CANCELLED' : 'FAILED'
    if (state === 'FAILED') error = err instanceof Error ? err.message : String(err)
  }
  const { calls, held, work } = reading.result()
  if (!held) for (const call of work) decide({ kind: 'work', text: workTitle(call.input, call.name) })
  if (held && state === 'COMPLETED') {
    // As hq: the turn ends, nothing is said, what was written is withdrawn, and the reason is logged.
    c.pageLog({ level: 'info', text: `Held, still listening: ${heldNote(held, calls, text)}` })
    text = ''
  }
  // The speech always hears the end, so the silence rule stops counting the turn as a reply being written.
  const spoken = speech?.end(state, text) ?? { text, interrupted: state === 'CANCELLED' }
  const said = held && state === 'COMPLETED' ? { text: '', interrupted: false, withdrawn: true } : spoken
  // The page started a new conversation meanwhile: nothing of this one is shown again.
  if (c.running !== running) return false
  agent.text = said.text
  agent.state = state
  if (said.interrupted) agent.interrupted = true
  // What was written for a message the person went on from, or the lead held, was never heard: it is not kept.
  if (said.withdrawn || running.rerun) { agent.withdrawn = true; agent.text = '' }
  if (error) agent.error = error
  c.emitEntry(agent)
  c.hq(CONVERSATION_SOCKET.turn, { conversationId, turnId, state, ...(error && { error }) } satisfies ConversationTurnEvent)
  c.running = null
  return running.rerun
}
