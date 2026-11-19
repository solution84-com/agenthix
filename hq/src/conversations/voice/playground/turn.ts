/**
 * One turn of the playground's lead, read by the lead's voice logic (lead/voiceLogic.ts) as hq's turn reads it: the
 * reply streamed to the page and spoken while voice is on; a keep_listening call that holds a spoken message ends
 * the turn with nothing said and the holder told; a call of the stand-in start_work is work started, which runs
 * nothing; a call of set_listening_style sends the style to the page, as hq does. One model step, and a second only
 * when the first set the style and said nothing (`styleStep.ts`), so the reply says it will. A reply's `[tone: …]` tag, asked for with Tone on, is taken out as in hq.
 *
 * Each decision goes to the page's Decisions panel; each model call's usage to the page, as a development call.
 */
import { CONVERSATION_SOCKET, type ConversationDeltaEvent, type ConversationTurnEvent } from '../../../shared/conversations/protocol'
import { VOICE_PLAYGROUND_SOCKET as P, type PlaygroundDecision, type PlaygroundEntry, type PlaygroundUsage } from '../../../shared/voicePlayground'
import type { VoiceHumTone } from '@agenthix/core'
import { canHold, heldNote, readLeadStep } from '../../lead/voiceLogic'
import { SET_LISTENING_STYLE, styleOf } from '../../lead/listeningStyle'
import type { LeadMessage, LeadToolCall } from '../../contract'
import { styleFollowUp } from './styleStep'
import { STARTS_WORK } from '../../coordinator/startedWords'
import type { PlaygroundConversation } from './conversation'
import { playgroundContext, readable, type PlaygroundTurn } from './context'
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
    trailedOff: answers.some(a => a.trailedOff), wentOn: voice?.wentOnAfterHold === true, adaptiveVoice, lightModel: c.light.on,
    toneOn: voice?.tone.on === true,
  }
  if (voice) voice.wentOnAfterHold = false
  const speech = c.light.turnSpeech(voice?.speechFor(turnId) ?? null, turnId, answers.map(a => a.text).join('\n'))
  const agent: PlaygroundEntry = { id: c.newId(), role: 'agent', text: '', turnId, state: 'RUNNING', at: c.now(), ...(voice && { spoken: true }) }
  c.entries.push(agent)
  c.hq(CONVERSATION_SOCKET.turn, { conversationId, turnId, state: 'RUNNING' } satisfies ConversationTurnEvent)
  c.emitEntry(agent)

  let text = ''
  const decide = (d: Omit<PlaygroundDecision, 'turnId' | 'at'>) => c.deps.out(P.decision, { turnId, at: c.now(), ...d } satisfies PlaygroundDecision)
  const reader = () => readLeadStep({
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
    // As hq: the reply's first tag sets its tone, read before its words; the Log shows it.
    ...(playgroundContext(turn).toneTag && {
      toneTag: (tone: VoiceHumTone) => {
        if (text.trim()) return
        speech?.tone?.(tone)
        c.deps.log(`voice playground: reply tone ${tone}`)
        decide({ kind: 'tone', text: tone })
      },
    }),
    finish(event) {
      if (!lead.model) return
      c.deps.out(P.usage, { turnId, model: lead.model, inputTokens: event.usage.inputTokens, outputTokens: event.usage.outputTokens } satisfies PlaygroundUsage)
      c.deps.log(`voice playground: a development call on ${lead.model}, ${event.usage.inputTokens} tokens in, ${event.usage.outputTokens} out`)
    },
  })

  // Set inside `step`, so it is widened here: the compiler cannot see a closure assign it.
  let state = 'COMPLETED' as 'COMPLETED' | 'FAILED' | 'CANCELLED'
  let error: string | undefined
  /** One model step, read as hq's turn reads it; `after` carries the step before and its calls' answers. */
  async function step(after?: LeadMessage[]) {
    const reading = reader()
    try {
      for await (const event of lead.events(turn, controller.signal, after)) {
        if (controller.signal.aborted) break
        reading.take(event)
      }
      if (controller.signal.aborted) state = 'CANCELLED'
    } catch (err) {
      state = controller.signal.aborted ? 'CANCELLED' : 'FAILED'
      if (state === 'FAILED') error = err instanceof Error ? err.message : String(err)
    }
    return reading.result()
  }
  /** The listening style the reply set: sent to the page as hq sends it; whether each call set it. */
  const applied = new Set<string>()
  const setStyles = (calls: readonly LeadToolCall[]) => {
    for (const call of calls) {
      const style = call.name === SET_LISTENING_STYLE ? styleOf(call.input) : null
      if (style && c.light.style(style)) {
        applied.add(call.id)
        c.pageLog({ level: 'info', text: `The reply set the listening style: ${style}` })
      }
    }
  }

  const first = await step()
  const { calls, held, work } = first
  if (!held) for (const call of work) decide({ kind: 'work', text: workTitle(call.input, call.name) })
  if (!held) setStyles(calls)
  // A step that only set the style said nothing: as hq's turn, the next step, with the call's answer, says it will.
  const after = state === 'COMPLETED' ? styleFollowUp({ text: first.text, calls, held: held !== null }, call => applied.has(call.id)) : null
  if (after) {
    const next = await step(after)
    if (!next.held) setStyles(next.calls)
  }
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
  // Its message is written: with the light model, the recap follows (light/live.ts).
  speech?.written(agent.withdrawn ? null : agent.id)
  c.hq(CONVERSATION_SOCKET.turn, { conversationId, turnId, state, ...(error && { error }) } satisfies ConversationTurnEvent)
  c.running = null
  return running.rerun
}
