// @vitest-environment jsdom
/** Find a project does not say "No project matches." for projects that could not be read. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'

const reads = vi.hoisted(() => ({ projects: {} as { data?: unknown; error?: Error | null } }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (name: string) => name === 'getProjects'
    ? { data: reads.projects.data, error: reads.projects.error ?? null, refetch: vi.fn() }
    : { data: [], error: null, refetch: vi.fn() },
  getProjects: 'getProjects', getPins: 'getPins',
}))

import { FindProjectList } from '../FindProject'

const show = () => render(<MemoryRouter><FindProjectList nav={{ kind: 'home', current: 'home' } as never} onChoose={vi.fn()} /></MemoryRouter>)

afterEach(cleanup)

describe('FindProjectList @SC-1929', () => {
  it('says the projects could not be read, with Try again, not that none matches', () => {
    reads.projects = { error: new Error('x') }
    show()
    expect(screen.queryByText('No project matches.')).toBeNull()
    expect(screen.getByText('Your projects could not be read.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('says Loading… while the projects are not there yet', () => {
    reads.projects = {}
    show()
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect(screen.queryByText('No project matches.')).toBeNull()
  })

  it('says No project matches. once the projects are read and none do', () => {
    reads.projects = { data: [] }
    show()
    expect(screen.getByText('No project matches.')).toBeTruthy()
  })
})
