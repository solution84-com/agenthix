import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { forgetCsrfToken } from '../api/csrf'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { fakeServer } from './fakeServer'
import { SIGNED_IN } from './shellFixtures'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  forgetCsrfToken()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

function Boom(): never {
  throw new Error('drawn badly')
}

describe('a screen that cannot be drawn', () => {
  it('shows a way back instead of a blank page', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('Something went wrong')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Go to the dashboard' })).toBeTruthy()
  })

  it('a malformed escape in a Cloud site address is a page not found, not a blank page', async () => {
    fakeServer(SIGNED_IN)
    window.history.replaceState(null, '', '/fleet/cloud/%E0%A4%A')
    sessionStorage.setItem('csrfToken', 'tok')
    render(<App />)
    expect(await screen.findByText('No such page')).toBeTruthy()
  })
})
