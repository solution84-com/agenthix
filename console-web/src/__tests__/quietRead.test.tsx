import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { quietReadPolicy } from '../api/quietRead'
import { forgetCsrfToken } from '../api/csrf'
import { DashboardPage } from '../pages/dashboard/DashboardPage'
import { fakeServer, fleetRoute } from './fakeServer'

const BROKE = { status: 500, body: { error: 'failed', message: 'It broke.' } }
const FLEET = fleetRoute([])
const COULD_NOT = 'The fleet could not be read'
const NO_MACHINE = 'No machine is connected yet.'

// The other tests turn the retries off (vitest.setup.ts); these are the ones that prove them.
beforeEach(() => {
  quietReadPolicy.retries = undefined
  sessionStorage.setItem('csrfToken', 'tok')
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'] })
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  forgetCsrfToken()
  quietReadPolicy.retries = 0
})

const advance = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms))

describe('a read the screen makes on its own, said quietly @SC-896 @SC-1946', () => {
  it('shows nothing while the retries run, and nothing at all when one of them works', async () => {
    let calls = 0
    fakeServer({ 'GET /fleet': () => (++calls < 3 ? BROKE : FLEET) })
    render(<DashboardPage />)
    await advance(500)
    expect(screen.queryByText(COULD_NOT)).toBeNull()
    await advance(5_000)
    expect(calls).toBe(3)
    expect(screen.getByText(NO_MACHINE)).toBeTruthy()
    expect(screen.queryByText(COULD_NOT)).toBeNull()
  })

  it('with nothing on screen after the retries, says so in place of the content, with Try again, and no dialog', async () => {
    let answer = false
    fakeServer({ 'GET /fleet': () => (answer ? FLEET : BROKE) })
    render(<DashboardPage />)
    await advance(6_000)
    expect(screen.queryByText(COULD_NOT)).toBeNull()
    await advance(4_000)
    expect(screen.getByText(COULD_NOT)).toBeTruthy()
    expect(screen.getByRole('status')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    answer = true
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    await advance(100)
    expect(screen.getByText(NO_MACHINE)).toBeTruthy()
    expect(screen.queryByText(COULD_NOT)).toBeNull()
  })

  it('keeps the old figures on screen, says nothing for a minute, then says it is not up to date', async () => {
    let ok = true
    fakeServer({ 'GET /fleet': () => (ok ? FLEET : BROKE) })
    render(<DashboardPage />)
    await advance(100)
    expect(screen.getByText(NO_MACHINE)).toBeTruthy()
    ok = false
    await advance(40_000)
    expect(screen.getByText(NO_MACHINE)).toBeTruthy()
    expect(screen.queryByText(/Not up to date/)).toBeNull()
    expect(screen.queryByText(COULD_NOT)).toBeNull()
    await advance(40_000)
    expect(screen.getByText(NO_MACHINE)).toBeTruthy()
    expect(screen.getByText(/Not up to date · read \d\d:\d\d/)).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    ok = true
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    // A read already under way (its retries) is not asked twice: it ends within seconds, and the next one works.
    await advance(16_000)
    expect(screen.queryByText(/Not up to date/)).toBeNull()
  })

  it('does not retry a final answer', async () => {
    let calls = 0
    fakeServer({ 'GET /fleet': () => { calls++; return { status: 403, body: { error: 'not_allowed', message: 'Only a fleet admin sees this.' } } } })
    render(<DashboardPage />)
    await advance(100)
    expect(calls).toBe(1)
    expect(screen.getByText('Only a fleet admin sees this.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })
})
