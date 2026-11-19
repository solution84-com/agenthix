/**
 * hq keeps the light model's choices since the person's words last changed, and each call carries them: kept, cleared
 * when new words come, at a hand over and when the turn ends, and capped with a count of the earlier ones.
 */
import { describe, expect, it } from 'vitest'
import { CHECKS_KEPT, ListeningState } from '../state'
import { json, rig } from './listenRig'

const keep = (n: number) => json({ action: 'keep_listening', next_check: n })

describe('the checks list in the state', () => {
  it('keeps each check while the words stay the same, and clears it when they change', () => {
    const s = new ListeningState()
    s.wordsAre('I was thinking')
    s.checked({ kind: 'soundsFinished', ms: 700, tool: 'keep_listening' })
    s.wordsAre('I was thinking')
    s.wordsAre('')
    s.checked({ kind: 'quiet', ms: 3000, tool: 'invite' })
    expect(s.checks).toEqual([{ kind: 'soundsFinished', ms: 700, tool: 'keep_listening' }, { kind: 'quiet', ms: 3000, tool: 'invite' }])
    s.wordsAre('I was thinking we could')
    expect(s.checks).toEqual([])
  })

  it(`keeps the last ${CHECKS_KEPT} and counts the earlier ones`, () => {
    const s = new ListeningState()
    for (let i = 1; i <= CHECKS_KEPT + 3; i++) s.checked({ kind: 'quiet', ms: i * 1000, tool: 'keep_listening' })
    expect(s.checks).toHaveLength(CHECKS_KEPT)
    expect(s.checks[0]!.ms).toBe(4000)
    expect(s.checksEarlier).toBe(3)
    s.clearChecks()
    expect([s.checks.length, s.checksEarlier]).toEqual([0, 0])
  })

  it('forgets them with a new turn', () => {
    const s = new ListeningState()
    s.wordsAre('Hi')
    s.checked({ kind: 'quiet', ms: 1000, tool: 'keep_listening' })
    s.newTurn()
    expect(s.checks).toEqual([])
  })
})

describe('each listening call carries its checks in this pause', () => {
  it('a later check reads the earlier ones; the first reads none', async () => {
    const r = rig([keep(3), keep(4), keep(6)])
    const text = 'I was thinking we could maybe move the meeting to'
    await r.call({ seq: 1, moment: 'soundsFinished', text, quietMs: 700 })
    await r.call({ seq: 2, moment: 'quiet', keptOpen: true, text, quietMs: 3700 })
    await r.call({ seq: 3, moment: 'quiet', keptOpen: true, text: '', quietMs: 7700 })
    expect(r.requests[0]).not.toContain('you have been asked')
    expect(r.requests[1]).toContain('asked once, and nothing new came: keep_listening at 0.7 s of quiet.')
    expect(r.requests[2]).toContain('asked 2 times, and nothing new came: keep_listening at 0.7 s, keep_listening at 3.7 s of quiet.')
  })

  it('new words start the list again', async () => {
    const r = rig([keep(2), keep(2), keep(2)])
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'So the plan', quietMs: 400 })
    await r.call({ seq: 2, moment: 'quietAfterWords', text: 'So the plan is to', quietMs: 400 })
    await r.call({ seq: 3, moment: 'quiet', text: 'So the plan is to', quietMs: 4000 })
    expect(r.requests[1]).not.toContain('you have been asked')
    expect(r.requests[2]).toContain('asked once, and nothing new came: keep_listening at 0.4 s of quiet.')
  })

  it('a hand over starts it again: the wait for the answer counts its own checks', async () => {
    const r = rig([keep(2), json({ action: 'hand_over', asked: 'the deploy', hold: 'Let me look at the deploy.' }), json({ action: 'acknowledge', say: 'Still looking.', next_check: 8 }), keep(8)])
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'Did the deploy go through?', quietMs: 400 })
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'Did the deploy go through?', quietMs: 700 })
    expect(r.requests[1]).toContain('asked once')
    await r.call({ seq: 3, moment: 'working', text: '', quietMs: 6000, workingMs: 6000 })
    await r.call({ seq: 4, moment: 'working', text: '', quietMs: 15_000, workingMs: 15_000 })
    expect(r.requests[2]).not.toContain('you have been asked')
    expect(r.requests[3]).toContain('While the answer has been worked out you have been asked once: acknowledge at 6 s of waiting.')
  })

  it('a turn closed alone leaves nothing for the next turn', async () => {
    const r = rig([keep(2), json({ action: 'close_turn', say: 'You are welcome.' }), keep(2)])
    await r.call({ seq: 1, moment: 'quietAfterWords', text: 'Thanks', quietMs: 400 })
    await r.call({ seq: 2, moment: 'soundsFinished', text: 'Thanks', quietMs: 700 })
    await r.call({ seq: 3, moment: 'quietAfterWords', text: 'Thanks', quietMs: 400 })
    expect(r.requests[2]).not.toContain('you have been asked')
  })
})
