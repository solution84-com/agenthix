// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ query: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => h.query,
  useAction: () => vi.fn(),
  getSetupDefaults: 'getSetupDefaults',
  setModelDefaults: 'setModelDefaults',
}))
vi.mock('../../../models-settings/components/ModelRows', () => ({ ModelRows: () => <div data-testid="rows" /> }))

import { AgentsUse } from './AgentsUse'

afterEach(cleanup)
const provider = [{ id: 'p', state: 'working' }] as never

describe('What agents use @SC-1935', () => {
  it('says the read failed in place of Loading once a provider is added, with Try again', () => {
    h.query = { data: undefined, error: new Error('x'), dataUpdatedAt: 0, refetch: vi.fn() }
    render(<AgentsUse providers={provider} />)
    expect(screen.queryByText('Loading…')).toBeNull()
    expect(screen.getByText(/What agents use could not be read/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })
})
