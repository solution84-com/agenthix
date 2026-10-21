// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router'

const h = vi.hoisted(() => ({
  auth: { data: null as null | { id: string }, isLoading: false },
  openPreview: vi.fn(),
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => h.auth }))
vi.mock('wasp/client/operations', () => ({ openPreview: h.openPreview }))

import { OpenPreviewPage } from '../OpenPreviewPage'
import { takeReturnPath } from '../../shared/returnAfterSignIn'

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/open-preview/:previewId" element={<OpenPreviewPage />} />
        <Route path="/login" element={<span>sign in</span>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.sessionStorage.clear()
  h.openPreview.mockReset()
  h.auth = { data: null, isLoading: false }
})

describe('OpenPreviewPage', () => {
  it('sends an unsigned person to sign in, remembering its own path', async () => {
    renderAt('/open-preview/abc')
    await screen.findByText('sign in')
    expect(h.openPreview).not.toHaveBeenCalled()
    expect(takeReturnPath(window.sessionStorage)).toBe('/open-preview/abc')
  })

  it('waits for the sign-in state before deciding', () => {
    h.auth = { data: null, isLoading: true }
    renderAt('/open-preview/abc')
    expect(screen.queryByText('sign in')).toBeNull()
    expect(h.openPreview).not.toHaveBeenCalled()
  })

  it('asks for a ticket for a signed-in person, and shows a refusal', async () => {
    h.auth = { data: { id: 'u1' }, isLoading: false }
    h.openPreview.mockRejectedValue(new Error('not authorized for this preview'))
    renderAt('/open-preview/abc')
    await screen.findByText('not authorized for this preview')
    expect(h.openPreview).toHaveBeenCalledWith({ previewId: 'abc' })
    expect(takeReturnPath(window.sessionStorage)).toBeNull()
  })
})
