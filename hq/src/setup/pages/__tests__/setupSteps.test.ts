import { describe, it, expect } from 'vitest'
import { neighbour, position, stepFromParam, stepOfResume, stepParam } from '../setupSteps'

describe('setup steps @SC-1184', () => {
  it('are four, the same for everyone: you, organisation, AI, last look', () => {
    expect(neighbour('you', 1)).toBe('org')
    expect(neighbour('org', 1)).toBe('ai')
    expect(neighbour('ai', 1)).toBe('review')
    expect(neighbour('review', -1)).toBe('ai')
    expect(position('ai')).toEqual({ step: 3, total: 4 })
    expect(position('review')).toEqual({ step: 4, total: 4 })
  })

  it('carry the step in the address, and read an old one as no step', () => {
    expect(stepFromParam(stepParam('ai'))).toBe('ai')
    expect(stepFromParam('organisation')).toBe('org')
    for (const gone of ['choice', 'model', 'voice']) expect(stepFromParam(gone)).toBeNull()
  })

  it('never goes past either end', () => {
    expect(neighbour('you', -1)).toBe('you')
    expect(neighbour('review', 1)).toBe('review')
  })

  it('opens at the step the resume names', () => {
    expect(stepOfResume('organisation')).toBe('org')
    expect(stepOfResume('review')).toBe('review')
  })
})
