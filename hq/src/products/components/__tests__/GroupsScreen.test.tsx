// @vitest-environment jsdom
/** Products and Programs (every screen reviewed spec §3): the list beside the one opened, its projects as cards, File a project for admins. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const ops = vi.hoisted(() => ({ role: 'ADMIN' as string | undefined }))
const PRODUCTS = [
  { id: 'pr1', name: 'Storefront', slug: 'storefront', description: 'The shop customers buy from', status: 'active', _count: { projects: 2 } },
  { id: 'pr2', name: 'Merchant app', slug: 'merchant-app', description: null, status: 'active', _count: { projects: 0 } },
]
const PROGRAMS = [{ id: 'pg1', name: 'Launch in Japan', slug: 'launch-in-japan', description: 'Open the shop in Japan by year end', status: 'active', _count: { projects: 1 } }]
const PROJECTS = [
  { id: 'p1', key: 'WEB', name: 'Website Redesign', description: 'New branding', productId: 'pr1', programId: null, personalOwnerId: null, isMember: true, boards: [{ id: 'b' }], tasks: [{ status: 'DONE' }, { status: 'TODO' }] },
  { id: 'p2', key: 'CHK', name: 'Checkout v2', description: null, productId: 'pr1', programId: 'pg1', personalOwnerId: null, isMember: true, boards: [], tasks: [] },
  { id: 'p3', key: 'DOC', name: 'Docs site', description: null, productId: null, programId: null, personalOwnerId: null, isMember: true },
]
vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string) => ({
    data: query === 'getProducts' ? PRODUCTS : query === 'getPrograms' ? PROGRAMS : query === 'getProjects' ? PROJECTS
      : query === 'getProjectCards' ? { cards: [] } : query === 'getUserSettings' ? (ops.role ? { role: ops.role } : undefined) : undefined,
    isLoading: false,
  }),
  useAction: () => vi.fn(),
  getProducts: 'getProducts', getPrograms: 'getPrograms', getProjects: 'getProjects', getProjectCards: 'getProjectCards', getUserSettings: 'getUserSettings',
  deleteProduct: 'dp', deleteProgram: 'dg', createProduct: 'cp', updateProduct: 'up', createProgram: 'cg', updateProgram: 'ug', updateProject: 'upj',
}))
vi.mock('../../../shared/layouts/AppLayout', () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }))
vi.mock('@agenthix/ui/projects', () => ({
  ProjectCard: ({ project, to }: { project: { name: string }; to: string }) => <a href={to} data-testid="project-card">{project.name}</a>,
}))

import { GroupsScreen } from '../GroupsScreen'

const show = (kind: 'product' | 'program', slug?: string) => render(<MemoryRouter><GroupsScreen kind={kind} slug={slug} /></MemoryRouter>)
beforeEach(() => { ops.role = 'ADMIN' })
afterEach(cleanup)

describe('Products @SC-677', () => {
  it('lists the products with their project counts and opens one beside the list with only its projects', () => {
    show('product', 'storefront')
    expect(screen.getByText('Merchant app')).toBeTruthy()
    expect(screen.getByText('2 projects')).toBeTruthy()
    expect(screen.getByText('0 projects')).toBeTruthy()
    const cards = screen.getAllByTestId('project-card').map(c => c.textContent)
    expect(cards).toEqual(['Website Redesign', 'Checkout v2'])
    expect(screen.getByRole('heading', { name: 'Storefront' })).toBeTruthy()
    expect(screen.getByText(/a product only groups projects; it owns nothing/)).toBeTruthy()
  })

  it('offers an admin New and File a project, and a member neither', () => {
    show('product', 'storefront')
    expect(screen.getByRole('button', { name: 'File a project' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /New/ })).toBeTruthy()
    cleanup()
    ops.role = 'MEMBER'
    show('product', 'storefront')
    expect(screen.queryByRole('button', { name: 'File a project' })).toBeNull()
    expect(screen.queryByRole('button', { name: /New/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('shows only the list when none is opened', () => {
    show('product')
    expect(screen.getByText('Choose a product to see the projects filed under it.')).toBeTruthy()
    expect(screen.queryAllByTestId('project-card')).toHaveLength(0)
  })
})

describe('Programs @SC-677', () => {
  it('shows a programme’s goal and the projects filed under it', () => {
    show('program', 'launch-in-japan')
    expect(screen.getByText('Goal: Open the shop in Japan by year end')).toBeTruthy()
    expect(screen.getAllByTestId('project-card').map(c => c.textContent)).toEqual(['Checkout v2'])
    expect(within(screen.getByRole('heading', { name: 'Launch in Japan' }).parentElement!).getByText('active')).toBeTruthy()
  })
})
