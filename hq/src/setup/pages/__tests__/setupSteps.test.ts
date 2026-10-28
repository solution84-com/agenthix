import { describe, it, expect } from 'vitest'
import { neighbour, pathFromParam, position, stepOfResume } from '../setupSteps'

describe('setup steps per path @SC-1184', () => {
  it('the organisation comes second on every path, before how agents reach AI', () => {
    for (const path of ['cloud', 'keys', 'later'] as const) {
      expect(neighbour(path, 'you', 1)).toBe('org')
      expect(neighbour(path, 'org', 1)).toBe('choice')
      expect(position(path, 'choice').step).toBe(3)
    }
  })

  it('Cloud is four steps and skips the model provider and voice', () => {
    expect(position('cloud', 'you')).toEqual({ step: 1, total: 4 })
    expect(neighbour('cloud', 'choice', 1)).toBe('review')
    expect(position('cloud', 'review')).toEqual({ step: 4, total: 4 })
  })

  it('own keys is six steps: you, organisation, choice, model provider, voice, last look', () => {
    expect(neighbour('keys', 'choice', 1)).toBe('model')
    expect(neighbour('keys', 'model', 1)).toBe('voice')
    expect(neighbour('keys', 'voice', 1)).toBe('review')
    expect(position('keys', 'review')).toEqual({ step: 6, total: 6 })
    expect(neighbour('keys', 'review', -1)).toBe('voice')
  })

  it('setting AI up later is four steps, from the choice straight to the last look', () => {
    expect(pathFromParam('later')).toBe('later')
    expect(neighbour('later', 'choice', 1)).toBe('review')
    expect(neighbour('later', 'review', -1)).toBe('choice')
    expect(position('later', 'review')).toEqual({ step: 4, total: 4 })
  })

  it('never goes past either end', () => {
    expect(neighbour('keys', 'you', -1)).toBe('you')
    expect(neighbour('keys', 'review', 1)).toBe('review')
  })

  it('opens at the step the resume names', () => {
    expect(stepOfResume('organisation')).toBe('org')
    expect(stepOfResume('choice')).toBe('choice')
    expect(stepOfResume('review')).toBe('review')
  })
})
