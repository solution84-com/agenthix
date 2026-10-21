// @vitest-environment jsdom
/**
 * The Sign in with Claude flow at one boundary: acceptance first, then the
 * sign-in link and a field for the short code, then finish. The person signs
 * in on Anthropic's own page; hq only shows the link and passes the code on.
 */
import React from 'react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'

const { startClaudeLogin, completeClaudeLogin, cancelClaudeLogin } = vi.hoisted(() => ({
  startClaudeLogin: vi.fn(),
  completeClaudeLogin: vi.fn(),
  cancelClaudeLogin: vi.fn(),
}))

vi.mock('wasp/client/operations', () => ({
  useAction: (fn: unknown) => fn,
  startClaudeLogin,
  completeClaudeLogin,
  cancelClaudeLogin,
}))

import { ClaudeSignIn } from '../ClaudeSignIn'

const URL_SHOWN = 'https://claude.com/cai/oauth/authorize?code=true&state=abc'

beforeEach(() => {
  cleanup()
  vi.clearAllMocks()
  startClaudeLogin.mockResolvedValue({ loginId: 'login-1', url: URL_SHOWN })
  completeClaudeLogin.mockResolvedValue({ ok: true })
  cancelClaudeLogin.mockResolvedValue({ ok: true })
})

const signInButton = () => screen.getByRole('button', { name: 'Sign in with Claude' }) as HTMLButtonElement

async function startFlow() {
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(signInButton())
  await screen.findByLabelText('Code from Claude')
}

describe.each([
  { ownerType: 'org', ownerId: 'org' },
  { ownerType: 'project', ownerId: 'p1' },
  { ownerType: 'user', ownerId: 'u1' },
] as const)('ClaudeSignIn for $ownerType', ({ ownerType, ownerId }) => {
  it('keeps the sign-in button disabled until acceptance is ticked', () => {
    render(<ClaudeSignIn ownerType={ownerType} ownerId={ownerId} />)
    expect(signInButton().disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(signInButton().disabled).toBe(false)
  })

  it('starts the login with the boundary and the acceptance', async () => {
    render(<ClaudeSignIn ownerType={ownerType} ownerId={ownerId} />)
    await startFlow()
    expect(startClaudeLogin).toHaveBeenCalledWith({ ownerType, ownerId, termsAccepted: true })
  })
})

describe('ClaudeSignIn flow', () => {
  it('shows the link as an external link and a code field, and no textarea', async () => {
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    await startFlow()
    const link = screen.getByRole('link') as HTMLAnchorElement
    expect(link.getAttribute('href')).toBe(URL_SHOWN)
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('does not start when acceptance is not ticked', () => {
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    fireEvent.click(signInButton())
    expect(startClaudeLogin).not.toHaveBeenCalled()
  })

  it('finishes with the login id and the trimmed code, then returns to the start', async () => {
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    await startFlow()
    fireEvent.change(screen.getByLabelText('Code from Claude'), { target: { value: '  abc#def  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(completeClaudeLogin).toHaveBeenCalledWith({ loginId: 'login-1', code: 'abc#def' }))
    await waitFor(() => expect(signInButton()).toBeTruthy())
    expect(cancelClaudeLogin).not.toHaveBeenCalled()
  })

  it('keeps Finish disabled while the code is empty', async () => {
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    await startFlow()
    expect((screen.getByRole('button', { name: 'Finish' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the message from a failed start and returns to the button', async () => {
    startClaudeLogin.mockRejectedValue(new Error('No Execution Site is connected'))
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(signInButton())
    expect(await screen.findByText('No Execution Site is connected')).toBeTruthy()
    expect(signInButton()).toBeTruthy()
  })

  it('shows the message from a rejected code and returns to the button', async () => {
    completeClaudeLogin.mockRejectedValue(new Error('Claude did not accept that code'))
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    await startFlow()
    fireEvent.change(screen.getByLabelText('Code from Claude'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect(await screen.findByText('Claude did not accept that code')).toBeTruthy()
    expect(signInButton()).toBeTruthy()
    expect(screen.queryByLabelText('Code from Claude')).toBeNull()
  })

  it('cancels the login when Cancel is pressed', async () => {
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    await startFlow()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(cancelClaudeLogin).toHaveBeenCalledWith({ loginId: 'login-1' }))
    expect(signInButton()).toBeTruthy()
  })

  it('cancels the login when the page is left while waiting for the code', async () => {
    const { unmount } = render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    await startFlow()
    unmount()
    expect(cancelClaudeLogin).toHaveBeenCalledTimes(1)
    expect(cancelClaudeLogin).toHaveBeenCalledWith({ loginId: 'login-1' })
  })

  it('does not cancel on leaving when no login is waiting', () => {
    const { unmount } = render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    unmount()
    expect(cancelClaudeLogin).not.toHaveBeenCalled()
  })

  it('does not cancel a second time after Cancel was pressed and the page is left', async () => {
    const { unmount } = render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    await startFlow()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(cancelClaudeLogin).toHaveBeenCalledTimes(1))
    unmount()
    expect(cancelClaudeLogin).toHaveBeenCalledTimes(1)
  })
})

describe('boundary-aware acceptance wording', () => {
  it('words it for a person as their own use', () => {
    render(<ClaudeSignIn ownerType="user" ownerId="u1" />)
    expect(screen.getByText(/This subscription is mine/)).toBeTruthy()
  })

  it('words it for the org and a project as "I understand this"', () => {
    render(<ClaudeSignIn ownerType="org" ownerId="org" />)
    expect(screen.getByText('I understand this')).toBeTruthy()
    cleanup()
    render(<ClaudeSignIn ownerType="project" ownerId="p1" />)
    expect(screen.getByText('I understand this')).toBeTruthy()
  })
})
