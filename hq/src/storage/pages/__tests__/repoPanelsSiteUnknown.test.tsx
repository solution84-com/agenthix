// @vitest-environment jsdom
/**
 * What the two repository panels do when the location's state cannot be read.
 *
 * Both read `getRepoState`, which now crosses to the Execution Site that holds
 * the location — so a site that is down, or that refuses, makes the query FAIL
 * rather than answer. Neither panel destructured `error`, and the two failures
 * that produced were different and both silent:
 *
 *  - `OperationsPanel` read the absent data as "no repo connected" and returned
 *    `null`. The whole panel vanished, with no reason given anywhere.
 *  - `RepoPanel` rendered its unconnected state — an empty location, with Back
 *    up and Link ENABLED. A person whose site was merely down was invited to
 *    create a repository for a location that may already have one.
 *
 * The second is the one that can do damage, so the assertions here are about
 * what is offered, not only about what is said.
 */
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const useQuery = vi.hoisted(() => vi.fn())
vi.mock('wasp/client/operations', () => ({
  useQuery,
  useAction: vi.fn(() => vi.fn()),
  getRepoState: 'getRepoState',
  getGithubAppStatus: 'getGithubAppStatus',
  connectRepo: 'connectRepo',
  disconnectRepo: 'disconnectRepo',
  getWorkflows: 'getWorkflows',
  getRuns: 'getRuns',
  getRepoSecrets: 'getRepoSecrets',
  getPlaceWorkflows: 'getPlaceWorkflows',
}))

vi.mock('../../../github/connect/ConnectRepoFlow', () => ({ ConnectRepoFlow: () => <button type="button">Create and connect</button> }))

import { RepoPanel } from '../RepoPanel'
import { OperationsPanel } from '../OperationsPanel'

const target = { ownerType: 'project', ownerId: 'p1' } as never
const SITE_DOWN = 'Execution Site "Local site" is unreachable'

/** Every query but `getRepoState` answers normally; that one is the variable. */
function answerWith(repoState: { data?: unknown; error?: unknown; isLoading?: boolean }) {
  useQuery.mockImplementation((operation: string) => {
    if (operation === 'getRepoState') {
      return { data: repoState.data, error: repoState.error ?? null, isLoading: repoState.isLoading ?? false }
    }
    if (operation === 'getGithubAppStatus') {
      return { data: { registered: true, canCreateRepos: true }, error: null, isLoading: false }
    }
    return { data: [], error: null, isLoading: false }
  })
}

const enabledButtons = () => screen.queryAllByRole('button').filter(b => !(b as HTMLButtonElement).disabled)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('RepoPanel when the state cannot be read @SC-1321', () => {
  beforeEach(() => answerWith({ error: new Error(SITE_DOWN) }))

  it('says so, and says why it matters', () => {
    render(<RepoPanel target={target} />)
    expect(screen.getByText(/repository state could not be read/i)).toBeDefined()
    expect(screen.getByText(new RegExp(SITE_DOWN.replace(/"/g, '.')))).toBeDefined()
  })

  it('offers nothing to click — connecting is not available while the truth is unknown', () => {
    render(<RepoPanel target={target} />)
    expect(enabledButtons()).toHaveLength(0)
    expect(screen.queryByText(/Back up to GitHub/i)).toBeNull()
    expect(screen.queryByText(/Link existing repo/i)).toBeNull()
  })
})

describe('RepoPanel while the state is still loading', () => {
  /**
   * Loading is not an empty location either. The panel may show its shape, but
   * nothing that would connect a repository may be actionable yet.
   */
  it('disables every action until the state has arrived', () => {
    answerWith({ isLoading: true })
    render(<RepoPanel target={target} />)
    expect(screen.getByText(/Reading this location's repository state/i)).toBeDefined()
    expect(enabledButtons()).toHaveLength(0)
  })

  it('enables them once it has', () => {
    answerWith({ data: { repoUrl: null, isGitRepo: false, hasFiles: false } })
    render(<RepoPanel target={target} />)
    expect(enabledButtons().length).toBeGreaterThan(0)
  })
})

describe('RepoPanel for someone who may not administer the project', () => {
  it('shows the repository without Disconnect, and no connect flow where none is connected', () => {
    answerWith({ data: { repoUrl: 'https://github.com/acme/docs', isGitRepo: true, hasFiles: true, mayAdminister: false } })
    const { unmount } = render(<RepoPanel target={target} />)
    expect(screen.getByText('https://github.com/acme/docs')).toBeDefined()
    expect(screen.queryByRole('button', { name: /Disconnect/ })).toBeNull()
    unmount()
    answerWith({ data: { repoUrl: null, isGitRepo: false, hasFiles: false, mayAdminister: false } })
    render(<RepoPanel target={target} />)
    expect(screen.getByText(/Only a project administrator can connect a repository/)).toBeDefined()
    expect(enabledButtons()).toHaveLength(0)
  })
})

describe('OperationsPanel when the state cannot be read @SC-1321', () => {
  it('renders the reason rather than disappearing', () => {
    answerWith({ error: new Error(SITE_DOWN) })
    const { container } = render(<OperationsPanel target={target} />)
    expect(container.textContent).toContain('GitHub details are unavailable')
    expect(container.textContent).toContain('unreachable')
  })

  it('still renders nothing when the site answered and there is simply no repository', () => {
    answerWith({ data: { repoUrl: null, isGitRepo: false, hasFiles: false } })
    const { container } = render(<OperationsPanel target={target} />)
    expect(container.textContent).toBe('')
  })
})
