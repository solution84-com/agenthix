import { describe, expect, it } from 'vitest'
import type { LeadRequest } from '../../../contract'
import { LISTENER_SETTINGS } from '../../listener'
import { listeningOf } from '../state'
import { json, rig } from './listenRig'

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve() }

describe('the listening call', () => {
  it('an older page\'s pause after words is still answered; a hum a model still sends plays nothing and ends nothing @SC-2199', async () => {
    const r = rig([json({ action: 'hum', say: 'Mm-hm.', next_check: 2 })])
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'So I was thinking about' })
    expect(r.sent).toEqual([{ conversationId: 'c1', seq: 1, action: 'keep_listening', nextCheckSecs: 4.7 }])
    expect(r.spoken).toEqual([])
    expect(r.admitted).toEqual([])
    expect(r.requests[0]).toContain('So I was thinking about')
    expect(r.requests[0]).toContain('Sam is planning a trip.')
  })

  it('hand_over plays its hold and admits the message to the heavy model; the answer is never sent @SC-2201', async () => {
    const r = rig([json({ action: 'hand_over', asked: 'the weather', answer: 'It is sunny.', hold: 'Let me check the weather in Melbourne.', next_check: 3 })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: "What's the weather in Melbourne?" })
    expect(r.admitted).toEqual(["What's the weather in Melbourne?"])
    expect(r.sent[0]).toMatchObject({ action: 'hand_over', say: 'Let me check the weather in Melbourne.', turn: 'handedOver', nextCheckSecs: LISTENER_SETTINGS.schedule.workingFirst })
    expect(r.sent[0]).not.toHaveProperty('answer')
    expect(r.logs.join('\n')).not.toContain('sunny')
    expect(listeningOf(r.session).awaitingReply).toBe(true)
    // What the person heard waits for the reply's agent message.
    expect(listeningOf(r.session).takeLines()).toEqual(['Let me check the weather in Melbourne.'])
  })

  it('close_turn records the turn alone with the lines heard before it, and admits nothing @SC-2203', async () => {
    const r = rig([json({ action: 'acknowledge', say: 'Right.' }), json({ action: 'close_turn', say: 'You are welcome.', next_check: 2 })])
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'Okay' })
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'Okay, thanks.' })
    expect(r.admitted).toEqual([])
    expect(r.closed).toEqual([{ message: 'Okay, thanks.', agentText: 'Right. You are welcome.' }])
    expect(r.sent[1]).toMatchObject({ action: 'close_turn', say: 'You are welcome.', turn: 'closed', turnId: 'turn-1' })
    expect(r.spoken.at(-1)).toEqual({ text: 'You are welcome.' })
    // The closing line is in the agent message already: nothing is left for the next turn.
    expect(listeningOf(r.session).takeLines()).toEqual([])
  })

  it('"not yet" keeps the turn open; a re-check of it may end it @SC-2205', async () => {
    const r = rig([json({ action: 'keep_listening', next_check: 5 }), json({ action: 'hand_over', asked: 'a plan', hold: 'Let me think that through.' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'I need a plan for' })
    expect(r.admitted).toEqual([])
    expect(r.sent[0]).toMatchObject({ action: 'keep_listening', nextCheckSecs: 4.7 })
    expect(r.sent[0]).not.toHaveProperty('turn')
    await r.call({ seq: 2, moment: 'quiet', quietMs: 5000, keptOpen: true, text: '' })
    expect(r.requests[1]).toContain('after sounding finished')
    expect(r.admitted).toEqual(['I need a plan for'])
  })

  it('"not yet" is bounded: at the bound the message goes to the heavy model with a stored hold phrase @SC-2206', async () => {
    const r = rig([json({ action: 'keep_listening', next_check: 30 })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Give me a minute' })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 60_000, keptOpen: true, text: 'Give me a minute' })
    expect(r.admitted).toEqual(['Give me a minute'])
    expect(r.sent[1]).toMatchObject({ turn: 'fallback', say: 'Okay, bear with me.' })
    expect(r.requests).toHaveLength(1)
  })

  it('"not yet" is bounded even if the browser asks no more @SC-2206', async () => {
    const r = rig([json({ action: 'keep_listening', next_check: 30 })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Hmm' })
    expect(r.timers[0]!.ms).toBe(LISTENER_SETTINGS.notYetMaxSilenceMs)
    r.timers[0]!.fn()
    await Promise.resolve(); await Promise.resolve()
    expect(r.admitted).toEqual(['Hmm'])
  })

  it('the bound\'s timer tells the browser: the latest call is answered with the fallback and its stored hold phrase @SC-2206', async () => {
    const r = rig([json({ action: 'keep_listening', next_check: 5 }), json({ action: 'keep_listening', next_check: 5 })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Give me a minute' })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 5000, keptOpen: true, text: '' })
    r.timers[0]!.fn()
    await flush()
    expect(r.admitted).toEqual(['Give me a minute'])
    expect(r.sent.at(-1)).toEqual({
      conversationId: 'c1', seq: 2, action: 'keep_listening', nextCheckSecs: LISTENER_SETTINGS.schedule.workingFirst,
      turn: 'fallback', say: 'Okay, bear with me.', lineId: 'line-1',
    })
  })

  it('the timer firing first, then a late re-check, admits once: the re-check is told the turn went, with the same hold @SC-2206', async () => {
    const r = rig([json({ action: 'keep_listening', next_check: 5 })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Give me a minute' })
    r.timers[0]!.fn()
    await flush()
    // Sent before the timer's answer reached the browser, which takes that answer as stale.
    await r.call({ seq: 2, moment: 'quiet', quietMs: 60_000, keptOpen: true, text: '' })
    expect(r.admitted).toEqual(['Give me a minute'])
    expect(r.stored).toEqual(['Okay, bear with me.'])
    expect(r.requests).toHaveLength(1)
    expect(r.sent.at(-1)).toMatchObject({ seq: 2, action: 'keep_listening', turn: 'fallback', say: 'Okay, bear with me.', lineId: 'line-1' })
  })

  it('a re-check in flight when the timer fires admits once and answers nothing more @SC-2206', async () => {
    let release: (text: string) => void = () => {}
    const pending = () => new Promise<string>(resolve => { release = resolve })
    const r = rig([json({ action: 'keep_listening', next_check: 5 }), pending])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Give me a minute' })
    const recheck = r.call({ seq: 2, moment: 'quiet', quietMs: 5000, keptOpen: true, text: '' })
    await flush()
    r.timers[0]!.fn()
    await flush()
    release(json({ action: 'hand_over', asked: 'a minute', hold: 'Let me think.' }))
    await recheck
    expect(r.admitted).toEqual(['Give me a minute'])
    expect(r.sent.filter(e => e.seq === 2)).toHaveLength(1)
    expect(r.sent.at(-1)).toMatchObject({ seq: 2, turn: 'fallback' })
  })

  it('a turn kept open again after the bound handed one over starts clean @SC-2206', async () => {
    const r = rig([json({ action: 'keep_listening' }), json({ action: 'keep_listening' }), json({ action: 'keep_listening' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Hmm' })
    r.timers[0]!.fn()
    await flush()
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'Another thing' })
    await r.call({ seq: 3, moment: 'quiet', quietMs: 2000, keptOpen: true, text: '' })
    expect(r.admitted).toEqual(['Hmm'])
    expect(r.sent.at(-1)).not.toHaveProperty('turn')
  })

  it('a re-check carrying words said after "not yet" starts the quiet and its bound again @SC-2205', async () => {
    const r = rig([json({ action: 'keep_listening' }), json({ action: 'keep_listening' })])
    await r.call({ seq: 1, moment: 'soundsFinished', quietMs: 700, text: 'Hmm' })
    r.tick(40_000)
    await r.call({ seq: 2, moment: 'quiet', quietMs: 5_000, keptOpen: true, text: 'Hmm, actually, about the trip' })
    expect(r.timers[0]!.cancelled).toBe(true)
    expect(r.timers.at(-1)!.ms).toBe(LISTENER_SETTINGS.notYetMaxSilenceMs - 5_000)
    // Counted from their last words: the schedule's next check is the 15 s one.
    expect(r.sent.at(-1)!.nextCheckSecs).toBeCloseTo(10)
    expect(r.admitted).toEqual([])
    expect(listeningOf(r.session).openTurn?.text).toBe('Hmm, actually, about the trip')
  })

  it('a re-check with no new words leaves the bound where it was @SC-2205', async () => {
    const r = rig([json({ action: 'keep_listening' }), json({ action: 'keep_listening' })])
    await r.call({ seq: 1, moment: 'soundsFinished', quietMs: 700, text: 'Hmm' })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 5_000, keptOpen: true, text: 'Hmm' })
    expect(r.timers).toHaveLength(1)
    expect(r.timers[0]!.cancelled).toBe(false)
  })

  it('their words after "not yet" cancel the bound @SC-2205', async () => {
    const r = rig([json({ action: 'keep_listening' }), json({ action: 'keep_listening' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Hmm' })
    await r.call({ seq: 2, moment: 'quietAfterWords', text: 'Hmm, actually' })
    expect(r.timers[0]!.cancelled).toBe(true)
  })

  it('no answer within the time limit falls back: admitted, a stored hold phrase plays, none repeated @SC-2211', async () => {
    const never = (req: Omit<LeadRequest, 'tools'>) => new Promise<string>((_, reject) => req.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    const r = rig([never, never])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Book the flight.' })
    expect(r.admitted).toEqual(['Book the flight.'])
    expect(r.sent[0]).toMatchObject({ action: 'keep_listening', turn: 'fallback', say: 'Okay, bear with me.', lineId: 'line-1' })
    expect(listeningOf(r.session).takeLines()).toEqual(['Okay, bear with me.'])
    listeningOf(r.session).turnOver = true
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'And a hotel.' })
    expect(r.stored).toEqual(['Okay, bear with me.', 'One moment.'])
  }, 10_000)

  it('a failed call on sounds finished falls back at once @SC-2211', async () => {
    const r = rig([async () => { throw new Error('provider down') }])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Hello?' })
    expect(r.sent[0]).toMatchObject({ turn: 'fallback' })
    expect(r.admitted).toEqual(['Hello?'])
  })

  it('a rule-breaking answer is keep_listening: a close outside a sounds finished call ends nothing @SC-2200', async () => {
    const r = rig([json({ action: 'close_turn', say: 'Bye.' })])
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'Okay bye' })
    expect(r.sent[0]).toMatchObject({ action: 'keep_listening' })
    expect(r.closed).toEqual([])
  })
})

describe('one call in flight', () => {
  it('a newer seq aborts the older call, which sends nothing @SC-2207', async () => {
    let aborted = false
    const slow = (req: Omit<LeadRequest, 'tools'>) => new Promise<string>((_, reject) => {
      req.signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')) })
    })
    const r = rig([slow, json({ action: 'keep_listening' })])
    const first = r.call({ seq: 1, moment: 'soundsFinished', text: 'Shall we' })
    await new Promise(resolve => setTimeout(resolve, 5))
    await r.call({ seq: 2, moment: 'quietAfterWords', text: 'Shall we go' })
    await first
    expect(aborted).toBe(true)
    expect(r.sent.map(s => s.seq)).toEqual([2])
    expect(r.admitted).toEqual([])
  })

  it.each([['acknowledge', true], ['hum', false], ['invite', false], ['hand_over', false]] as const)(
    'an answer to a superseded call that came anyway: %s plays %s', async (tool, plays) => {
      let release!: (v: string) => void
      const late = () => new Promise<string>(resolve => { release = resolve })
      const r = rig([late, json({ action: 'keep_listening' })])
      const first = r.call({ seq: 1, moment: 'soundsFinished', text: 'So' })
      await new Promise(resolve => setTimeout(resolve, 5))
      await r.call({ seq: 2, moment: 'quietAfterWords', text: 'So then' })
      release(json(tool === 'hand_over' ? { action: tool, asked: 'x', hold: 'Let me see.' } : { action: tool, say: 'Right.' }))
      await first
      expect(r.sent.map(s => s.seq)).toEqual(plays ? [2, 1] : [2])
      expect(r.admitted).toEqual([])
    })

  it('out-of-order calls are not answered @SC-2207', async () => {
    const r = rig([json({ action: 'keep_listening' })])
    await r.call({ seq: 5, moment: 'quietAfterWords', text: 'a' })
    await r.call({ seq: 4, moment: 'quietAfterWords', text: 'a' })
    expect(r.sent.map(s => s.seq)).toEqual([5])
  })
})

describe('while the heavy model works @SC-2213', () => {
  it('a further hold line is said, and nothing is admitted or ended', async () => {
    const r = rig([json({ action: 'acknowledge', say: 'Still looking, nearly there.', next_check: 4 })])
    await r.call({ seq: 1, moment: 'working', text: '', workingMs: 6000 })
    expect(r.requests[0]).toContain('worked out for 6 s')
    expect(r.sent[0]).toMatchObject({ action: 'acknowledge', say: 'Still looking, nearly there.', nextCheckSecs: 6 })
    expect(r.admitted).toEqual([])
    expect(r.closed).toEqual([])
  })

  it('the light model reads that it already played a hold this turn', async () => {
    const r = rig([json({ action: 'hand_over', asked: 'x', hold: 'Let me look into that.' }), json({ action: 'keep_listening' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Check the log.' })
    await r.call({ seq: 2, moment: 'working', text: '', workingMs: 3000 })
    expect(r.requests[1]).toContain('hand_over, hold: "Let me look into that."')
  })
})

describe('with no light model @SC-2218', () => {
  it('answers off, and hands a message it carried over without a word', async () => {
    const r = rig([], { access: null })
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'Hi' })
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'Hi there.' })
    expect(r.sent).toEqual([
      { conversationId: 'c1', seq: 1, action: 'keep_listening', off: true, nextCheckSecs: 5 },
      { conversationId: 'c1', seq: 2, action: 'keep_listening', off: true, turn: 'handedOver', nextCheckSecs: 4 },
    ])
    expect(r.admitted).toEqual(['Hi there.'])
    expect(r.spoken).toEqual([])
    expect(r.stored).toEqual([])
  })

  it('answers off when the flag or Adaptive voice is off, calling nothing', async () => {
    const r = rig([], { enabled: false })
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'Hi' })
    expect(r.sent[0]).toMatchObject({ off: true })
    expect(r.requests).toEqual([])
  })
})

describe('hq\'s schedule of checks, whatever the light model says @SC-2205', () => {
  it('a turn kept open is asked at 5, 15 and 30 s of quiet, then at the limit; a next_check sent is ignored', async () => {
    const r = rig([0, 1, 2, 3].map(() => json({ action: 'keep_listening', next_check: 2 })))
    await r.call({ seq: 1, moment: 'soundsFinished', quietMs: 700, text: 'I was thinking we could' })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 5000, keptOpen: true, text: '' })
    await r.call({ seq: 3, moment: 'quiet', quietMs: 15_000, keptOpen: true, text: '' })
    await r.call({ seq: 4, moment: 'quiet', quietMs: 30_000, keptOpen: true, text: '' })
    expect(r.sent.map(e => e.nextCheckSecs)).toEqual([4.3, 10, 15, 30])
    expect(r.requests[3]).toContain('This is the last check before the pause reaches its limit: the turn stays open now')
    expect(r.requests[2]).not.toContain('last check before')
  })

  it('counts from the quiet when the answer goes, so a slow call does not push the check later', async () => {
    const r = rig([async () => { r.tick(800); return json({ action: 'keep_listening' }) }])
    await r.call({ seq: 1, moment: 'soundsFinished', quietMs: 700, text: 'I was thinking we could' })
    expect(r.sent[0]!.nextCheckSecs).toBeCloseTo(3.5)
  })

  it('starts again from the first check when new words reset the quiet', async () => {
    const r = rig([json({ action: 'keep_listening' }), json({ action: 'keep_listening' }), json({ action: 'hum', say: 'Mm.' })])
    await r.call({ seq: 1, moment: 'soundsFinished', quietMs: 700, text: 'I was thinking' })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 15_000, keptOpen: true, text: '' })
    await r.call({ seq: 3, moment: 'quietAfterWords', quietMs: 300, text: 'I was thinking we could move it' })
    expect(r.sent.map(e => e.nextCheckSecs)).toEqual([4.3, 15, 4.7])
  })

  it('while the heavy model works, asks at 4 s and then every 8 s', async () => {
    const r = rig([json({ action: 'hand_over', asked: 'x', hold: 'Let me look.' }), json({ action: 'keep_listening' }), json({ action: 'keep_listening' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Check the log.' })
    await r.call({ seq: 2, moment: 'working', text: '', workingMs: 4000 })
    await r.call({ seq: 3, moment: 'working', text: '', workingMs: 12_000 })
    expect(r.sent.map(e => e.nextCheckSecs)).toEqual([4, 8, 8])
  })

  it('the limit is unchanged: the re-check at 60 s ends the turn', async () => {
    const r = rig([json({ action: 'keep_listening' })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'Give me a minute' })
    await r.call({ seq: 2, moment: 'quiet', quietMs: LISTENER_SETTINGS.notYetMaxSilenceMs, keptOpen: true, text: '' })
    expect(r.sent[1]).toMatchObject({ turn: 'fallback' })
    expect(r.timers[0]!.ms).toBe(60_000)
  })
})
