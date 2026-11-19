/**
 * The light model's paced scenarios: silence checked at the waits hq sends from its own schedule, scored on what the
 * light model chose across the pause.
 */
import { describe, expect, it } from 'vitest'
import { PACED_SCENARIOS, runPacedScenario, scorePace } from '../lightSet/paced'
import type { PacedSummary } from '../types'
import { ACCESS, json, scriptedModel, type Answer } from '../../../voice/playground/light/__tests__/fakes'

const keep = json({ action: 'keep_listening' })
const invite = (say: string) => json({ action: 'invite', say })
const trailing = PACED_SCENARIOS.find(s => s.id === 'trailing-off')!
const minute = PACED_SCENARIOS.find(s => s.id === 'find-the-number')!
const LAST = 30_000

/** Keeps listening at 5 s, invites at 15 s, checks they are still there at the last check, closes at the limit. */
const good: [RegExp, Answer][] = [
  [/reached its limit/, json({ action: 'close_turn', say: 'Okay, just say when.' })],
  [/Now is the time/, invite('You were saying, the meeting?')],
  [/asked 2 times/, invite('Take your time.')],
  [/a minute/, keep],
]

const seconds = (ms: number[]) => ms.map(m => Math.round(m / 1000))

describe('the paced scenarios @SC-1840', () => {
  it('has the two pauses', () => {
    expect(PACED_SCENARIOS.map(s => s.id)).toEqual(['trailing-off', 'find-the-number'])
  })

  it('checks at hq\'s schedule, 5, 15 and 30 s, whatever the light model chose, and passes a pause that invites, checks once and closes', async () => {
    const r = await runPacedScenario(trailing, scriptedModel(good), ACCESS)
    expect(seconds(r.paced!.quietAtMs)).toEqual([1, 5, 15, 30])
    expect(r.paced).toMatchObject({
      checks: 4, invites: ['Take your time.', 'You were saying, the meeting?'], presenceChecks: 1,
      presenceLines: ['You were saying, the meeting?'], atLimit: { choice: 'close_turn', words: 'Okay, just say when.', turn: 'closed' },
    })
    expect(Math.round(r.paced!.firstPresenceAtMs! / 1000)).toBe(30)
    expect(r.pass).toBe(true)
    expect(r.why).toBeUndefined()
  })

  it('a next_check the model still sends changes nothing', async () => {
    const r = await runPacedScenario(trailing, scriptedModel([[/meeting/, json({ action: 'keep_listening', next_check: 2 })]]), ACCESS)
    expect(r.paced!.checks).toBe(4)
    expect(r).toMatchObject({ pass: false, why: 'never invited' })
  })

  it('fails a presence check before the last check, and none at all', async () => {
    const early = await runPacedScenario(trailing, scriptedModel([good[0]!, [/asked once/, invite('Move it to…?')], ...good.slice(1)]), ACCESS)
    expect(early.pass).toBe(false)
    expect(early.why).toMatch(/^a presence check at 15(\.\d+)? s; wanted it at the last check, 30 s$/)
    const none = await runPacedScenario(trailing, scriptedModel([good[0]!, [/Now is the time/, keep], ...good.slice(2)]), ACCESS)
    expect(none).toMatchObject({ pass: false, why: 'no presence check' })
    const stored = await runPacedScenario(trailing, scriptedModel([[/reached its limit/, keep], ...good.slice(1)]), ACCESS)
    expect(stored).toMatchObject({ pass: false, why: 'at the limit chose keep_listening (a stored closing line); wanted its own close_turn' })
  })

  it('passes "find the number" waited out, and fails it closed or invited at 5 s', async () => {
    expect(await runPacedScenario(minute, scriptedModel(good), ACCESS)).toMatchObject({ pass: true, paced: { checks: 4 } })
    const closed = await runPacedScenario(minute, scriptedModel([[/a minute/, json({ action: 'close_turn', say: 'Sure.' })]]), ACCESS)
    expect(closed).toMatchObject({ pass: false, why: 'the turn ended (closed, chose close_turn)' })
    const early = await runPacedScenario(minute, scriptedModel([[/asked once/, invite('Take your time.')]]), ACCESS)
    expect(early.pass).toBe(false)
    expect(early.why).toMatch(/^invited at 5(\.\d+)? s; wanted none before 10 s$/)
  })

  it('scores each part of the pause', () => {
    const step = { choice: 'keep_listening' as const, words: null, answer: null, asked: null, nextCheck: 4, turn: 'open' as const, ms: 1, overLimit: false, pass: true, why: null }
    const closed = { choice: 'close_turn' as const, words: 'Okay, just say when.', turn: 'closed' as const }
    const summary = (invite: number | null = 15_000, presence: [number | null, number] = [LAST, 1], atLimit: PacedSummary['atLimit'] = closed, checks = 4): PacedSummary => ({
      checks, nextChecks: [], quietAtMs: [], firstInviteAtMs: invite, invites: [], firstPresenceAtMs: presence[0], presenceChecks: presence[1],
      presenceLines: [], atLimit,
    })
    expect(scorePace(trailing.expect, [step], summary(), LAST)).toBeNull()
    expect(scorePace(trailing.expect, [step], summary(null), LAST)).toBe('never invited')
    expect(scorePace(trailing.expect, [step], summary(16_500, [LAST, 1]), LAST)).toBe('first invite at 16.5 s; wanted one by 15 s')
    // The 15 s check comes at 15 s or just after.
    expect(scorePace(trailing.expect, [step], summary(15_004, [LAST, 1]), LAST)).toBeNull()
    expect(scorePace(trailing.expect, [step], summary(15_000, [LAST, 1], closed, 6), LAST)).toBe('6 checks; wanted 4 to 4')
    expect(scorePace(trailing.expect, [step], summary(5000, [LAST, 2]), LAST)).toBe('2 presence checks; at most 1')
    expect(scorePace(trailing.expect, [step], summary(5000, [15_000, 1]), LAST)).toBe('a presence check at 15 s; wanted it at the last check, 30 s')
    expect(scorePace(trailing.expect, [step], summary(5000, [null, 0]), LAST)).toBe('no presence check')
    expect(scorePace(trailing.expect, [step], summary(LAST, [LAST, 1]), LAST)).toBe('first invite at 30 s; wanted one by 15 s')
    expect(scorePace(minute.expect, [step], summary(5000, [null, 0], null), LAST)).toBe('invited at 5 s; wanted none before 10 s')
    expect(scorePace(minute.expect, [step], summary(15_000, [null, 0], null), LAST)).toBeNull()
    expect(scorePace(trailing.expect, [step], summary(15_000, [LAST, 1], null), LAST)).toBe('not checked at the limit')
    expect(scorePace(trailing.expect, [step], summary(15_000, [LAST, 1], { choice: null, words: null, turn: 'fallback' }), LAST))
      .toBe('at the limit the turn was fallback; wanted closed')
    expect(scorePace(trailing.expect, [step], summary(15_000, [LAST, 1], { ...closed, words: 'Talk Thursday then.' }), LAST))
      .toBe('guessed at the answer: "Talk Thursday then."')
  })

  it('fails what the light model cannot know: a dropped line, or how they are', () => {
    const said = (words: string) => ({ choice: 'invite' as const, words, answer: null, asked: null, nextCheck: 15, turn: 'open' as const, ms: 1, overLimit: false, pass: true, why: null })
    const summary: PacedSummary = {
      checks: 4, nextChecks: [], quietAtMs: [], firstInviteAtMs: 15_000, invites: [], firstPresenceAtMs: LAST, presenceChecks: 1,
      presenceLines: [], atLimit: { choice: 'close_turn', words: 'Okay, just say when.', turn: 'closed' },
    }
    for (const words of ['You got cut off there.', 'Are you alright?', 'Did I lose you?', 'I think the connection dropped.']) {
      expect(scorePace(trailing.expect, [said(words)], summary, LAST)).toBe(`said what it cannot know: "${words}"`)
    }
    for (const words of ['Take your time.', 'Still with me?', 'Go on, I\'m listening.']) {
      expect(scorePace(trailing.expect, [said(words)], summary, LAST)).toBeNull()
    }
  })
})
