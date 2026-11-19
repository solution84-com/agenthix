/**
 * The "not yet" limit (adaptive voice listening, spec §When a turn ends): a turn kept open whose pause had an
 * invitation nobody answered, a presence check included, is closed at the limit — the light model asked once more,
 * for its own closing line, and a stored closing line when it gives none — a real turn, the person's words kept, no
 * heavy model call. Without one, the limit hands the message over as before.
 */
import { describe, expect, it } from 'vitest'
import type { LeadRequest } from '../../../contract'
import { LISTENER_SETTINGS } from '../../listener'
import { listeningOf } from '../state'
import { json, rig } from './listenRig'

const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve() }
const keep = (n: number) => json({ action: 'keep_listening', next_check: n })
const invite = (say: string) => json({ action: 'invite', say, next_check: 15 })
const close = (say: string) => json({ action: 'close_turn', say, next_check: 2 })
const TEXT = 'I was thinking we could maybe move the meeting to'
const OWN = 'Okay, just say when.'
const STORED = "I'll be here when you're ready."

describe('the "not yet" limit after an invitation nobody answered @SC-2206', () => {
  it('its timer asks the light model once more and closes the turn with its own line: recorded as closed, nothing handed over', async () => {
    const r = rig([invite('…move it to when?'), keep(10), keep(20), close(OWN)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 15_000, keptOpen: true, text: '' })
    await r.call({ seq: 3, moment: 'quiet', quietMs: 25_000, keptOpen: true, text: '' })
    r.timers[0]!.fn()
    await flush()
    expect(r.requests).toHaveLength(4)
    expect(r.requests[3]).toContain('reached its limit')
    expect(r.requests[3]).toContain('only choice allowed now is close_turn')
    expect(r.admitted).toEqual([])
    expect(r.stored).toEqual([])
    expect(r.spoken.at(-1)).toEqual({ text: OWN })
    expect(r.closed).toEqual([{ message: TEXT, agentText: `…move it to when? ${OWN}` }])
    expect(r.sent.at(-1)).toEqual({
      conversationId: 'c1', seq: 3, action: 'close_turn', nextCheckSecs: LISTENER_SETTINGS.schedule.quietFirst,
      turn: 'closed', turnId: 'turn-1', say: OWN, lineId: 'line-2',
    })
    expect(r.logs.join('\n')).toContain('kept open 60000 ms, closed after an unanswered invitation')
    const state = listeningOf(r.session)
    expect([state.turnOver, state.awaitingReply, state.openTurn]).toEqual([true, false, null])
    // Already in the closed turn's agent message: nothing is left for the next turn.
    expect(state.takeLines()).toEqual([])
  })

  it('a stored closing line when the light model answers anything else', async () => {
    const r = rig([invite('Take your time.'), json({ action: 'invite', say: 'Still there?', next_check: 10 })])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    r.timers[0]!.fn()
    await flush()
    expect(r.stored).toEqual([STORED])
    expect(r.admitted).toEqual([])
    expect(r.closed).toEqual([{ message: TEXT, agentText: `Take your time. ${STORED}` }])
    expect(r.sent.at(-1)).toMatchObject({ action: 'close_turn', turn: 'closed', say: STORED })
  })

  it('a stored closing line when the light model call fails or gives no answer in time', async () => {
    const never = (req: Omit<LeadRequest, 'tools'>) => new Promise<string>((_, reject) => req.signal.addEventListener('abort', () => reject(new Error('aborted'))))
    for (const last of [never, async () => { throw new Error('down') }]) {
      const r = rig([invite('Take your time.'), last])
      await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
      r.timers[0]!.fn()
      await new Promise(res => setTimeout(res, LISTENER_SETTINGS.soundsFinishedTimeoutMs + 100))
      await flush()
      expect(r.stored).toEqual([STORED])
      expect(r.closed).toEqual([{ message: TEXT, agentText: `Take your time. ${STORED}` }])
    }
  })

  it('a presence check counts as the invitation', async () => {
    const r = rig([keep(5), keep(10), invite('Still with me?'), close(OWN)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 5_000, keptOpen: true, text: '' })
    await r.call({ seq: 3, moment: 'quiet', quietMs: 20_000, keptOpen: true, text: '' })
    r.timers[0]!.fn()
    await flush()
    expect(r.admitted).toEqual([])
    expect(r.closed).toEqual([{ message: TEXT, agentText: `Still with me? ${OWN}` }])
  })

  it('a re-check at the limit closes it the same way', async () => {
    const r = rig([invite('Take your time.'), close(OWN)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 60_000, keptOpen: true, text: '' })
    expect(r.requests).toHaveLength(2)
    expect(r.requests[1]).toContain('reached its limit')
    expect(r.admitted).toEqual([])
    expect(r.closed).toEqual([{ message: TEXT, agentText: `Take your time. ${OWN}` }])
    expect(r.sent.at(-1)).toMatchObject({ seq: 2, action: 'close_turn', turn: 'closed', turnId: 'turn-1', say: OWN })
  })

  it('a late re-check after the timer closed it is told again, with the same line, and closes nothing more', async () => {
    const r = rig([invite('Take your time.'), close(OWN)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    r.timers[0]!.fn()
    await flush()
    await r.call({ seq: 2, moment: 'quiet', quietMs: 60_000, keptOpen: true, text: '' })
    expect(r.closed).toHaveLength(1)
    expect(r.requests).toHaveLength(2)
    expect(r.sent.at(-1)).toMatchObject({ seq: 2, action: 'close_turn', turn: 'closed', turnId: 'turn-1', say: OWN, lineId: 'line-2' })
  })

  it('their words while the limit call runs stop it: nothing is closed or handed over, and their words go on', async () => {
    let release: (text: string) => void = () => {}
    const pending = () => new Promise<string>(resolve => { release = resolve })
    const r = rig([invite('Take your time.'), pending, keep(2)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    r.timers[0]!.fn()
    await flush()
    await r.call({ seq: 2, moment: 'quietAfterWords', text: `${TEXT} Thursday` })
    release(close(OWN))
    await flush()
    expect(r.closed).toEqual([])
    expect(r.admitted).toEqual([])
    expect(r.sent.filter(e => e.turn)).toEqual([])
  })

  it('without an invitation in the pause, the limit hands over as before, with no further call', async () => {
    const r = rig([keep(10), keep(20)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    await r.call({ seq: 2, moment: 'quiet', quietMs: 10_000, keptOpen: true, text: '' })
    r.timers[0]!.fn()
    await flush()
    expect(r.requests).toHaveLength(2)
    expect(r.closed).toEqual([])
    expect(r.admitted).toEqual([TEXT])
    expect(r.sent.at(-1)).toMatchObject({ seq: 2, turn: 'fallback', say: 'Okay, bear with me.' })
  })

  it('an invitation they answered with more words does not count: the limit hands over', async () => {
    const r = rig([invite('Take your time.'), keep(10), keep(20)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: 'I was thinking' })
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'I was thinking we could maybe' })
    await r.call({ seq: 3, moment: 'quiet', quietMs: 10_000, keptOpen: true, text: '' })
    r.timers.at(-1)!.fn()
    await flush()
    expect(r.closed).toEqual([])
    expect(r.admitted).toEqual(['I was thinking we could maybe'])
  })

  it('hands over as before when neither its own nor a stored closing line can be had', async () => {
    const r = rig([invite('Take your time.'), keep(5)], { noClosing: true })
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    r.timers[0]!.fn()
    await flush()
    expect(r.closed).toEqual([])
    expect(r.admitted).toEqual([TEXT])
    expect(r.sent.at(-1)).toMatchObject({ turn: 'fallback', say: 'Okay, bear with me.' })
  })

  it('what they say next starts a new turn', async () => {
    const r = rig([invite('Take your time.'), close(OWN), keep(2)])
    await r.call({ seq: 1, moment: 'soundsFinished', text: TEXT })
    r.timers[0]!.fn()
    await flush()
    await r.call({ seq: 2, moment: 'quietAfterWords', text: 'Thursday' })
    expect(r.requests[2]).toContain('<message>\nThursday\n</message>')
    expect(r.requests[2]).not.toContain('Since their last words you have been asked')
  })
})
