// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const h = vi.hoisted(() => ({ revoke: vi.fn() }))
vi.mock('wasp/client/operations', () => ({ revokeConnection: h.revoke, renewConnection: vi.fn() }))

import { ConnectionList } from '../ConnectionList'

const connection = {
  id: 'c1', name: 'office-laptop', tokenPrefix: 'agx_ab', groups: [], projects: null, lastUsedAt: null,
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(), revokedAt: null,
} as unknown as Parameters<typeof ConnectionList>[0]['connections'][number]

afterEach(() => { cleanup(); h.revoke.mockReset() })

describe('revoking a connection @SC-1935', () => {
  it('asks in the confirm dialog, never the browser\'s, and revokes only on the named button', async () => {
    const browserConfirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    h.revoke.mockResolvedValue({})
    render(<ConnectionList connections={[connection]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    expect(h.revoke).not.toHaveBeenCalled()
    expect(screen.getByText(/stops working at once/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Revoke office-laptop' }))
    await waitFor(() => expect(h.revoke).toHaveBeenCalledWith({ id: 'c1' }))
    expect(browserConfirm).not.toHaveBeenCalled()
    browserConfirm.mockRestore()
  })

  it('does nothing when cancelled', () => {
    render(<ConnectionList connections={[connection]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(h.revoke).not.toHaveBeenCalled()
  })
})
