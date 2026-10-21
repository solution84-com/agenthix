import { describe, it, expect } from 'vitest'
import { chosenSection, conversationsPageRedirect, placeSections, sectionHref, toolOfSection } from '../placeSections'
import { testPlace } from './placeFixture'

describe('placeSections @SC-1021', () => {
  it('puts Overview first and Conversations second, then the place’s tools in its order', () => {
    expect(placeSections(testPlace()).map((t) => t.label)).toEqual(
      ['Overview', 'Conversations', 'Tasks', 'Boards', 'Timeline', 'Runs', 'Members', 'Settings'],
    )
  })

  it('keeps each tool’s count and tone', () => {
    const tasks = placeSections(testPlace()).find((t) => t.id === 'tasks')
    expect(tasks).toMatchObject({ count: '1 needs you · 12', tone: 'needs' })
    expect(placeSections(testPlace()).find((t) => t.id === 'runs')).toMatchObject({ count: '2', tone: 'live' })
  })

  it('never makes a section of another address for a tool (?tool=people for Members)', () => {
    const ids = placeSections(testPlace({ sectionOrder: ['tasks', 'people', 'agents', 'members'] })).map((t) => t.id)
    expect(ids.filter((id) => id === 'people' || id === 'agents')).toEqual([])
    expect(ids.filter((id) => id === 'members')).toEqual(['members'])
  })

  it('leaves out a tool the place does not have (Memory for someone not an admin)', () => {
    const ids = placeSections(testPlace({ sectionOrder: ['tasks', 'boards', 'timeline', 'runs', 'members', 'settings', 'memory'] })).map((t) => t.id)
    expect(ids).toEqual(['overview', 'conversations', 'tasks', 'boards', 'timeline', 'runs', 'members', 'settings'])
  })

  it('adds a tool missing from the order at the end, so none is unreachable', () => {
    const ids = placeSections(testPlace({ sectionOrder: ['tasks'] })).map((t) => t.id)
    expect(ids).toEqual(['overview', 'conversations', 'tasks', 'members', 'boards', 'timeline', 'runs', 'settings'])
  })
})

describe('chosenSection: what the address opens @SC-1021', () => {
  const place = testPlace()

  it('opens Overview at the place’s own address', () => {
    expect(chosenSection(place, null)).toBe('overview')
  })

  it('opens the conversations at ?tool=conversations', () => {
    expect(chosenSection(place, 'conversations')).toBe('conversations')
  })

  it('opens a tool’s section at its ?tool=', () => {
    expect(chosenSection(place, 'boards')).toBe('boards')
  })

  it('opens Members at the former ?tool=people and ?tool=agents', () => {
    expect(chosenSection(place, 'people')).toBe('members')
    expect(chosenSection(place, 'agents')).toBe('members')
  })

  it('opens Overview for a tool the place does not have', () => {
    expect(chosenSection(place, 'nonsense')).toBe('overview')
  })
})

describe('section addresses @SC-1021', () => {
  it('is the place’s own address for Overview, and ?tool= for the rest', () => {
    const space = testPlace({ basePath: '/chat', homePath: '/space' })
    expect(sectionHref(space, 'overview')).toBe('/space')
    expect(sectionHref(space, 'conversations')).toBe('/space?tool=conversations')
    expect(sectionHref(space, 'tasks')).toBe('/space?tool=tasks')
  })

  it('finds the tool a section draws', () => {
    expect(toolOfSection(testPlace(), 'members')?.label).toBe('Members')
    expect(toolOfSection(testPlace(), 'overview')).toBeNull()
  })
})

describe('conversationsPageRedirect: a tool’s address on a page of conversations', () => {
  it('sends a ?tool= to the place’s own address, keeping the rest of the query', () => {
    expect(conversationsPageRedirect('?tool=files&file=a.md', '/space')).toBe('/space?tool=files&file=a.md')
    expect(conversationsPageRedirect('?tool=tasks', '/projects/AGX')).toBe('/projects/AGX?tool=tasks')
  })

  it('stays for no tool, or for the conversations themselves', () => {
    expect(conversationsPageRedirect('', '/space')).toBeNull()
    expect(conversationsPageRedirect('?agent=a1', '/space')).toBeNull()
    expect(conversationsPageRedirect('?tool=conversations', '/space')).toBeNull()
  })
})
