import { describe, it, expect } from 'vitest'
import { neighbour, position, stepOfResume } from '../setupSteps'

describe('setup steps per path @SC-1184', () => {
  it('Cloud is four steps and skips the model provider and voice', () => {
    expect(position('cloud', 'you')).toEqual({ step: 1, total: 4 })
    expect(neighbour('cloud', 'choice', 1)).toBe('org')
    expect(neighbour('cloud', 'org', 1)).toBe('review')
    expect(position('cloud', 'review')).toEqual({ step: 4, total: 4 })
  })

  it('own keys is six steps: you, choice, model provider, voice, organisation, last look', () => {
    expect(neighbour('keys', 'you', 1)).toBe('choice')
    expect(neighbour('keys', 'choice', 1)).toBe('model')
    expect(neighbour('keys', 'model', 1)).toBe('voice')
    expect(neighbour('keys', 'voice', 1)).toBe('org')
    expect(position('keys', 'review')).toEqual({ step: 6, total: 6 })
    expect(neighbour('keys', 'org', -1)).toBe('voice')
  })

  it('never goes past either end', () => {
    expect(neighbour('keys', 'you', -1)).toBe('you')
    expect(neighbour('keys', 'review', 1)).toBe('review')
  })

  it('opens at the step the resume names', () => {
    expect(stepOfResume('choice')).toBe('choice')
    expect(stepOfResume('voice')).toBe('voice')
    expect(stepOfResume('organisation')).toBe('org')
  })
})
