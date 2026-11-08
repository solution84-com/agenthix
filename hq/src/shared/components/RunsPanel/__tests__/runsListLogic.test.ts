import { describe, it, expect } from 'vitest'
import { runRing } from '../runsListLogic'
import { run } from './runFixtures'

describe('the ring on a run in the Runs panel (D18)', () => {
  it('rings every failed run Failed, waiting for the person or finished', () => {
    expect(runRing(run('a', { group: 'waiting', state: 'failed — Server restarted' }))).toBe('FAILED')
    expect(runRing(run('b', { group: 'finished', state: 'failed — the build broke' }))).toBe('FAILED')
    expect(runRing(run('c', { group: 'finished', state: 'failed' }))).toBe('FAILED')
  })

  it('rings a run waiting for an okay or an answer Needs you, and a finished one not at all', () => {
    expect(runRing(run('d', { group: 'waiting', state: 'wants approval' }))).toBe('NEEDS_YOU')
    expect(runRing(run('e', { group: 'finished', state: 'done' }))).toBeNull()
  })
})
