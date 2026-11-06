// @vitest-environment jsdom
/** The People views (every screen reviewed spec §3): the list, one person, Add, Remove, the preview, the profile card. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'

// ui resolves its own copy of lucide-react; its icons are mocked by that path.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/people')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, Loader2: icon, Plus: icon, Check: icon }
})
import {
  ProjectPeopleList, ProjectPersonView, AddPeopleView, RemovePersonView, ProjectOverviewView, PersonProfileCardView,
  type ProjectPersonRowData, type ProjectPersonDetailData, type PersonData, type ProjectPreviewData, type PersonCardData,
} from '@agenthix/ui/people'

afterEach(cleanup)

const NOW = new Date('2026-10-08T12:00:00Z')
const noop = () => {}
const avatar = (p: { name: string }) => <span>{p.name.slice(0, 2)}</span>
const person = (id: string, name: string, handle: string): PersonData => ({ userId: id, name, handle, avatarUrl: null, state: 'active' })
const AVERY = person('u0', 'Avery Chen', 'avery')
const DANA = person('u1', 'Dana Weber', 'dana')
const MIRA = person('u2', 'Mira Costa', 'mira')
const idle = { state: 'idle' as const, lead: null, needsYouCount: 0, runningCount: 0 }
const counts = { todo: 2, inProgress: 1, done: 9, needsYou: 1, running: 0, total: 12 }
const waiting = {
  kind: 'needsYou' as const, taskId: 't1', key: 'WEB-27', title: 'Fix the checkout redirect', projectId: 'p1',
  projectName: 'Web', reason: 'wants to run a command', since: null,
}

function row(p: PersonData, over: Partial<ProjectPersonRowData> = {}): ProjectPersonRowData {
  return { person: p, role: 'MEMBER', joinedAt: '2026-09-03T08:00:00Z', now: idle, items: [], tasks: counts, lastActiveAt: null, ...over }
}

describe('ProjectPeopleList @SC-597', () => {
  const people = [
    row(AVERY, { role: 'ADMIN' }),
    row(DANA, { now: { state: 'needsYou', lead: waiting, needsYouCount: 1, runningCount: 0 }, items: [waiting] }),
  ]

  it('shows each member with their role beside the name and one status line', () => {
    render(<ProjectPeopleList people={people} meId="u0" accessLevel="OPEN" now={NOW} renderAvatar={avatar} onOpenPerson={noop} onAdd={noop} />)
    const dana = screen.getByRole('button', { name: 'Open Dana Weber' })
    expect(dana.textContent).toBe('Dana Weber· Member')
    expect(screen.getByText('Needs Dana')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open Avery Chen' }).textContent).toContain('· Admin · you')
    expect(screen.getByText('Open project · 2 people')).toBeTruthy()
  })

  it('shows a project Viewer as "Dana · Viewer" (adr-0102)', () => {
    render(<ProjectPeopleList people={[row(DANA, { role: 'VIEWER' })]} meId="u0" accessLevel="OPEN" now={NOW} renderAvatar={avatar} onOpenPerson={noop} onAdd={noop} />)
    expect(screen.getByRole('button', { name: 'Open Dana Weber' }).textContent).toBe('Dana Weber· Viewer')
  })

  it('counts what waits on a person at the right', () => {
    render(<ProjectPeopleList people={people} meId="u0" accessLevel="OPEN" now={NOW} renderAvatar={avatar} onOpenPerson={noop} />)
    expect(screen.getByLabelText('1 waiting').textContent).toBe('1')
  })

  it('offers Add only to those who may manage, and opens a person', () => {
    const open = vi.fn()
    const { rerender } = render(<ProjectPeopleList people={people} meId="u0" accessLevel="PRIVATE" now={NOW} renderAvatar={avatar} onOpenPerson={open} />)
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Open Dana Weber' }))
    expect(open).toHaveBeenCalledWith('u1')
    rerender(<ProjectPeopleList people={people} meId="u0" accessLevel="PRIVATE" now={NOW} renderAvatar={avatar} onOpenPerson={open} onAdd={noop} />)
    expect(screen.getByRole('button', { name: '＋ Add' })).toBeTruthy()
  })
})

describe('ProjectPeopleList among other members @SC-597', () => {
  it('drops its header, and names the teams that bring someone here', () => {
    render(
      <ProjectPeopleList
        people={[row(DANA), row(MIRA)]} meId="u0" accessLevel="PRIVATE" now={NOW} renderAvatar={avatar} onOpenPerson={noop} hideHeader onAdd={noop}
        teamsOf={id => (id === 'u1' ? { names: ['Marketing'], direct: false } : id === 'u2' ? { names: ['Marketing'], direct: true } : undefined)}
      />,
    )
    expect(screen.queryByText(/Private project/)).toBeNull()
    expect(screen.queryByRole('button', { name: '＋ Add' })).toBeNull()
    expect(screen.getAllByText('Marketing')).toHaveLength(2)
    expect(screen.getByText(/Through Marketing — change in the team/)).toBeTruthy()
    expect(screen.getByText(/Also added in person/)).toBeTruthy()
  })
})

describe('ProjectPersonView @SC-598', () => {
  const detail = (over: Partial<ProjectPersonDetailData> = {}): ProjectPersonDetailData => ({
    ...row(DANA, { now: { state: 'needsYou', lead: waiting, needsYouCount: 1, runningCount: 0 }, items: [waiting] }),
    canManage: true, isMe: false, timezone: 'Europe/Berlin', orgRole: 'MEMBER', orgJoinedAt: '2026-09-03T08:00:00Z', viewerIsOrgAdmin: true, ...over,
  })
  const view = (d: ProjectPersonDetailData, over: Partial<React.ComponentProps<typeof ProjectPersonView>> = {}) => render(
    <ProjectPersonView
      detail={d} now={NOW} lastAdmin={false} renderAvatar={avatar} onBack={noop} onOpenTasks={noop} onOpenWaiting={noop}
      onSetRole={noop} onManageInOrganisation={noop} onRemove={noop} onLeave={noop} {...over}
    />,
  )

  it('changes no role and removes no one who is here only through a team, and says where to change it @SC-674', () => {
    view(detail(), { teams: { names: ['Marketing'], direct: false, ownRole: null } })
    expect(screen.queryByLabelText("Dana Weber's role in this project")).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove from this project' })).toBeNull()
    expect(screen.getByText('Marketing — change it in the team')).toBeTruthy()
  })

  it('keeps the role select and Remove for someone also added in person, showing the role they hold themselves', () => {
    view(detail(), { teams: { names: ['Marketing'], direct: true, ownRole: 'VIEWER' } })
    expect((screen.getByLabelText("Dana Weber's role in this project") as HTMLSelectElement).value).toBe('VIEWER')
    expect(screen.getByRole('button', { name: 'Remove from this project' })).toBeTruthy()
    expect(screen.getByText('Marketing — the higher role applies')).toBeTruthy()
  })

  it('goes back to the view it was opened from', () => {
    view(detail(), { backLabel: 'Members' })
    expect(screen.getByRole('button', { name: /Members/ })).toBeTruthy()
  })

  it('shows what waits on the person, their tasks and their role, for a manager', () => {
    view(detail())
    expect(screen.getByText('Waiting on Dana Weber')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'WEB-27' })).toBeTruthy()
    expect(screen.getByText("Tasks on Dana Weber's behalf")).toBeTruthy()
    expect(screen.getByText('To do 2 · In progress 1 · Done 9')).toBeTruthy()
    expect((screen.getByLabelText("Dana Weber's role in this project") as HTMLSelectElement).value).toBe('MEMBER')
    expect(screen.getByText(/Member · since/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Manage in Organisation ›' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Remove from this project' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Leave this project' })).toBeNull()
  })

  it('offers Leave, not Remove, for yourself', () => {
    view(detail({ isMe: true }))
    expect(screen.getByRole('button', { name: 'Leave this project' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove from this project' })).toBeNull()
  })

  it('shows no controls to someone who may not manage, and no Manage link to those who are not org admins', () => {
    view(detail({ canManage: false, viewerIsOrgAdmin: false }))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove from this project' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Manage in Organisation/ })).toBeNull()
  })

  it('withholds role, remove and leave from the only admin, and says why', () => {
    view(detail({ role: 'ADMIN', canManage: true }), { lastAdmin: true })
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Remove from this project' })).toBeNull()
    expect(screen.getByText(/only admin/)).toBeTruthy()
  })

  it('offers Member, Viewer and Admin, and changes the role from the select (adr-0102)', () => {
    const setRole = vi.fn()
    view(detail(), { onSetRole: setRole })
    const select = screen.getByLabelText("Dana Weber's role in this project") as HTMLSelectElement
    expect(Array.from(select.options).map(o => o.text)).toEqual(['Member', 'Viewer', 'Admin'])
    fireEvent.change(select, { target: { value: 'VIEWER' } })
    expect(setRole).toHaveBeenCalledWith('VIEWER')
    fireEvent.change(screen.getByLabelText("Dana Weber's role in this project"), { target: { value: 'ADMIN' } })
    expect(setRole).toHaveBeenCalledWith('ADMIN')
  })
})

describe('AddPeopleView @SC-599', () => {
  const pickable = [
    { person: AVERY, orgRole: 'ADMIN' as const, projectCount: 5, isMember: true },
    { person: person('u3', 'Avery Tan', 'avery.tan'), orgRole: 'MEMBER' as const, projectCount: 1, isMember: false },
    { person: MIRA, orgRole: 'MEMBER' as const, projectCount: 2, isMember: false },
  ]
  const view = (over: Partial<React.ComponentProps<typeof AddPeopleView>> = {}) => render(
    <AddPeopleView
      people={pickable} meId="u0" role="MEMBER" onRoleChange={noop} renderAvatar={avatar} addingId={null}
      onAdd={noop} onBack={noop} {...over}
    />,
  )

  it('lists everyone with a tick for members and Add for the rest', () => {
    view()
    expect(screen.getByText('@avery · Admin · you')).toBeTruthy()
    expect(screen.getByText('@avery.tan · Member · in 1 project')).toBeTruthy()
    expect(screen.getAllByLabelText('In this project')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: /^Add (Avery Tan|Mira Costa)$/ })).toHaveLength(2)
  })

  it('narrows by name or @handle', () => {
    view()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'avery' } })
    expect(screen.getByText('Avery Chen')).toBeTruthy()
    expect(screen.getByText('Avery Tan')).toBeTruthy()
    expect(screen.queryByText('Mira Costa')).toBeNull()
  })

  it('adds as the chosen role, offered as Member · Viewer · Admin', () => {
    const add = vi.fn()
    const role = vi.fn()
    view({ onAdd: add, onRoleChange: role })
    expect(screen.getAllByRole('radio').map(r => r.textContent)).toEqual(['Member', 'Viewer', 'Admin'])
    fireEvent.click(screen.getByRole('radio', { name: 'Admin' }))
    expect(role).toHaveBeenCalledWith('ADMIN')
    fireEvent.click(screen.getByRole('button', { name: 'Add Mira Costa' }))
    expect(add).toHaveBeenCalledWith('u2')
  })

  it('offers an invitation only to those who may invite', () => {
    const { unmount } = view()
    expect(screen.queryByText(/Invite them in Organisation/)).toBeNull()
    unmount()
    view({ onInvite: noop })
    expect(screen.getByRole('button', { name: 'Invite them in Organisation ›' })).toBeTruthy()
  })
})

describe('RemovePersonView @SC-598', () => {
  const view = (over: Partial<React.ComponentProps<typeof RemovePersonView>> = {}) => render(
    <RemovePersonView
      mode="remove" person={DANA} projectName="Web" openTaskCount={3} doneTaskCount={9} others={[AVERY, MIRA]}
      busy={false} onConfirm={noop} onCancel={noop} {...over}
    />,
  )

  it('keeps Remove disabled until the open tasks have a destination', () => {
    const confirm = vi.fn()
    view({ onConfirm: confirm })
    const remove = screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement
    expect(remove.disabled).toBe(true)
    fireEvent.click(screen.getByRole('radio', { name: /Done on behalf of/ }))
    expect(remove.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Another person here'), { target: { value: 'u2' } })
    expect(remove.disabled).toBe(false)
    fireEvent.click(remove)
    expect(confirm).toHaveBeenCalledWith({ kind: 'person', userId: 'u2' })
  })

  it('lets the tasks wait', () => {
    const confirm = vi.fn()
    view({ onConfirm: confirm })
    fireEvent.click(screen.getByRole('radio', { name: /Leave them waiting/ }))
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(confirm).toHaveBeenCalledWith({ kind: 'wait' })
  })

  it('asks nothing when there are no open tasks, nor when leaving', () => {
    const { unmount } = view({ openTaskCount: 0 })
    expect((screen.getByRole('button', { name: 'Remove' }) as HTMLButtonElement).disabled).toBe(false)
    unmount()
    view({ mode: 'leave', person: AVERY })
    expect(screen.queryByRole('radio')).toBeNull()
    expect((screen.getByRole('button', { name: 'Leave' }) as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('ProjectOverviewView @SC-592', () => {
  const preview = (over: Partial<ProjectPreviewData> = {}): ProjectPreviewData => ({
    project: {
      id: 'p1', key: 'WEB', name: 'Website Redesign', description: 'The new marketing site', accessLevel: 'OPEN',
      startedAt: '2026-09-02T08:00:00Z', product: { id: 'x', name: 'Marketing', slug: 'marketing' }, site: { id: 's', label: 'Studio site' }, lead: AVERY, defaultAgentId: null,
    },
    isMember: false, canJoin: true, people: [AVERY, DANA],
    agents: [{ id: 'a1', name: 'Frontend dev', handle: 'fe', role: null, avatarUrl: null }],
    taskCount: 20, openTaskCount: 12, runningCount: 2, doneCount: 8, boardCount: 1, lastRunAt: '2026-10-08T11:50:00Z', ...over,
  })
  const view = (p: ProjectPreviewData, join = noop) => render(
    <ProjectOverviewView preview={p} now={NOW} renderPersonAvatar={avatar} renderAgentAvatar={avatar} joining={false} onJoin={join} />,
  )

  it('shows what the project is and how busy it is, without its work', () => {
    view(preview())
    expect(screen.getByRole('heading', { name: 'Website Redesign' })).toBeTruthy()
    expect(screen.getByText('Avery Chen and Dana Weber')).toBeTruthy()
    expect(screen.getByText('Frontend dev')).toBeTruthy()
    expect(screen.getByTestId('work-counts').textContent).toContain('12open tasks')
    expect(screen.getByText('Last run 10 min ago')).toBeTruthy()
    expect(screen.queryByRole('textbox')).toBeNull()
  })

  it('joins from the button', () => {
    const join = vi.fn()
    view(preview(), join)
    fireEvent.click(screen.getByRole('button', { name: 'Join project' }))
    expect(join).toHaveBeenCalledOnce()
  })

  it('offers no Join where the project cannot be joined', () => {
    view(preview({ canJoin: false }))
    expect(screen.queryByRole('button', { name: 'Join project' })).toBeNull()
  })
})

describe('PersonProfileCardView @SC-600', () => {
  const card = (over: Partial<PersonCardData> = {}): PersonCardData => ({
    person: DANA, orgRole: 'MEMBER', timezone: 'Europe/Berlin', viewerTimezone: 'Europe/Berlin',
    sharedProjects: [{ id: 'p1', key: 'WEB', name: 'Website Redesign' }, { id: 'p2', key: 'PRD', name: 'Product' }],
    here: { projectId: 'p1', role: 'MEMBER', tasks: counts }, isMe: false, viewerIsOrgAdmin: true, ...over,
  })
  const view = (c: PersonCardData, over: Partial<React.ComponentProps<typeof PersonProfileCardView>> = {}) =>
    render(<PersonProfileCardView card={c} avatar={<span>DA</span>} at={NOW} onClose={noop} {...over} />)

  it('shows who they are, their time, the projects you share and their place here', () => {
    view(card(), { onShowTasks: noop, onManage: noop })
    const dialog = screen.getByRole('dialog', { name: 'Dana Weber, profile' })
    expect(within(dialog).getByText('@dana · Member of the organisation')).toBeTruthy()
    expect(within(dialog).getByText('14:00 · same time as you')).toBeTruthy()
    expect(within(dialog).getByText('Website Redesign · Product')).toBeTruthy()
    expect(within(dialog).getByText('Member · to do 2 · in progress 1 · done 9')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Show their tasks' })).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Manage ›' })).toBeTruthy()
  })

  it('shows Manage only when given it, and says a person who left has left', () => {
    view(card({ person: { ...DANA, state: 'left' }, here: null }))
    expect(screen.queryByRole('button', { name: 'Manage ›' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull()
    expect(screen.getByText('Left the organisation')).toBeTruthy()
  })

  it('closes on Escape and on the scrim', () => {
    const close = vi.fn()
    view(card(), { onClose: close })
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('profile-card-scrim'))
    expect(close).toHaveBeenCalledTimes(2)
  })
})
