// @vitest-environment jsdom
/** The pages for a workspace that cannot be opened or shown: held back while the frame line says HQ is not answering. */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { ReadNudgesHeld } from '@agenthix/ui/attention'

vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: undefined, error: new Error('HQ did not answer.'), refetch: vi.fn() }),
  getWorkspaceRefusal: 'getWorkspaceRefusal',
}))

import { CantOpenWorkspace, CantReadBranches } from '../components/CantOpen'

const show = (held: boolean, node: React.ReactNode) => render(<MemoryRouter><ReadNudgesHeld.Provider value={held}>{node}</ReadNudgesHeld.Provider></MemoryRouter>)
const branches = <CantReadBranches message="HQ did not answer." back={{ href: '/', label: 'Home' }} onRetry={vi.fn()} />

afterEach(cleanup)

describe('CantOpen pages for a failed read @SC-1930', () => {
  it("say it with Try again when nothing else has", () => {
    show(false, <CantOpenWorkspace workspaceId="w1" />)
    expect(screen.getByRole('heading').textContent).toBe("This workspace can't be opened right now")
    cleanup()
    show(false, branches)
    expect(screen.getByRole('heading').textContent).toBe("This workspace can't be shown right now")
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('stay with the opening page while the frame line says HQ is not answering', () => {
    show(true, <CantOpenWorkspace workspaceId="w1" />)
    expect(screen.getByRole('heading').textContent).toBe('Opening the workspace…')
    cleanup()
    show(true, branches)
    expect(screen.getByRole('heading').textContent).toBe('Opening the workspace…')
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
