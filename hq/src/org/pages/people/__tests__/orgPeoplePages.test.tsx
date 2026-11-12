// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router'

// Where ui has its own copy of lucide-react, the icons ui renders here are stubbed by that path, so no second React
// renders. Where ui shares hq's copy, as on CI and in the image, the path is hq's, and every other icon stays real.
const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/primitives')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, Loader2: icon, Plus: icon, Check: icon, X: icon }
})

const data: Record<string, unknown> = {}
const actions: Record<string, ReturnType<typeof vi.fn>> = {}
const action = (name: string) => (actions[name] ??= vi.fn().mockResolvedValue({ ok: true }))

vi.mock('wasp/client/operations', () => {
  const op = (name: string) => ({ name })
  return {
    getDemoInfo: 'getDemoInfo',
    getUserSettings: op('getUserSettings'), getOrgPeople: op('getOrgPeople'), getOrgPerson: op('getOrgPerson'),
    getProjectMembers: op('getProjectMembers'), getProjects: op('getProjects'),
    updateUserRole: op('updateUserRole'), revokeInvite: op('revokeInvite'), removePerson: op('removePerson'),
    erasePerson: op('erasePerson'), getErasedProjectCount: op('getErasedProjectCount'), reactivatePerson: op('reactivatePerson'), createInvite: op('createInvite'), createPasswordResetLink: op('createPasswordResetLink'),
    addProjectMember: op('addProjectMember'), setProjectMemberRole: op('setProjectMemberRole'),
    setPersonName: op('setPersonName'), uploadPersonPicture: op('uploadPersonPicture'), removePersonPicture: op('removePersonPicture'), savePictures: op('savePictures'),
    useQuery: (o: { name: string }) => ({ data: data[o.name], isLoading: data[o.name] === undefined, error: undefined }),
    useAction: (o: { name: string }) => action(o.name),
  }
})
vi.mock('../../../../shared/layouts/AppLayout', () => ({
  AppLayout: (p: { children: React.ReactNode; title?: string; action?: React.ReactNode }) => <div><h1>{p.title}</h1>{p.action}{p.children}</div>,
}))
vi.mock('../../../../shared/hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))

import { OrgPeoplePage } from '../OrgPeoplePage'
import { RemovePersonPage } from '../RemovePersonPage'
import { OrgPersonPage } from '../OrgPersonPage'
import { ErasePersonDialog } from '../ErasePersonDialog'

const person = (userId: string, name: string, handle: string | null, state: 'active' | 'left' | 'erased' = 'active') =>
  ({ userId, name, handle, avatarUrl: null, state })
const dana = person('u1', 'Dana Whitfield', 'dana')
const row = (p: ReturnType<typeof person>, extra = {}) =>
  ({ person: p, orgRole: 'MEMBER', projectCount: 2, joinedAt: new Date('2026-01-05'), leftAt: null, isMe: false, ...extra })

beforeEach(() => {
  for (const k of Object.keys(data)) delete data[k]
  for (const k of Object.keys(actions)) delete actions[k]
  data.getUserSettings = { role: 'ADMIN' }
})

const at = (path: string, el: React.ReactElement, route: string) =>
  render(<MemoryRouter initialEntries={[path]}><Routes><Route path={route} element={el} /></Routes></MemoryRouter>)

describe('Organisation › People @SC-603 @SC-1935', () => {
  beforeEach(() => {
    data.getOrgPeople = {
      people: [
        row(person('me', 'Avery Chen', 'avery'), { orgRole: 'ADMIN', isMe: true }),
        row(dana),
        row(person('u2', 'Sam Ray', 'sam', 'left'), { orgRole: null, leftAt: new Date('2026-09-01') }),
      ],
      invitations: {
        waiting: [{
          id: 'i1', forWhom: 'Alex from design', role: 'ADMIN', invitedBy: person('me', 'Avery Chen', 'avery'),
          createdAt: new Date(), expiresAt: new Date(Date.now() + 3 * 86_400_000), state: 'waiting', usedBy: null, usedAt: null,
          projects: [{ id: 'p1', key: 'WEB', name: 'Website' }], hiddenProjectCount: 0,
        }],
        earlier: [],
      },
    }
  })

  it('lists waiting invitations first, with Revoke but no link to copy once it is no longer on screen', () => {
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    expect(screen.getByText('Alex from design')).toBeTruthy()
    expect(screen.getByText('Invited by Avery Chen · Expires in 3 days')).toBeTruthy()
    const waiting = within(screen.getByRole('region', { name: 'Invited, waiting' }))
    expect(waiting.getByText('Admin')).toBeTruthy()
    expect(waiting.getByText('Website')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Copy link' })).toBeNull()
    expect(screen.getByText(/link is shown once/)).toBeTruthy()
  })

  it('offers the organisation roles Admin and Member for others, never for yourself (adr-0102)', () => {
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    const select = screen.getByLabelText('Organisation role of Dana Whitfield') as HTMLSelectElement
    expect(select.value).toBe('MEMBER')
    expect(Array.from(select.options).map(o => o.text)).toEqual(['Admin', 'Member'])
    expect(screen.queryByLabelText('Organisation role of Avery Chen')).toBeNull()
    fireEvent.change(select, { target: { value: 'ADMIN' } })
    expect(actions.updateUserRole).toHaveBeenCalledWith({ userId: 'u1', role: 'ADMIN' })
  })

  it('says a failed role change in the attention dialog with Try again, never in the browser\'s own alert', async () => {
    const browserAlert = vi.spyOn(window, 'alert').mockImplementation(() => undefined)
    action('updateUserRole').mockRejectedValueOnce(new Error('Could not reach HQ'))
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    fireEvent.change(screen.getByLabelText('Organisation role of Dana Whitfield'), { target: { value: 'ADMIN' } })
    expect(await screen.findByText('Could not reach HQ')).toBeTruthy()
    expect(browserAlert).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(actions.updateUserRole).toHaveBeenCalledTimes(2))
    browserAlert.mockRestore()
  })

  it('opens a person from anywhere on the row, while the role select stays its own target', () => {
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    const link = screen.getByRole('link', { name: 'Dana Whitfield' })
    expect(link.className).toContain('after:inset-0')
    const select = screen.getByLabelText('Organisation role of Dana Whitfield')
    expect(select.closest('div')!.className).toContain('z-10')
    expect(link.closest('li')!.contains(select)).toBe(true)
    expect(within(link.closest('li')!).getByText('2 projects')).toBeTruthy()
  })

  it('invites with the organisation role as two choices and the projects as chips', () => {
    data.getProjects = [{ id: 'p1', key: 'WEB', name: 'Website', personalOwnerId: null }]
    window.history.pushState({}, '', '/admin/people?invite=1')
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    window.history.pushState({}, '', '/')
    const roles = screen.getByRole('radiogroup', { name: 'Organisation role' })
    expect(within(roles).getAllByRole('radio').map(r => r.textContent)).toEqual([
      'AdminRuns the organisation: its people, agents, projects and settings', 'MemberWorks in their projects, as their role in each allows',
    ])
    expect(within(roles).getByRole('radio', { name: /^Member/ }).getAttribute('aria-checked')).toBe('true')
    fireEvent.change(screen.getByLabelText('Add a project'), { target: { value: 'p1' } })
    expect(screen.getByRole('button', { name: 'Remove Website' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Create link' })).toBeTruthy()
  })

  it('puts people who left at the foot, and searches by name or handle', () => {
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    const left = screen.getByRole('region', { name: 'Left' })
    expect(within(left).getByText('Sam Ray')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search people'), { target: { value: '@dan' } })
    expect(screen.getByText('Dana Whitfield')).toBeTruthy()
    expect(screen.queryByText('Sam Ray')).toBeNull()
  })

  it('shows nothing of it to someone who is not an admin', () => {
    data.getUserSettings = { role: 'MEMBER' }
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    expect(screen.getByText('Admins only')).toBeTruthy()
    expect(screen.queryByText('Dana Whitfield')).toBeNull()
  })
})

describe('One person @SC-603', () => {
  it('shows the organisation role as two choices, the profile, and the projects with their roles, Viewer among them', () => {
    data.getProjects = []
    data.getOrgPerson = {
      ...row(dana), timezone: null, privateProjectCount: 1, leftBy: null,
      projects: [{ id: 'p1', key: 'WEB', name: 'Website', accessLevel: 'OPEN', role: 'MEMBER', openTaskCount: 3 }],
    }
    at('/admin/people/u1', <OrgPersonPage />, '/admin/people/:userId')
    expect(screen.getByRole('heading', { name: 'Dana Whitfield' })).toBeTruthy()
    const roles = screen.getByRole('radiogroup', { name: 'Organisation role of Dana Whitfield' })
    expect(within(roles).getAllByRole('radio')).toHaveLength(2)
    fireEvent.click(within(roles).getByRole('radio', { name: /^Admin/ }))
    expect(actions.updateUserRole).toHaveBeenCalledWith({ userId: 'u1', role: 'ADMIN' })
    expect(screen.getByRole('region', { name: 'Profile' })).toBeTruthy()
    const projectRole = screen.getByLabelText('Role of Dana Whitfield in Website') as HTMLSelectElement
    expect(projectRole.value).toBe('MEMBER')
    expect(Array.from(projectRole.options).map(o => o.text)).toEqual(['Member', 'Viewer', 'Admin'])
    expect(screen.getByText("On Dana's behalf: 3 open")).toBeTruthy()
    expect(screen.getByText(/and 1 private project you are not in/)).toBeTruthy()
  })
})

describe('The fleet admin role, shown and never changed here @SC-603', () => {
  const sam = person('me', 'Sam Rivera', 'sam')

  it('marks who holds it in the People list, and says where it is given', () => {
    data.getOrgPeople = {
      people: [row(sam, { orgRole: 'ADMIN', isMe: true, fleetAdmin: true, fleetAdminSince: new Date(2026, 9, 12) }), row(dana, { fleetAdmin: false })],
      invitations: { waiting: [], earlier: [] },
    }
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    expect(within(screen.getByText('Sam Rivera').closest('li')!).getByText('Fleet admin')).toBeTruthy()
    expect(within(screen.getByText('Dana Whitfield').closest('li')!).queryByText('Fleet admin')).toBeNull()
    expect(screen.getByText(/Fleet admin is given in the Fleet Console, not here\./)).toBeTruthy()
  })

  it('on a person\'s page, a holder reads Held since a date, with no control', () => {
    data.getProjects = []
    data.getOrgPerson = { ...row(sam, { orgRole: 'ADMIN', fleetAdmin: true, fleetAdminSince: new Date(2026, 9, 12) }), timezone: null, privateProjectCount: 0, leftBy: null, projects: [] }
    at('/admin/people/me', <OrgPersonPage />, '/admin/people/:userId')
    const section = within(screen.getByRole('region', { name: 'Fleet admin' }))
    expect(section.getByText('Held')).toBeTruthy()
    expect(section.getByText('Given in the Fleet Console. Held since 12 Oct.')).toBeTruthy()
    expect(section.queryByRole('button')).toBeNull()
    expect(section.queryByRole('radio')).toBeNull()
  })

  it('on a person\'s page, someone without it reads Not held, and who to ask', () => {
    data.getProjects = []
    data.getOrgPerson = { ...row(dana, { fleetAdmin: false }), timezone: null, privateProjectCount: 0, leftBy: null, projects: [] }
    at('/admin/people/u1', <OrgPersonPage />, '/admin/people/:userId')
    const section = within(screen.getByRole('region', { name: 'Fleet admin' }))
    expect(section.getByText('Not held')).toBeTruthy()
    expect(section.getByText('Given in the Fleet Console. Ask a fleet admin to give it.')).toBeTruthy()
    expect(section.queryByRole('link')).toBeNull()
  })
})

describe('Reset password and where a person came in from @SC-605 @SC-716', () => {
  const view = (extra = {}) => ({
    ...row(dana), timezone: null, privateProjectCount: 0, leftBy: null, invitedBy: null, invitedFromHqMachine: false, projects: [], ...extra,
  })

  it("says an admin invited from HQ's machine came in that way", () => {
    data.getProjects = []
    data.getOrgPerson = view({ invitedFromHqMachine: true })
    at('/admin/people/u1', <OrgPersonPage />, '/admin/people/:userId')
    expect(screen.getByText(/invited from HQ's machine/)).toBeTruthy()
  })

  it('makes a one-time link only when asked, and shows it with a warning when the address works only here', async () => {
    data.getProjects = []
    data.getOrgPerson = view()
    action('createPasswordResetLink').mockResolvedValue({ link: 'http://localhost:4100/reset-password/abc', expiresAt: new Date(), addressWorksOnlyHere: true })
    at('/admin/people/u1', <OrgPersonPage />, '/admin/people/:userId')
    fireEvent.click(screen.getByRole('button', { name: 'More' }))
    fireEvent.click(screen.getByRole('menuitem', { name: 'Reset password' }))
    expect(actions.createPasswordResetLink).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Make link' }))
    await waitFor(() => expect(actions.createPasswordResetLink).toHaveBeenCalledWith({ userId: 'u1' }))
    expect(await screen.findByText('http://localhost:4100/reset-password/abc')).toBeTruthy()
    expect(screen.getByText(/works only on this computer/)).toBeTruthy()
  })

  it('offers no reset for yourself', () => {
    data.getProjects = []
    data.getOrgPerson = view({ isMe: true })
    at('/admin/people/u1', <OrgPersonPage />, '/admin/people/:userId')
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('copies the link HQ made, not one built from the browser address', async () => {
    data.getProjects = [{ id: 'p1', key: 'WEB', name: 'Website', personalOwnerId: null }]
    data.getOrgPeople = { people: [row(dana)], invitations: { waiting: [], earlier: [] } }
    action('createInvite').mockResolvedValue({ id: 'i9', token: 't', link: 'https://hq.acme.example/invite/t', addressWorksOnlyHere: false })
    window.history.pushState({}, '', '/admin/people?invite=1')
    at('/admin/people', <OrgPeoplePage />, '/admin/people')
    window.history.pushState({}, '', '/')
    fireEvent.click(screen.getByRole('button', { name: 'Create link' }))
    expect(await screen.findByText('https://hq.acme.example/invite/t')).toBeTruthy()
    expect(screen.queryByText(/works only on this computer/)).toBeNull()
  })
})

describe('Remove from the organisation @SC-610', () => {
  beforeEach(() => {
    data.getOrgPerson = {
      ...row(dana), timezone: null, privateProjectCount: 1,
      projects: [
        { id: 'p1', key: 'WEB', name: 'Website', accessLevel: 'OPEN', role: 'MEMBER', openTaskCount: 2 },
        { id: 'p2', key: 'API', name: 'Api', accessLevel: 'OPEN', role: 'MEMBER', openTaskCount: 0 },
      ],
    }
    data.getProjectMembers = [
      { userId: 'u1', role: 'MEMBER', username: 'Dana Whitfield', person: dana, joinedAt: new Date() },
      { userId: 'u3', role: 'ADMIN', username: 'Kim Ito', person: person('u3', 'Kim Ito', 'kim'), joinedAt: new Date() },
    ]
  })

  it('says what happens, and waits for a choice in every project with open tasks', async () => {
    at('/admin/people/u1/remove', <RemovePersonPage />, '/admin/people/:userId/remove')
    expect(screen.getByText(/Sign-in ends, on every device/)).toBeTruthy()
    expect(screen.getByText(/private conversations and personal files stay private/)).toBeTruthy()
    expect(screen.getByText(/1 private project you are not in/)).toBeTruthy()
    const remove = screen.getByRole('button', { name: 'Remove Dana Whitfield' }) as HTMLButtonElement
    expect(remove.getAttribute('aria-disabled')).toBe('true')

    const choice = screen.getByLabelText('Open tasks in Website') as HTMLSelectElement
    expect((choice.value)).toBe('')
    expect(Array.from(choice.options).map(o => o.text)).toEqual(['Choose…', 'Done on behalf of Kim Ito', 'Leave them waiting'])
    fireEvent.change(choice, { target: { value: 'u3' } })
    // The refused button is wrapped in its tooltip; once the choices are made it is the plain button.
    const ready = screen.getByRole('button', { name: 'Remove Dana Whitfield' })
    expect(ready.getAttribute('aria-disabled')).toBeNull()
    fireEvent.click(ready)
    await waitFor(() => expect(actions.removePerson).toHaveBeenCalledWith({
      userId: 'u1', openTasks: [{ projectId: 'p1', destination: { kind: 'person', userId: 'u3' } }],
    }))
  })
})

describe('Erase their data @SC-610', () => {
  it('needs their name typed, and says what goes and what stays', async () => {
    const onClose = vi.fn()
    render(<ErasePersonDialog person={dana} open onClose={onClose} />)
    expect(screen.getByText(/Former member/)).toBeTruthy()
    expect(screen.getByText('This cannot be undone.')).toBeTruthy()
    const erase = screen.getByRole('button', { name: 'Erase their data' }) as HTMLButtonElement
    expect(erase.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText(/Type Dana Whitfield to confirm/), { target: { value: 'dana whitfield' } })
    expect(erase.disabled).toBe(false)
    fireEvent.click(erase)
    await waitFor(() => expect(actions.erasePerson).toHaveBeenCalledWith({ userId: 'u1', confirm: 'dana whitfield' }))
  })

  it('says how many other personal projects it deletes', () => {
    data.getErasedProjectCount = { count: 3 }
    render(<ErasePersonDialog person={dana} open onClose={vi.fn()} />)
    expect(screen.getByText(/3 other personal projects they made, with their conversations, tasks and files/)).toBeTruthy()
    delete data.getErasedProjectCount
  })

  it('adds no line when they made none', () => {
    data.getErasedProjectCount = { count: 0 }
    render(<ErasePersonDialog person={dana} open onClose={vi.fn()} />)
    expect(screen.queryByText(/other personal project/)).toBeNull()
    delete data.getErasedProjectCount
  })
})
