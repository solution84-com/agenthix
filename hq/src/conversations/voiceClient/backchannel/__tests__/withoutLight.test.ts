/**
 * The backchannel with the light model off (the owner's ask of 19 Nov): its own switch alone says whether it hums
 * (`backchannelAlone`, as the voice playground has it), and it hums on the sound model alone. In the product, where the
 * switch is not alone, Adaptive voice off still means no listening sounds.
 */
import { describe, expect, it } from 'vitest'
import { floor } from '../../orchestration/floor'
import { rig, silence } from '../../orchestration/__tests__/setup'
import type { VoiceSettings } from '../../settings'
import { humService } from '../service'
import { ON, setup, WITH_SERVICE } from './backchannelRig'

const ALONE: VoiceSettings = { ...ON, adaptiveVoice: false, backchannelAlone: true }

describe('the backchannel with the light model off @SC-2238', () => {
  it('hums in a pause the sound model says is not the end', () => {
    for (const answer of ['UNCERTAIN', 'KEEP_LISTENING'] as const) {
      const s = setup(ALONE)
      s.talk(0, 4_500, 'and then we walked on', answer)
      s.tickTo(5_600)
      expect(s.hums()).toEqual([{ t: 5_050, pausedMs: 550, speechMs: 4_500, verdict: answer }])
    }
  })

  it('never on READY: the turn goes as plain voice', () => {
    const s = setup(ALONE)
    s.talk(0, 4_500, 'and that was it', 'READY')
    s.tickTo(5_600)
    expect(s.hums()).toEqual([])
  })

  it('needs its own switch on', () => {
    const s = setup({ ...ALONE, backchannel: { ...ALONE.backchannel, on: false } })
    s.talk(0, 4_500)
    s.tickTo(5_600)
    expect(s.hums()).toEqual([])
  })

  it('is still off with Adaptive voice off where the switch is not alone, as in the product', () => {
    const s = setup({ ...ALONE, backchannelAlone: false })
    s.talk(0, 4_500)
    s.tickTo(5_600)
    expect(s.hums()).toEqual([])
  })

  it('asks the hum service, and a plain send ends the turn: the next turn asks afresh about the same words', () => {
    const r = rig([floor, humService], ['hum.ask'], { ...WITH_SERVICE, adaptiveVoice: false, backchannelAlone: true })
    r.at(0, silence(false))
    r.at(100, { kind: 'stt.utterance', text: 'yes' })
    r.tickTo(1_200)
    expect(r.of('hum.ask').map(a => a.text)).toEqual(['yes'])
    r.at(1_300, silence(true))
    r.at(1_400, { kind: 'orchestration.send', text: 'yes', append: false })
    r.at(1_500, { kind: 'reply.spoken', replyId: 'r1', sentences: 0 })
    r.at(3_000, silence(false))
    r.tickTo(4_200)
    expect(r.of('hum.ask').map(a => a.text)).toEqual(['yes', 'yes'])
  })
})
