import { describe, it, expect } from 'vitest'
import { roundState, streakVerdict } from '../roundState'

const NOW = new Date('2026-10-10T10:00:00Z')
const later = new Date('2026-10-11T09:00:00Z')
const earlier = new Date('2026-10-10T09:00:00Z')

describe("a round's state @SC-684", () => {
  it.each([
    ['done, whatever its run said', { status: 'DONE', runState: 'RUN_FAILED', roundAt: earlier }, 'done'],
    ['failed', { status: 'TODO', runState: 'RUN_FAILED', roundAt: earlier }, 'failed'],
    ['running', { status: 'IN_PROGRESS', runState: 'RUN_ACTIVE', roundAt: earlier }, 'running'],
    ['queued counts as running', { status: 'TODO', runState: 'RUN_QUEUED', roundAt: earlier }, 'running'],
    ['waiting for its time', { status: 'TODO', runState: 'RUN_NONE', roundAt: later }, 'waiting'],
    ['blocked on a person', { status: 'TODO', runState: 'RUN_BLOCKED', roundAt: earlier }, 'needsYou'],
    ['its time came and nothing ran it', { status: 'TODO', runState: 'RUN_NONE', roundAt: earlier }, 'needsYou'],
    ['unlinked from its time and not done', { status: 'TODO', runState: 'RUN_NONE', roundAt: null }, 'needsYou'],
  ] as const)('%s', (_what, facts, state) => {
    expect(roundState(facts, NOW)).toBe(state)
  })
})

describe('the failing-streak notice @SC-687', () => {
  it('is raised by three failed rounds in a row, newest first', () => {
    expect(streakVerdict(['failed', 'failed', 'failed'])).toBe('raise')
    expect(streakVerdict(['failed', 'failed', 'failed', 'done'])).toBe('raise')
  })

  it('leaves out the rounds still waiting or running', () => {
    expect(streakVerdict(['waiting', 'running', 'failed', 'failed', 'failed'])).toBe('raise')
  })

  it('is cleared when a round succeeds: the next one, or a failed one run again', () => {
    expect(streakVerdict(['waiting', 'done', 'failed', 'failed', 'failed'])).toBe('clear')
    expect(streakVerdict(['failed', 'failed', 'done', 'failed'])).toBe('clear')
  })

  it('is left as it is otherwise: fewer than three, or a round that needs a person', () => {
    expect(streakVerdict(['failed', 'failed'])).toBe('keep')
    expect(streakVerdict(['needsYou', 'failed', 'failed', 'failed'])).toBe('keep')
    expect(streakVerdict([])).toBe('keep')
  })
})
