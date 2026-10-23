// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router'

const mocks = vi.hoisted(() => ({
  data: undefined as unknown, refetch: vi.fn(), setName: vi.fn(), upload: vi.fn(), removePic: vi.fn(), setZone: vi.fn(), sub: { present: false },
}))
vi.mock('wasp/client/operations', () => ({
  getOnboardingData: 'getOnboardingData',
  getModelCredentialStatus: 'getModelCredentialStatus',
  setPersonName: (...a: unknown[]) => mocks.setName(...a),
  uploadPersonPicture: (...a: unknown[]) => mocks.upload(...a),
  removePersonPicture: (...a: unknown[]) => mocks.removePic(...a),
  setMyTimezone: (...a: unknown[]) => mocks.setZone(...a),
  deleteModelCredential: vi.fn(),
  useAction: (fn: unknown) => fn,
  useQuery: (q: string, args?: { kind?: string }) =>
    q === 'getModelCredentialStatus'
      ? { data: { present: args?.kind === 'SUBSCRIPTION' && mocks.sub.present }, refetch: vi.fn() }
      : { data: mocks.data, isLoading: mocks.data === undefined, refetch: mocks.refetch },
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u9' } }) }))
vi.mock('wasp/client', () => ({ config: { apiUrl: 'http://hq.test' } }))
vi.mock('../../../shared/components/AuthedImg', () => ({ AuthedImg: ({ src, alt = '' }: { src: string; alt?: string }) => <img src={src} alt={alt} /> }))
vi.mock('../../../shared/hooks/useAgentImageUrl', () => ({ useAgentImageUrl: () => null }))
vi.mock('../../../org/pages/people/pictureUpload', () => ({ pictureToDataUrl: async () => 'data:image/jpeg;base64,AAAA' }))

import { OnboardingPage } from '../OnboardingPage'

const ACME = { shows: 'cover', name: 'Acme Corp', handle: 'acmecorp', vision: 'Shops online.', avatarUrl: null, coverUrl: null }
function Where() { const l = useLocation(); return <output data-testid="where">{l.pathname}{l.search}</output> }
const open = (entry: string, over: Record<string, unknown> = {}) => {
  mocks.data = {
    identity: ACME, orgName: 'Acme Corp', role: 'MEMBER', invitedBy: 'Avery', needsModel: false, needsSetup: false, landAt: '/projects/WEB',
    me: { id: 'u9', displayName: 'Dana Ruiz', username: 'dana', avatarUrl: null, timezone: null },
    projects: [{ key: 'WEB', name: 'Website Redesign' }, { key: 'MER', name: 'Merchant app' }],
    ...over,
  }
  render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/onboarding" element={<><OnboardingPage /><Where /></>} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>)
}

beforeEach(() => {
  window.sessionStorage.clear()
  mocks.sub = { present: false }
  mocks.refetch.mockReset().mockResolvedValue(undefined)
  mocks.setName.mockReset().mockResolvedValue({})
  mocks.upload.mockReset().mockResolvedValue({ url: '/people/u9/images/a.jpg' })
  mocks.removePic.mockReset().mockResolvedValue({ ok: true })
  mocks.setZone.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('Onboarding @SC-720', () => {
  it('carries the organisation across the top and "Powered by Agenthix", never our header', () => {
    open('/onboarding?step=you')
    expect(screen.getByTestId('org-cover').textContent).toContain('Acme Corp')
    expect(screen.getByText('Powered by Agenthix')).toBeTruthy()
    expect(screen.queryByTestId('setup-brand')).toBeNull()
  })

  it('counts two steps, and its indicator names the step: models are never a joiner\'s', () => {
    open('/onboarding?step=you')
    expect(screen.getByText('Step 2 of 2 · You')).toBeTruthy()
  })

  it('skips an old address of the model step', () => {
    open('/onboarding?step=model')
    expect(screen.getByText('Last look')).toBeTruthy()
    expect(screen.queryByText('Talk to agents')).toBeNull()
  })

  it('reviews the account on Join: name editable, username fixed, password set; saves a changed name', async () => {
    open('/onboarding?step=join')
    expect(screen.getByText('Step 1 of 2 · Join')).toBeTruthy()
    expect(screen.getByText('dana')).toBeTruthy()
    expect(screen.getByText('Set')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
    fireEvent.change(screen.getByLabelText(/Your name/), { target: { value: 'Dana R.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/onboarding?step=you'))
    expect(mocks.setName).toHaveBeenCalledWith({ userId: 'u9', displayName: 'Dana R.' })
  })

  it('You: uploads the picture, fills the time zone in from the browser and saves a changed one', async () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({ timeZone: 'Australia/Sydney' } as Intl.ResolvedDateTimeFormatOptions)
    open('/onboarding?step=you')
    expect((screen.getByLabelText(/Time zone/) as HTMLSelectElement).value).toBe('Australia/Sydney')
    expect(screen.getByText('from your browser')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Choose a picture of you'), { target: { files: [new File(['x'], 'me.png', { type: 'image/png' })] } })
    await screen.findByText('Picture uploaded')
    expect(mocks.upload).toHaveBeenCalledWith({ userId: 'u9', dataUrl: 'data:image/jpeg;base64,AAAA' })
    fireEvent.change(screen.getByLabelText(/Time zone/), { target: { value: 'Europe/London' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/onboarding?step=review'))
    expect(mocks.setZone).toHaveBeenCalledWith({ timezone: 'Europe/London' })
    vi.restoreAllMocks()
  })

  it('You: leaves the browser\'s time zone alone when it is not changed', async () => {
    open('/onboarding?step=you')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/onboarding?step=review'))
    expect(mocks.setZone).not.toHaveBeenCalled()
  })

  it('You: Back returns to Join', () => {
    open('/onboarding?step=you')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(screen.getByTestId('where').textContent).toBe('/onboarding?step=join')
  })

  it('the last look shows them, and what they are joining, and Start working lands in the first project with the welcome line', () => {
    open('/onboarding?step=review')
    expect(screen.getByText('Last look')).toBeTruthy()
    expect(screen.getByText(/@dana/)).toBeTruthy()
    expect(screen.getByText(/Member of Acme Corp/)).toBeTruthy()
    expect(screen.getByText(/Website Redesign and Merchant app — set by Avery's invitation/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Start working' }))
    expect(screen.getByTestId('where').textContent).toBe('/projects/WEB')
    expect(window.sessionStorage.getItem('agenthix:welcome-line')).toBe('Dana Ruiz')
  })

  it('the last look says models are "Provided by" the organisation, and lands on Home with no projects', () => {
    open('/onboarding?step=review', { projects: [], landAt: '/' })
    expect(screen.getByText(/Provided by Acme Corp/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit model access' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Start working' }))
    expect(screen.getByTestId('where').textContent).toBe('/')
    expect(window.sessionStorage.getItem('agenthix:welcome-line')).toBeNull()
  })

  it('Edit on the last look goes to the step and comes back to the last look', async () => {
    open('/onboarding?step=review')
    fireEvent.click(screen.getByRole('button', { name: 'Edit you' }))
    expect(screen.getByTestId('where').textContent).toBe('/onboarding?step=you&then=review')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/onboarding?step=review'))
  })

  it('sends the first admin to setup, never through onboarding', () => {
    open('/onboarding?step=you', { needsSetup: true })
    expect(screen.getByTestId('where').textContent).toBe('/setup')
  })

  it('treats an unknown step as the one after Join', () => {
    open('/onboarding?step=nonsense')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('You')
  })
})
