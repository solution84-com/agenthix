import { describe, expect, it } from 'vitest'
import { VOICE_SETTINGS } from '../../settings'
import { orchestrationParts } from '../index'
import { heard, playing, rig, silence, stopped } from './setup'

const { confirmWindowMs, unclearExtraMs } = VOICE_SETTINGS.bargeIn

/** The four components together, as the session runs them; the speaker's part is played by hand. */
function setup() {
  const { components } = orchestrationParts({
    socket: { on: () => undefined, off: () => undefined, emit: () => undefined },
    conversationId: () => 'c1', sendNew: () => undefined, set: () => undefined, chime: () => undefined,
  })
  const r = rig(components, ['orchestration.floor', 'orchestration.playback', 'orchestration.send', 'stt.person', 'orchestration.handRaise'])
  const floors = () => r.of('orchestration.floor').map(e => e.state)
  const actions = () => r.of('orchestration.playback').map(e => e.action)
  /** The person asks something, and the agent starts answering. */
  const answering = () => {
    r.at(0, silence(false))
    r.at(100, { kind: 'stt.utterance', text: 'what changed' })
    r.at(700, silence(true))
    r.at(1_200, { kind: 'semantics.decision', answer: 'READY', confidence: 0.95, silenceMs: 500, by: 'model' })
    r.at(2_000, { kind: 'reply.sentence', replyId: 'r1', index: 0, text: 'Three things changed.' })
    r.at(2_100, playing('r1'))
  }
  return { ...r, floors, actions, answering }
}

describe('orchestration end to end, on the fake clock', () => {
  it('“Hold on” over the reply: ducked at once, stopped, and the floor is the person’s with their words', () => {
    const o = setup()
    o.answering()
    o.at(3_000, silence(false))
    o.at(3_900, heard('Hold on'))
    expect(o.actions()).toEqual(['duck', 'stop'])
    expect(o.floors().slice(-3)).toEqual(['agent-speaking', 'ducked', 'person-speaking'])
    expect(o.of('stt.person').map(e => e.text)).toEqual(['Hold on'])
  })

  it('A brief acknowledgement: the agent carries on', () => {
    const o = setup()
    o.answering()
    o.at(3_000, silence(false))
    o.at(3_500, heard('mm-hm'))
    o.at(3_600, silence(true))
    o.tickTo(3_000 + confirmWindowMs + 50)
    expect(o.actions()).toEqual(['duck', 'resume'])
    expect(o.floors().at(-1)).toBe('agent-speaking')
    expect(o.of('stt.person')).toEqual([])
    expect(o.of('orchestration.send')).toHaveLength(1)
  })

  it('An uncertain interruption: lowered and silent, then it carries on if nothing follows', () => {
    const o = setup()
    o.answering()
    o.at(3_000, silence(false))
    o.at(3_700, heard('so'))
    o.at(3_800, silence(true))
    o.tickTo(3_000 + confirmWindowMs + unclearExtraMs - 100)
    expect(o.floors().at(-1)).toBe('ducked')
    o.tickTo(3_000 + confirmWindowMs + unclearExtraMs + 100)
    expect(o.actions()).toEqual(['duck', 'resume'])
  })

  it('A turn ended too early: the next words join the same message, and nothing premature is heard', () => {
    const o = setup()
    o.at(0, silence(false))
    o.at(100, { kind: 'stt.utterance', text: 'I think we should' })
    o.at(700, silence(true))
    o.at(1_200, { kind: 'semantics.decision', answer: 'READY', confidence: 0.6, silenceMs: 500, by: 'model' })
    o.at(1_500, silence(false))
    o.at(1_600, { kind: 'stt.utterance', text: 'actually, no, wait until Monday' })
    o.at(2_400, silence(true))
    o.at(2_900, { kind: 'semantics.decision', answer: 'READY', confidence: 0.9, silenceMs: 500, by: 'model' })
    expect(o.of('orchestration.send').map(e => e.append)).toEqual([false, true])
    expect(o.floors()).toEqual(['person-speaking', 'person-pausing', 'agent-thinking', 'person-speaking', 'person-pausing', 'agent-thinking'])
  })

  it('A raised hand waits for the reply to finish, then for an opening', () => {
    const o = setup()
    o.answering()
    o.at(2_500, { kind: 'reply.update', updateId: 'u1', critical: false })
    o.tickTo(5_000)
    o.at(5_000, stopped('r1', true))
    expect(o.floors().at(-1)).toBe('hand-raised')
    o.tickTo(5_000 + VOICE_SETTINGS.handRaise.openingMs + 50)
    expect(o.of('orchestration.handRaise').map(e => e.state)).toEqual(['raised', 'invited'])
    expect(o.floors().at(-1)).toBe('agent-thinking')
  })
})
