// @vitest-environment jsdom
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

vi.mock('../../../../../../ui/node_modules/react/index.js', async () => await import('react'))
vi.mock('../../../../../../ui/node_modules/react/jsx-runtime.js', async () => await import('react/jsx-runtime'))
vi.mock('../../../../../../ui/node_modules/react/jsx-dev-runtime.js', async () => await import('react/jsx-dev-runtime'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/esm/lucide-react.mjs', async () => await import('lucide-react'))
vi.mock('../../../../../../ui/node_modules/lucide-react/dist/cjs/lucide-react.js', async () => await import('lucide-react'))

const h = vi.hoisted(() => ({ update: vi.fn(), refetch: vi.fn() }))
vi.mock('wasp/client/operations', () => ({
  useQuery: () => ({ data: { conversation: null, stt: null, tts: null, choices: [], stt_options: [], tts_options: [] }, error: null, dataUpdatedAt: Date.now(), refetch: h.refetch }),
  useAction: () => h.update,
  getSetupDefaults: 'getSetupDefaults', setModelDefaults: 'setModelDefaults',
}))
vi.mock('../../../../models-settings/components/ModelRows', () => ({
  ModelRows: ({ onChange }: { onChange: (i: unknown) => void }) => <button onClick={() => onChange({ conversation: 'm1' })}>Change</button>,
}))

import { AgentsUse } from '../AgentsUse'
const providers = [{ id: 'p', state: 'ready' }] as never

afterEach(() => { cleanup(); h.update.mockReset(); h.refetch.mockReset() })

describe('Setup: What agents use @SC-1935', () => {
  it('opens the dialog with Try again when a choice fails to save', async () => {
    h.update.mockRejectedValueOnce(new Error('No connection'))
    render(<AgentsUse providers={providers} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(screen.getByText('The default was not changed')).toBeTruthy())
    expect(screen.getByText('No connection')).toBeTruthy()
    h.update.mockResolvedValueOnce({})
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(h.update).toHaveBeenCalledTimes(2))
  })

  it('says nothing when a choice saves', async () => {
    h.update.mockResolvedValueOnce({})
    render(<AgentsUse providers={providers} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    await waitFor(() => expect(h.refetch).toHaveBeenCalled())
    expect(screen.queryByText('The default was not changed')).toBeNull()
  })
})
