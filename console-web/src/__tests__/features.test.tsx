import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FeaturesProvider, useFeature } from '../features/features'
import { forgetCsrfToken } from '../api/csrf'
import { fakeServer } from './fakeServer'

// A flagged section is drawn only while the Fleet Console's server says hq has its feature on (adr-0172).

function Section() {
  return useFeature('usageBilling') ? <p>Flagged section</p> : <p>Nothing flagged</p>
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  forgetCsrfToken()
})

describe('useFeature @SC-1778', () => {
  it('draws a flagged section once the server says its feature is on', async () => {
    const requests = fakeServer({ 'GET /features': { status: 200, body: { on: ['usageBilling'] } } })
    render(<FeaturesProvider><Section /></FeaturesProvider>)
    expect(screen.getByText('Nothing flagged')).toBeTruthy()
    expect(await screen.findByText('Flagged section')).toBeTruthy()
    expect(requests.filter(r => r.path === '/features')).toHaveLength(1)
  })

  it('leaves it out while the feature is off', async () => {
    const requests = fakeServer({ 'GET /features': { status: 200, body: { on: ['marketplace'] } } })
    render(<FeaturesProvider><Section /></FeaturesProvider>)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(screen.getByText('Nothing flagged')).toBeTruthy()
  })

  it('leaves it out when the server does not answer', async () => {
    const requests = fakeServer({ 'GET /features': { status: 503, body: { error: 'hq_unreachable', message: 'HQ is not answering.' } } })
    render(<FeaturesProvider><Section /></FeaturesProvider>)
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(screen.getByText('Nothing flagged')).toBeTruthy()
  })
})
