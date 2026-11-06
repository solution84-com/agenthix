// @vitest-environment jsdom
/** Agenthix's shelf (board U4): what is offered, what the organisation already has of it, and Suited to as a hint. */
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

vi.mock('wasp/client/operations', () => ({ getPackageFiles: { name: 'g' }, useQuery: () => ({ data: { files: [{ path: 'SKILL.md', size: 4, text: '# Hi' }], more: 0 } }) }))
vi.mock('../../../sources/imageShelf', () => ({
  listShelf: async () => [
    { name: 'dev-code-review', identity: 'agenthix/dev-code-review', title: 'Code Review', description: 'Review pull requests', version: '1.4.0', suitedTo: ['developers'] },
    { name: 'qa-bug-reporting', identity: 'agenthix/qa-bug-reporting', title: 'Bug Reporting', description: 'File bug reports', version: '1.0.0', suitedTo: ['qa'] },
    { name: 'pm-sprint-planning', identity: 'agenthix/pm-sprint-planning', title: 'Sprint Planning', description: 'Plan sprints', version: '1.3.0', suitedTo: ['product'] },
  ],
}))

import { shelfView } from '../shelf'
import { ShelfList } from '../ShelfList'
import type { PersonActor } from '../../../policy'

const admin: PersonActor = { kind: 'person', userId: 'u1', role: 'ADMIN', libraryMaintainer: false, projectRole: null }
const member: PersonActor = { ...admin, role: 'MEMBER' }
const maintainer: PersonActor = { ...member, libraryMaintainer: true }

const db = (outsideInstallers = 'ADMINS') => ({
  org: { findFirst: async () => ({ outsideInstallers }) },
  asset: {
    findMany: async (q: { where: { removedAt?: unknown } }) => q.where.removedAt ? [{ id: 't1', kind: 'AGENT', name: 'project-manager' }] : [
      { id: 'a1', name: 'dev-code-review', currentVersion: { version: '1.3.0' } },
      { id: 'a2', name: 'pm-sprint-planning', currentVersion: { version: '1.3.0' } },
    ],
  },
}) as never

afterEach(cleanup)

describe('the shelf @SC-1609', () => {
  it("marks what the organisation has, and a newer version on the shelf as one it doesn't", async () => {
    const view = await shelfView(db(), admin)
    expect(view.items.map(i => [i.name, i.have])).toEqual([
      ['dev-code-review', { assetId: 'a1', version: '1.3.0', newer: true }],
      ['qa-bug-reporting', null],
      ['pm-sprint-planning', { assetId: 'a2', version: '1.3.0', newer: false }],
    ])
    expect(view.suitedTo).toEqual(['developers', 'product', 'qa'])
    expect(view.can).toEqual({ shelf: true, outside: true })
  })

  it('shows a Library maintainer the shelf but not upload or a link, unless the organisation lets them; a member nothing', async () => {
    expect((await shelfView(db(), maintainer)).can).toEqual({ shelf: true, outside: false })
    expect((await shelfView(db('ADMINS_AND_MAINTAINERS'), maintainer)).can).toEqual({ shelf: true, outside: true })
    expect(await shelfView(db(), member)).toEqual({ items: [], removed: [], suitedTo: [], can: { shelf: false, outside: false } })
  })

  it("lists Agenthix's removed templates for administrators only, who put them back", async () => {
    expect((await shelfView(db(), admin)).removed).toEqual([{ assetId: 't1', identity: 'agenthix/project-manager', title: 'Project manager', kind: 'agent' }])
    expect((await shelfView(db(), maintainer)).removed).toEqual([])
  })
})

describe('the shelf list @SC-1609', () => {
  it('offers Add for what is new, "You have 1.3.0" with the newer version for an update, and Open for what is installed', async () => {
    const view = await shelfView(db(), admin)
    const onInstall = vi.fn()
    render(<MemoryRouter><ShelfList items={view.items} suitedTo={view.suitedTo} onInstall={onInstall} /></MemoryRouter>)
    const [code, bug, sprint] = screen.getAllByTestId('shelf-item')
    expect(within(code!).getByText('You have 1.3.0')).toBeTruthy()
    fireEvent.click(within(code!).getByRole('button', { name: 'Get 1.4.0' }))
    expect(onInstall).toHaveBeenCalledWith(expect.objectContaining({ name: 'dev-code-review' }))
    expect(within(bug!).getByRole('button', { name: 'Add' })).toBeTruthy()
    expect(within(sprint!).getByRole('link', { name: 'Open' }).getAttribute('href')).toBe('/library/a2')
    expect(screen.queryByText(/Nothing here reaches an agent/)).toBeNull()
  })

  it('narrows by Suited to, a hint and never a lock, and opens View to read the skill', async () => {
    const view = await shelfView(db(), admin)
    render(<MemoryRouter><ShelfList items={view.items} suitedTo={view.suitedTo} onInstall={() => {}} /></MemoryRouter>)
    fireEvent.change(screen.getByLabelText('Suited to'), { target: { value: 'qa' } })
    expect(screen.getAllByTestId('shelf-item')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    expect(screen.getByTestId('read-package').textContent).toContain('# Hi')
  })
})
