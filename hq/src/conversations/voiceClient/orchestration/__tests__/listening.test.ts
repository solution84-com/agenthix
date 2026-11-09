import { describe, expect, it } from 'vitest'
import { floor } from '../floor'
import { createListening } from '../listening'
import { VOICE_SETTINGS, type VoiceSettings } from '../../settings'
import { KEEPING_UP, rig, silence } from './setup'

const L = VOICE_SETTINGS.listening
const TELLING = 'So yesterday I spent most of the afternoon on the migration,'
const stop = (by: 'stop-word' | 'words' | 'tap') => ({ kind: 'orchestration.playback', action: 'stop', replyId: 'r1', by }) as const
const saying = (text: string) => ({ kind: 'stt.utterance', text }) as const

function setup(settings: VoiceSettings = KEEPING_UP, random = () => 0.5) {
  const r = rig([floor, createListening(random)], ['orchestration.phrase'], settings)
  return { ...r, sounds: () => r.of('orchestration.phrase').map(e => e.tiers.join('+')), times: () => r.of('orchestration.phrase').map(e => e.t) }
}

/** The person speaks from `from` to `to` saying `text`, then pauses, and the clock runs `after` ms into the pause. */
function speakThenPause(s: ReturnType<typeof setup>, from: number, to: number, text = TELLING, after = L.humAfterPauseMs + 100) {
  s.at(from, silence(false))
  s.at(from + 100, saying(text))
  s.at(to, silence(true))
  s.tickTo(to + after)
}

describe('the listening family: a hum or an acknowledging word @SC-1833', () => {
  it('plays in a brief pause once the person has talked a while, without waiting for any model\'s answer', () => {
    const s = setup()
    speakThenPause(s, 0, 3_000)
    expect(s.sounds()).toEqual([])
    speakThenPause(s, 4_200, L.afterSpeechMs + 500)
    expect(s.sounds()).toEqual(['hum+acknowledge'])
  })

  it('plays none in a pause shorter than a breath, and none in the pauses of a message not talked long', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, saying(TELLING))
    s.at(L.afterSpeechMs + 500, silence(true))
    s.tickTo(L.afterSpeechMs + 500 + L.humAfterPauseMs - 100)
    s.at(L.afterSpeechMs + 500 + L.humAfterPauseMs - 50, silence(false))
    expect(s.sounds()).toEqual([])
  })

  it('plays none while the agent holds the floor, or is about to', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(100, saying(TELLING))
    s.at(L.afterSpeechMs + 500, silence(true))
    s.at(L.afterSpeechMs + 520, { kind: 'orchestration.floor', state: 'agent-thinking' })
    s.tickTo(L.afterSpeechMs + 3_000)
    expect(s.sounds()).toEqual([])
  })

  it('plays one a pause, and none before the gap drawn after the last, which is between the shortest and longest gap', () => {
    const s = setup(KEEPING_UP, () => 0)
    const first = L.afterSpeechMs + 500
    speakThenPause(s, 0, first)
    s.tickTo(first + 2_000)
    expect(s.sounds()).toHaveLength(1)
    let at = first + 2_500
    while (s.sounds().length < 2 && at < 120_000) { speakThenPause(s, at, at + 1_500); at += 2_600 }
    const [a, b] = s.times()
    expect(b! - a!).toBeGreaterThanOrEqual(L.minGapMs)
    expect(b! - a!).toBeLessThanOrEqual(L.maxGapMs + 2_600)
  })

  it('counts the talking from the start of the messages hq held, and begins again after a reply is spoken', () => {
    const s = setup()
    speakThenPause(s, 0, 5_000, TELLING, 100)
    s.at(6_100, { kind: 'orchestration.send', text: 'first', append: false })
    s.at(6_200, { kind: 'reply.held', replyId: 't1' })
    speakThenPause(s, 7_000, 7_000 + L.afterSpeechMs - 4_000)
    expect(s.sounds()).toEqual(['hum+acknowledge'])

    const t = setup()
    speakThenPause(t, 0, 5_000, TELLING, 100)
    t.at(6_100, { kind: 'orchestration.send', text: 'first', append: false })
    t.at(6_200, { kind: 'orchestration.floor', state: 'agent-speaking' })
    t.at(9_000, { kind: 'orchestration.floor', state: 'open' })
    speakThenPause(t, 10_000, 10_000 + L.afterSpeechMs - 4_000)
    expect(t.sounds()).toEqual([])
  })

  it('offers a question or a request only a hum', () => {
    const q = setup()
    speakThenPause(q, 0, L.afterSpeechMs + 500, 'Can you move the meeting to Thursday?')
    const r = setup()
    speakThenPause(r, 0, L.afterSpeechMs + 500, 'What do you think we should do about the launch?')
    expect([q.sounds(), r.sounds()]).toEqual([['hum'], ['hum']])
  })

  it('plays only a hum where the punctuation falls inside a clause, where a word would sound wrong', () => {
    const s = setup()
    speakThenPause(s, 0, L.afterSpeechMs + 500, 'and then we moved the whole thing over to the,')
    expect(s.sounds()).toEqual(['hum'])
  })

  it('waits for the punctuation at the end of what was heard, however late it comes, and drops the sound if they go on first', () => {
    const late = setup()
    const to = L.afterSpeechMs + 500
    speakThenPause(late, 0, to, 'So yesterday I spent most of the afternoon on the migration')
    late.tickTo(to + 3_000)
    expect(late.sounds()).toEqual([])
    late.at(to + 3_050, saying('So yesterday I spent most of the afternoon on the migration.'))
    late.tickTo(to + 3_200)
    expect(late.sounds()).toEqual(['hum+acknowledge'])

    const gone = setup()
    speakThenPause(gone, 0, to, 'So yesterday I spent most of the afternoon on the migration')
    gone.at(to + 1_000, silence(false))
    gone.at(to + 1_100, saying('So yesterday I spent most of the afternoon on the migration.'))
    gone.tickTo(to + 3_000)
    expect(gone.sounds()).toEqual([])
  })

  it('plays at any pause once the longest wait has passed with no punctuation', () => {
    const s = setup()
    speakThenPause(s, 0, L.longestWaitMs + 500, 'So yesterday I spent most of the afternoon on the migration')
    expect(s.sounds()).toEqual(['hum+acknowledge'])
  })
})

describe('the listening family: an invitation @SC-1833', () => {
  it('after the person stopped the reply with a stop word and stayed silent', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(400, silence(true))
    s.at(600, stop('stop-word'))
    s.at(650, saying('wait'))
    s.tickTo(600 + L.invitationAfterStopMs - 50)
    expect(s.sounds()).toEqual([])
    s.tickTo(600 + L.invitationAfterStopMs + 100)
    expect(s.sounds()).toEqual(['invitation'])
    s.tickTo(8_000)
    expect(s.sounds()).toEqual(['invitation'])
  })

  it('waits for the stop word to end before counting the silence', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(300, stop('stop-word'))
    s.at(800, silence(true))
    s.tickTo(800 + L.invitationAfterStopMs - 50)
    expect(s.sounds()).toEqual([])
    s.tickTo(800 + L.invitationAfterStopMs + 100)
    expect(s.sounds()).toEqual(['invitation'])
  })

  it('none when the person goes on, says more than the stop word, or stopped it another way', () => {
    const on = setup()
    on.at(400, silence(true))
    on.at(600, stop('stop-word'))
    on.at(900, silence(false))
    on.tickTo(5_000)
    const more = setup()
    more.at(400, silence(true))
    more.at(600, stop('stop-word'))
    more.at(700, saying('wait, I meant Tuesday'))
    more.tickTo(5_000)
    const tapped = setup()
    tapped.at(400, silence(true))
    tapped.at(600, stop('tap'))
    tapped.tickTo(5_000)
    const words = setup()
    words.at(400, silence(true))
    words.at(600, stop('words'))
    words.tickTo(5_000)
    expect([on.sounds(), more.sounds(), tapped.sounds(), words.sounds()]).toEqual([[], [], [], []])
  })

  it('after a turn hq held, once the person has stayed silent a few seconds', () => {
    const s = setup()
    s.at(0, silence(false))
    s.at(2_000, silence(true))
    s.at(2_600, { kind: 'orchestration.send', text: 'I think we should', append: false })
    s.at(3_000, { kind: 'reply.held', replyId: 't1' })
    s.tickTo(3_000 + L.invitationAfterHoldMs - 50)
    expect(s.sounds()).toEqual([])
    s.tickTo(3_000 + L.invitationAfterHoldMs + 100)
    expect(s.sounds()).toEqual(['invitation'])
  })

  it('after a hold, none when the person goes on, and never closer than the shortest gap to the last sound', () => {
    const on = setup()
    on.at(0, { kind: 'reply.held', replyId: 't1' })
    on.at(1_000, silence(false))
    on.tickTo(L.invitationAfterHoldMs + 3_000)
    expect(on.sounds()).toEqual([])

    const s = setup()
    const heard = L.afterSpeechMs + 500
    speakThenPause(s, 0, heard)
    s.at(heard + 1_500, { kind: 'orchestration.send', text: TELLING, append: false })
    s.at(heard + 1_600, { kind: 'reply.held', replyId: 't1' })
    const humAt = s.times()[0]!
    s.tickTo(humAt + L.minGapMs - 100)
    expect(s.sounds()).toEqual(['hum+acknowledge'])
    s.tickTo(humAt + L.minGapMs + 100)
    expect(s.sounds()).toEqual(['hum+acknowledge', 'invitation'])
  })
})

describe('the listening family with the person\'s Adaptive voice off @SC-1833', () => {
  const off = { ...KEEPING_UP, adaptiveVoice: false }

  it('plays nothing, however long they talk, after a stop word, or after a hold', () => {
    const s = setup(off)
    speakThenPause(s, 0, L.afterSpeechMs + 500)
    speakThenPause(s, L.afterSpeechMs + 2_000, L.afterSpeechMs + L.maxGapMs + 3_000)
    s.at(40_000, stop('stop-word'))
    s.at(40_050, saying('wait'))
    s.at(41_000, { kind: 'reply.held', replyId: 't1' })
    s.tickTo(60_000)
    expect(s.sounds()).toEqual([])
  })
})
