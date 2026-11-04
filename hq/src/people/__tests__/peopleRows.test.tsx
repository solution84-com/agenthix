// @vitest-environment jsdom
/** The People rows and the preview's names (every screen reviewed, People walkthrough). */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/people')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, Loader2: icon, Plus: icon, Check: icon }
})
import {
  ProjectPeopleList, AddPeopleView, ProjectPreviewView,
  type PersonData, type ProjectPersonRowData, type ProjectPreviewData,
} from '@agenthix/ui/people'

afterEach(cleanup)

const NOW = new Date('2026-10-08T12:00:00Z')
const noop = () => {}
const avatar = (p: { name: string }) => <span>{p.name.slice(0, 2)}</span>
const person = (id: string, name: string, handle: string | null = id): PersonData => ({ userId: id, name, handle, avatarUrl: null, state: 'active' })
const idle = { state: 'idle' as const, lead: null, needsYouCount: 0, runningCount: 0 }
const counts = { todo: 0, inProgress: 0, done: 0, needsYou: 0, running: 0, total: 0 }
const row = (p: PersonData): ProjectPersonRowData => ({ person: p, role: 'MEMBER', joinedAt: '2026-09-03T08:00:00Z', now: idle, items: [], tasks: counts, lastActiveAt: null })

describe('a person in the People list @SC-597', () => {
  it('is a plain row, not a bordered card, whose one button covers the whole row', () => {
    render(<ProjectPeopleList people={[row(person('u1', 'Dana Weber'))]} meId="u0" accessLevel="OPEN" now={NOW} renderAvatar={avatar} onOpenPerson={noop} />)
    const button = screen.getByRole('button', { name: 'Open Dana Weber' })
    expect(button.className).toContain('after:inset-0')
    const item = button.closest('li')!
    expect(item.className).toContain('relative')
    expect(item.className).not.toMatch(/\bborder\b/)
  })

  it('keeps a picture\'s profile trigger above the row\'s button', () => {
    render(
      <ProjectPeopleList
        people={[row(person('u1', 'Dana Weber'))]} meId="u0" accessLevel="OPEN" now={NOW} renderAvatar={avatar} onOpenPerson={noop}
        profileOf={(_id, children) => <span role="button" aria-label="profile">{children}</span>}
      />,
    )
    expect(within(screen.getByRole('button', { name: 'profile' })).getByText('Da').parentElement!.className).toContain('z-10')
  })
})

describe('a person in Add people @SC-599', () => {
  it('adds from anywhere on the row: the Add button covers it', () => {
    render(
      <AddPeopleView
        people={[{ person: person('u1', 'Dana Weber', 'dana'), orgRole: 'MEMBER', projectCount: 1, isMember: false }]}
        meId="u0" role="MEMBER" onRoleChange={noop} renderAvatar={avatar} addingId={null} onAdd={noop} onBack={noop}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add Dana Weber' }).className).toContain('after:inset-0')
  })
})

describe('the preview\'s names', () => {
  const many = Array.from({ length: 14 }, (_, i) => person(`u${i}`, `Person Number${i}`))
  const preview = (over: Partial<ProjectPreviewData> = {}): ProjectPreviewData => ({
    project: {
      id: 'p1', key: 'WEB', name: 'Website', description: null, accessLevel: 'OPEN', startedAt: '2026-09-02T08:00:00Z',
      product: null, site: null, lead: null,
    },
    isMember: false, canJoin: true, people: many, agents: [], openTaskCount: 0, runningCount: 0, lastRunAt: null, ...over,
  })
  const view = (p: ProjectPreviewData) => render(
    <ProjectPreviewView preview={p} now={NOW} renderPersonAvatar={avatar} renderAgentAvatar={avatar} joining={false} onJoin={noop} />,
  )

  it('shows each picture with its own name, and counts the rest of a long list', () => {
    view(preview())
    expect(screen.getByTitle('Person Number1').className).toContain('truncate')
    expect(screen.getByText('Person Number7')).toBeTruthy()
    expect(screen.queryByText('Person Number8')).toBeNull()
    expect(screen.getByText(`and ${many.length - 8} more`)).toBeTruthy()
  })

  it('still shows names when a person has a blank one, and says when a list is empty', () => {
    view(preview({ people: [person('u1', 'Dana'), person('u2', '  ', 'blank')] }))
    expect(screen.getByText('Dana')).toBeTruthy()
    expect(screen.getByText('No agents in this project yet.')).toBeTruthy()
  })
})
