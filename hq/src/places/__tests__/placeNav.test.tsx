import { describe, it, expect } from 'vitest'
import { drillCrumbs, navSections, placeKind, placeNavOf } from '../placeNav'
import { testPlace } from './placeFixture'

const memory = { id: 'memory', label: 'Memory', render: () => null }

describe('a place’s sections in the drilled-in panel @SC-1021', () => {
  it('keeps the sections’ order, each under its group, the unlabelled ones under the project’s own label', () => {
    const place = testPlace()
    expect(navSections(place).map((s) => [s.id, s.group])).toEqual([
      ['overview', null], ['conversations', null],
      ['tasks', 'Work'], ['boards', 'Work'], ['timeline', 'Work'],
      ['runs', 'Agents at work'],
      ['members', 'Project'], ['settings', 'Project'],
    ])
  })

  it('never repeats a label: a project’s Memory, last, stays under Project', () => {
    const base = testPlace()
    const place = testPlace({
      toolGroups: base.toolGroups.map((g) => (g.label === 'Agents at work' ? { ...g, tools: [...g.tools, memory] } : g)),
      sectionOrder: [...base.sectionOrder, 'memory'],
    })
    expect(navSections(place).at(-1)).toMatchObject({ id: 'memory', group: 'Project' })
  })

  it('carries each section’s count, tone and address', () => {
    const tasks = navSections(testPlace()).find((s) => s.id === 'tasks')
    expect(tasks).toEqual({ id: 'tasks', label: 'Tasks', count: '1 needs you · 12', tone: 'needs', href: '/projects/AGX?tool=tasks', group: 'Work' })
    expect(navSections(testPlace())[0].href).toBe('/projects/AGX')
  })

  it('leaves your space’s Agents with no label, and an agent’s own groups as they are', () => {
    const space = testPlace({ homePath: '/space', basePath: '/chat', projectId: null, teamRows: [], linkedTools: [{ id: 'agents', label: 'Agents', render: () => null }], sectionOrder: ['tasks', 'agents'] })
    expect(placeKind(space)).toBe('space')
    expect(navSections(space).find((s) => s.id === 'agents')?.group).toBeNull()
    const agent = testPlace({
      homePath: '/agents/kernel', projectId: null, teamRows: [], linkedTools: [],
      toolGroups: [{ label: 'At work', tools: [{ id: 'now', label: 'Now', render: () => null }] }, { label: 'About it', tools: [memory] }],
      sectionOrder: ['now', 'memory'],
    })
    expect(navSections(agent).slice(2).map((s) => s.group)).toEqual(['At work', 'About it'])
  })
})

describe('the place the shell is handed @SC-1021', () => {
  it('names the project, its id for the avatar and pin, and the section shown', () => {
    const nav = placeNavOf(testPlace(), 'boards')
    expect(nav).toMatchObject({ kind: 'project', id: 'p1', name: 'Agenthix', homePath: '/projects/AGX', current: 'boards' })
  })

  it('names an agent by its own id and avatar', () => {
    const nav = placeNavOf(testPlace({ homePath: '/agents/kernel', projectId: null, agents: [{ id: 'a9', name: 'Kernel', avatarUrl: '/k.png' }] }), 'overview')
    expect(nav).toMatchObject({ kind: 'agent', id: 'a9', avatarUrl: '/k.png' })
  })
})

describe('the breadcrumb inside a place @SC-1044', () => {
  it('reads Projects / the project ▾ / the section: plain parts, only the project’s name opening Find a project', () => {
    const nav = placeNavOf(testPlace(), 'boards')
    const crumbs = drillCrumbs([{ label: 'Projects', href: '/projects' }, { label: 'Agenthix' }], nav)
    expect(crumbs).toEqual([
      { label: 'Projects', href: '/projects' },
      { label: 'Agenthix', href: '/projects/AGX', list: 'projects' },
      { label: 'Boards' },
    ])
  })

  it('opens nothing from an agent’s name', () => {
    const nav = placeNavOf(testPlace({ homePath: '/agents/kernel', projectId: null }), 'overview')
    const crumbs = drillCrumbs([{ label: 'Agents', href: '/agents' }, { label: 'Kernel' }], nav)
    expect(crumbs[1]).toEqual({ label: 'Kernel', href: '/agents/kernel' })
    expect(crumbs[2]).toEqual({ label: 'Overview' })
  })
})
