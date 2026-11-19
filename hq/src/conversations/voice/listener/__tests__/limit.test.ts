/**
 * The presence check and the "not yet" limit, in the call and the instructions: the call says when its last
 * invitation came and whether this is the last check before the limit; the instructions ask for one presence check at
 * that check, after an unanswered invitation, in its own words; and hq's own call at the limit allows only
 * `close_turn`, a line that leaves the door open.
 */
import { describe, expect, it } from 'vitest'
import { LISTENER_INSTRUCTIONS_VERSION, buildListenerCall, listenerInstructions, parseListenerResponse, LISTENER_SETTINGS, type ListenerInput } from '..'

const base: ListenerInput = {
  agent: 'Kernel', person: 'Sam', messageSoFar: 'I was thinking we could maybe move the meeting to',
  moment: { kind: 'quiet', quietMs: 30_000, soundsFinished: true, lastCheck: true }, recap: null,
  exchanges: [], recentLines: [], thisTurn: [],
  checks: { earlier: 0, recent: [{ kind: 'soundsFinished', ms: 700, tool: 'keep_listening' }, { kind: 'quiet', ms: 15_000, tool: 'invite' }] },
}
const text = listenerInstructions({ agent: 'Kernel', person: 'Sam', mode: 'json', withAnswer: false, caps: LISTENER_SETTINGS.caps })

describe('the presence check', () => {
  it('the moment says it is the last check before the limit, and the invitation line asks for the presence check then', () => {
    const user = buildListenerCall(base, {}).user
    expect(user).toContain('Sam has been quiet for 30 s, after sounding finished; you kept listening. This is the last check before the pause reaches its limit: the turn stays open now, and if they stay quiet you are asked for the closing line at the limit.')
    expect(user).toContain('invite at 15 s of quiet. Your last invitation was 15 s ago, and nothing has come since. Now is the time for your one check that they are still there: an invite of three to five words, never more than 6')
  })

  it('before the last check, says the presence check is not for now, whatever the time since the invitation', () => {
    const early = buildListenerCall({ ...base, moment: { kind: 'quiet', quietMs: 15_000, soundsFinished: true }, checks: { earlier: 0, recent: [{ kind: 'quiet', ms: 5000, tool: 'invite' }] } }, {}).user
    expect(early).toContain("Your last invitation was 10 s ago, and nothing has come since. Your one check that they are still there comes at the last check before the pause's limit, not now: keep_listening.")
    expect(early).not.toContain('last check before the pause reaches its limit.')
  })

  it('after a second invitation, says the check is done and the turn stays open', () => {
    const done = buildListenerCall({ ...base, checks: { earlier: 0, recent: [...base.checks!.recent, { kind: 'quiet', ms: 30_000, tool: 'invite' }] }, moment: { kind: 'quiet', quietMs: 45_000, soundsFinished: true } }, {}).user
    expect(done).toContain('You have already checked that they are still there: now keep_listening; the turn stays open until they speak or the pause reaches its limit')
  })

  it('says nothing of an invitation when there was none', () => {
    const c = buildListenerCall({ ...base, checks: { earlier: 0, recent: [{ kind: 'quiet', ms: 3000, tool: 'keep_listening' }] } }, {})
    expect(c.user).not.toContain('Your last invitation')
  })

  it('is asked for once, at the last check before the limit after an unanswered invitation, in its own words, never guessing the answer', () => {
    expect(LISTENER_INSTRUCTIONS_VERSION).toBe(18)
    expect(text).toContain('When the call says this is the last check before the pause reaches its limit and your invitation has gone unanswered, invite once more')
    expect(text).toContain('bringing back what they were saying in a word or two of theirs ("You were saying, the budget?" "Still on the budget?")')
    expect(text).toContain('Never guess what they were about to say: no day, no name, no fact they did not say.')
    expect(text).toContain('At most once in a pause, and after it, keep_listening.')
    expect(text).not.toContain('next_check')
    // The examples stay off the trailing-off scenario's topic, so a run cannot pass by copying them.
    expect(text).not.toMatch(/meeting/i)
  })
})

describe('hq\'s own call at the "not yet" limit', () => {
  const limit = { ...base, moment: { kind: 'limit' as const, quietMs: 60_000 } }

  it('says the pause reached its limit and only close_turn is allowed', () => {
    const c = buildListenerCall(limit, {})
    expect(c.soundsFinished).toBe(true)
    expect(c.user).toContain('Sam has been quiet for 60 s after sounding finished, and has not answered your invitation. The pause has reached its limit: this turn ends now')
    expect(c.user).toContain('The only choice allowed now is close_turn: one line of three to five words, never more than 6, that leaves the door open')
    expect(c.user).not.toContain('any choice is allowed')
  })

  it('may end the turn: its close_turn is read, as on a sounds finished call', () => {
    const d = parseListenerResponse({ text: JSON.stringify({ action: 'close_turn', say: 'Okay, just say when.', next_check: 2 }), calls: [] }, { mode: 'json', soundsFinished: true })
    expect(d).toMatchObject({ tool: 'close_turn', say: 'Okay, just say when.' })
  })

  it('the instructions say what its closing line is', () => {
    expect(text).toContain('When the call says the pause has reached its limit, close_turn is the only choice: one short line of at most 6 words that leaves the door open')
    expect(text).toContain('never guesses the answer, promises nothing, asks nothing, and never says something went wrong')
    expect(text).toContain('never to end a pause they left mid-sentence')
  })
})
