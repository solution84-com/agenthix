/**
 * Its own checks in a pause: each call carries the light model's earlier choices since the person's words last changed,
 * so a check in a long quiet does not look like the first; and the instructions let the invitation grow with the quiet.
 */
import { describe, expect, it } from 'vitest'
import { LISTENER_INSTRUCTIONS_VERSION, buildListenerCall, type ListenerInput } from '..'

const base: ListenerInput = {
  agent: 'Kernel', person: 'Sam', messageSoFar: 'I was thinking we could maybe move the meeting to',
  moment: { kind: 'quiet', quietMs: 18_400, soundsFinished: true }, recap: null,
  exchanges: [], recentLines: [], thisTurn: [],
}
const quiet = (ms: number, tool: 'keep_listening' | 'invite' = 'keep_listening') => ({ kind: 'quiet' as const, ms, tool })

describe('its checks in this pause, in the call', () => {
  it('says how many times it was asked, when and what it chose, in one line', () => {
    const c = buildListenerCall({ ...base, checks: { earlier: 0, recent: [
      { kind: 'soundsFinished', ms: 700, tool: 'keep_listening' }, quiet(6900), quiet(10_800), quiet(13_300, 'invite'),
    ] } }, {})
    expect(c.user).toContain('Since their last words you have been asked 4 times, and nothing new came: keep_listening at 0.7 s, keep_listening at 6.9 s, keep_listening at 10.8 s, invite at 13.3 s of quiet.')
  })

  it('says it in the singular for one check', () => {
    const c = buildListenerCall({ ...base, checks: { earlier: 0, recent: [quiet(2000)] } }, {})
    expect(c.user).toContain('you have been asked once, and nothing new came: keep_listening at 2 s of quiet.')
  })

  it('counts the earlier checks it no longer lists', () => {
    const recent = [6, 8, 10, 12, 14, 16].map(s => quiet(s * 1000))
    const c = buildListenerCall({ ...base, checks: { earlier: 3, recent } }, {})
    expect(c.user).toContain('asked 9 times, and nothing new came; the last 6: keep_listening at 6 s,')
  })

  it('speaks of the wait, not the quiet, while the answer is worked out', () => {
    const c = buildListenerCall({
      ...base, moment: { kind: 'working', workingMs: 15_000 },
      checks: { earlier: 0, recent: [{ kind: 'working', ms: 6000, tool: 'acknowledge' }] },
    }, {})
    expect(c.user).toContain('While the answer has been worked out you have been asked once: acknowledge at 6 s of waiting.')
  })

  it('leaves the line out when there are none, so the first call of a pause is what it was', () => {
    const none = buildListenerCall(base, {})
    expect(buildListenerCall({ ...base, checks: { earlier: 0, recent: [] } }, {})).toEqual(none)
    expect(none.user).not.toContain('you have been asked')
  })

  it('comes right after what just happened, on every kind of call', () => {
    for (const moment of [base.moment, { kind: 'soundsFinished' as const }, { kind: 'quietAfterWords' as const, quietMs: 400 }, { kind: 'working' as const, workingMs: 6000 }]) {
      const user = buildListenerCall({ ...base, moment, checks: { earlier: 0, recent: [quiet(3000)] } }, {}).user
      expect(user.indexOf('you have been asked')).toBeGreaterThan(user.indexOf('What just happened'))
      expect(user.indexOf('you have been asked')).toBeLessThan(user.indexOf('This call is'))
    }
  })
})

describe('the instructions, with when to ask again hq\'s', () => {
  const s = buildListenerCall(base, {}).system

  it('no longer ask for next_check', () => {
    expect(LISTENER_INSTRUCTIONS_VERSION).toBe(18)
    expect(s).not.toContain('next_check')
    expect(s).toContain('{"action": "keep_listening"}')
  })

  it('let the invitation grow with the quiet the call states, and with what it chose before', () => {
    expect(s).toMatch(/invite:[^\n]*each call says how long they have been quiet and what you chose at each earlier check/)
    expect(s).toMatch(/invite:[^\n]*In the first few seconds of a quiet, do not invite/)
    expect(s).toMatch(/invite:[^\n]*ten seconds or more with nothing from you, invite, unless they asked for time/)
    expect(s).toMatch(/they ask for time[^\n]*no invitation before the last check before the pause's limit; never close_turn/)
  })
})
