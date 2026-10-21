import { describe, it, expect } from 'vitest'
import { parseOpenTasksDestination, parseDestinationsByProject } from '../openTasksDestination'

describe('parseOpenTasksDestination @SC-594', () => {
  it('takes another person, or leaving them waiting', () => {
    expect(parseOpenTasksDestination({ kind: 'person', userId: 'u2' })).toEqual({ kind: 'person', userId: 'u2' })
    expect(parseOpenTasksDestination({ kind: 'wait' })).toEqual({ kind: 'wait' })
  })

  // Nothing is chosen until the person picks (spec §3, People): there is no default.
  it('refuses a missing choice rather than falling back to one', () => {
    expect(() => parseOpenTasksDestination(undefined)).toThrow(/where their open tasks go/)
    expect(() => parseOpenTasksDestination(null)).toThrow(/where their open tasks go/)
  })

  it('refuses a choice it does not know, and a person with no id', () => {
    expect(() => parseOpenTasksDestination({ kind: 'agent', agentId: 'a' })).toThrow()
    expect(() => parseOpenTasksDestination({ kind: 'person' })).toThrow()
    expect(() => parseOpenTasksDestination({ kind: 'person', userId: '' })).toThrow()
  })
})

describe('parseDestinationsByProject @SC-594', () => {
  it('reads one choice per project', () => {
    const parsed = parseDestinationsByProject([
      { projectId: 'p1', destination: { kind: 'wait' } },
      { projectId: 'p2', destination: { kind: 'person', userId: 'u2' } },
    ])
    expect(parsed.get('p1')).toEqual({ kind: 'wait' })
    expect(parsed.get('p2')).toEqual({ kind: 'person', userId: 'u2' })
  })

  it('treats no list as no choices, and refuses a project named twice', () => {
    expect(parseDestinationsByProject(undefined).size).toBe(0)
    expect(() => parseDestinationsByProject([
      { projectId: 'p1', destination: { kind: 'wait' } },
      { projectId: 'p1', destination: { kind: 'wait' } },
    ])).toThrow(/more than once/)
  })
})
