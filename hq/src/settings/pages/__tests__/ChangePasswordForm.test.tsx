// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const h = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('wasp/client/api', () => ({
  api: { post: h.post },
  handleApiError: (e: unknown) => e,
}))

import { ChangePasswordForm } from '../ChangePasswordForm'

const fill = (current: string, next: string, again: string) => {
  fireEvent.change(screen.getByLabelText('Current password'), { target: { value: current } })
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: next } })
  fireEvent.change(screen.getByLabelText('New password again'), { target: { value: again } })
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }))
}

beforeEach(() => { cleanup(); vi.clearAllMocks() })

describe('changing your password in Settings', () => {
  it('sends the current password and the new one twice, and says it is done', async () => {
    h.post.mockReturnValue({ json: async () => ({ ok: true, signedOut: 1 }) })
    const onDone = vi.fn()
    render(<ChangePasswordForm onDone={onDone} />)
    fill('old-password-1', 'new-password-2', 'new-password-2')
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(h.post).toHaveBeenCalledWith('api/auth/change-password', {
      json: { currentPassword: 'old-password-1', newPassword: 'new-password-2', newPasswordAgain: 'new-password-2' },
    })
  })

  it('stops a repeat that differs before asking hq', () => {
    render(<ChangePasswordForm onDone={vi.fn()} />)
    fill('old-password-1', 'new-password-2', 'new-password-3')
    expect(screen.getByRole('alert').textContent).toBe('The new password and its repeat are not the same')
    expect(h.post).not.toHaveBeenCalled()
  })

  it("shows hq's refusal in its words", async () => {
    h.post.mockReturnValue({ json: () => Promise.reject({ message: 'Bad Request', data: { error: 'Your current password is not right' } }) })
    const onDone = vi.fn()
    render(<ChangePasswordForm onDone={onDone} />)
    fill('wrong-password', 'new-password-2', 'new-password-2')
    expect((await screen.findByRole('alert')).textContent).toBe('Your current password is not right')
    expect(onDone).not.toHaveBeenCalled()
  })
})
