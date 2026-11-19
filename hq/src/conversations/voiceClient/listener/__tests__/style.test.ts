/**
 * The listening style the reply sets (spec §The heavy model → *The listening style as an action*): hq's `listened`
 * that carries only a style (`listen.styleAsked`, from the adapter) holds for the conversation (`listen.style`),
 * whatever call is the latest, and changes nothing about the turn; under `patient` no acknowledgement, invitation or
 * hold plays until the turn has really ended, while a closing line and the hand over itself go on; `normal` undoes it.
 */
import { describe, expect, it } from 'vitest'
import type { VoiceEventBody } from '../../events'
import { floor } from '../../orchestration/floor'
import { scheduler } from '../../orchestration/scheduler'
import { KEEPING_UP, rig, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { listenerTrigger } from '../trigger'
import { CONVERSATION_VOICE_SOCKET as V, type VoiceListenStyle } from '@agenthix/core'
import { fakeClock } from '../../clock'
import { createVoiceRuntime } from '../../runtime/runtime'
import { VOICE_SETTINGS } from '../../settings'
import { hqListening } from '../../adapters/hqListening'
import type { LooseSocket } from '../../adapters/hqSocket'

const LIGHT: VoiceSettings = { ...KEEPING_UP, voiceListener: true, adaptiveVoice: true }
const ready = { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' } as const
type Answer = Omit<Extract<VoiceEventBody, { kind: 'listen.answer' }>, 'kind'>
const answer = (a: Partial<Answer> & { call: number }): VoiceEventBody => ({ kind: 'listen.answer', action: 'keep_listening', nextCheckSecs: 2, ...a })

function setup() {
  const r = rig([floor, scheduler, listenerTrigger], ['listen.play', 'listen.drop', 'listen.turn', 'listen.style'], LIGHT)
  /**
   * They say `text` from `at` and go quiet 700 ms later; the sound model says READY 500 ms after that, which counts once
   * the quiet the scheduler wants has passed (more under `patient`).
   */
  const turn = (at: number, text: string) => {
    r.at(at, silence(false))
    r.at(at + 100, { kind: 'stt.utterance', text })
    r.at(at + 700, silence(true))
    r.tickTo(at + 1_200)
    r.at(at + 1_200, ready)
    r.tickTo(at + 2_500)
  }
  const fates = () => r.out.filter(e => e.kind === 'listen.play' || e.kind === 'listen.drop')
    .map(e => (e.kind === 'listen.play' ? `play ${e.lineId}` : `drop ${e.lineId}: ${e.why}`))
  return { ...r, turn, fates }
}

const styled = (style: VoiceListenStyle): VoiceEventBody => ({ kind: 'listen.styleAsked', style })

describe('the listening style the reply sets @SC-2232', () => {
  it('holds once set, whatever call is the latest, and decides nothing about the turn', () => {
    const s = setup()
    s.turn(0, 'Stop interrupting me, and what is the budget?')
    s.at(2_600, answer({ call: 1, action: 'hand_over', say: 'One moment.', lineId: 'L1', turn: 'handedOver' }))
    s.at(4_000, styled('patient'))
    expect(s.of('listen.style')).toMatchObject([{ state: { hums: 'on', patient: true }, asked: 'patient' }])
    expect(s.of('listen.turn').map(e => e.state)).toEqual(['handedOver'])
  })

  it('patient: an acknowledgement in their turn and a hand over\'s hold are dropped; the turn is still handed over', () => {
    const s = setup()
    s.at(100, styled('patient'))
    s.turn(3_000, 'So the first thing is the budget.')
    s.at(5_600, answer({ call: 1, action: 'acknowledge', say: 'Right.', lineId: 'L2', nextCheckSecs: 30 }))
    s.turn(7_000, 'What do you think of it?')
    s.at(9_600, answer({ call: 2, action: 'hand_over', say: 'Let me look.', lineId: 'L3', turn: 'handedOver' }))
    expect(s.fates()).toEqual(['drop L2: you asked to be let finish', 'drop L3: you asked to be let finish'])
    expect(s.of('listen.turn').at(-1)).toMatchObject({ state: 'handedOver' })
  })

  it('patient: a closing line plays, since the turn has ended', () => {
    const s = setup()
    s.at(100, styled('patient'))
    s.turn(3_000, 'Thanks.')
    s.at(5_600, answer({ call: 1, action: 'close_turn', say: "You're welcome.", lineId: 'L2', turn: 'closed', turnId: 't2' }))
    expect(s.fates()).toEqual(['play L2'])
  })

  it('normal undoes it, and styles combine', () => {
    const s = setup()
    s.at(100, styled('hums_off'))
    s.at(200, styled('patient'))
    expect(s.of('listen.style').at(-1)!.state).toEqual({ hums: 'off', patient: true })
    s.at(300, styled('normal'))
    s.turn(3_000, 'So the first thing is the budget.')
    s.at(5_600, answer({ call: 1, action: 'acknowledge', say: 'Right.', lineId: 'L3' }))
    expect(s.fates()).toEqual(['play L3'])
    expect(s.of('listen.style').at(-1)!.state).toEqual({ hums: 'on', patient: false })
  })
})

describe('hq\'s `listened` with a style, read by the page', () => {
  function page() {
    const handlers = new Map<string, (p: unknown) => void>()
    const socket: LooseSocket = { on: (e, h) => { handlers.set(e, h as (p: unknown) => void) }, off: () => undefined, emit: () => undefined }
    const runtime = createVoiceRuntime({
      components: [listenerTrigger], settings: { ...VOICE_SETTINGS, voiceListener: true, adaptiveVoice: true }, clock: fakeClock(),
      adapters: [hqListening({ socket, conversationId: () => 'c1' })],
    })
    const seen: string[] = []
    runtime.subscribe(['listen.answer', 'listen.style'], e => { seen.push(e.kind === 'listen.style' ? `style ${e.asked}` : `answer ${e.kind === 'listen.answer' ? e.call : ''}`) })
    runtime.start()
    return { hq: (p: object) => handlers.get(V.listened)!({ conversationId: 'c1', nextCheckSecs: 4, action: 'keep_listening', ...p }), seen }
  }

  it('one with only a style, with the latest seq hq had, sets the style and is no answer to a call', () => {
    const p = page()
    p.hq({ seq: 7, style: 'hums_off' })
    expect(p.seen).toEqual(['style hums_off'])
  })

  it('a style it does not know is ignored; an answer without a style is an answer', () => {
    const p = page()
    p.hq({ seq: 7, style: 'loud' })
    p.hq({ seq: 8 })
    expect(p.seen).toEqual(['answer 8'])
  })
})
