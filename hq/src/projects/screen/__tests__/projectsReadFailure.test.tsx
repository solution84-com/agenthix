// @vitest-environment jsdom
/** The Projects page when its read fails: never "No projects yet", and a held list is never replaced. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const uiLucideReactPath = vi.hoisted(() => {
  const uiEntry = require.resolve('@agenthix/ui/projects')
  return require('node:module').createRequire(uiEntry).resolve('lucide-react')
})
vi.mock(uiLucideReactPath, async (importOriginal) => {
  const icon = () => null
  return { ...(await importOriginal<object>()), Search: icon, ChevronDown: icon, X: icon, Plus: icon, MoreHorizontal: icon }
})

const read = vi.hoisted(() => ({ projects: {} as Record<string, unknown>, refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (q: string) => (q === 'getProjects' ? read.projects : { data: q === 'getProjectCards' ? { cards: [] } : [], isLoading: false }),
  useAction: () => vi.fn(),
  createProject: 'createProject', createPersonalProject: 'createPersonalProject', getUserSettings: 'getUserSettings', getProjects: 'getProjects', getProducts: 'getProducts', getPrograms: 'getPrograms',
  getExecutionSites: 'getExecutionSites', getProjectCards: 'getProjectCards', getBillingProfileChoices: 'getBillingProfileChoices',
  getPins: 'getPins', pinItem: 'pinItem', unpinItem: 'unpinItem', reorderPins: 'reorderPins', joinProject: 'joinProject',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({
  AppLayout: ({ children, action }: { children: React.ReactNode; action: React.ReactNode }) => <div>{action}{children}</div>,
}))
vi.mock('../../../shared/components/NoExecutionSiteNotice', () => ({ NoExecutionSiteNotice: () => null, useNoExecutionSite: () => false }))

import { ProjectsPage } from '../../pages/ProjectsPage'

const open = () => render(<MemoryRouter initialEntries={['/projects']}><ProjectsPage /></MemoryRouter>)
const row = { id: 'p1', key: 'WEB', name: 'Website Redesign', description: null, productId: null, programId: null, executionSiteId: 's1', personalOwnerId: null, isMember: true, myRole: 'MEMBER', updatedAt: '2026-11-01T00:00:00.000Z' }

beforeEach(() => { read.refetch.mockClear() })
afterEach(cleanup)

describe('the Projects page when its read fails @SC-1929', () => {
  it('says the projects could not be read, with Try again, and never "No projects yet"', () => {
    read.projects = { data: undefined, isLoading: false, error: new Error('down'), dataUpdatedAt: 0, refetch: read.refetch }
    open()
    expect(screen.getByText('The projects could not be read')).toBeTruthy()
    expect(screen.queryByText('No projects yet')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(read.refetch).toHaveBeenCalled()
  })

  it('keeps the list on screen, saying nothing, when a read after a good one fails', () => {
    read.projects = { data: [row], isLoading: false, error: new Error('down'), dataUpdatedAt: Date.now(), refetch: read.refetch }
    open()
    expect(screen.getAllByText('Website Redesign').length).toBeGreaterThan(0)
    expect(screen.queryByText(/could not be read/)).toBeNull()
    expect(screen.queryByText(/Not up to date/)).toBeNull()
  })

  it('says "Not up to date" in the page, over the held list, once the last good read is over a minute old', () => {
    read.projects = { data: [row], isLoading: false, error: new Error('down'), dataUpdatedAt: Date.now() - 5 * 60_000, refetch: read.refetch }
    open()
    expect(screen.getAllByText('Website Redesign').length).toBeGreaterThan(0)
    expect(screen.getByText(/Not up to date/)).toBeTruthy()
    expect(screen.queryByText('No projects yet')).toBeNull()
  })
})
