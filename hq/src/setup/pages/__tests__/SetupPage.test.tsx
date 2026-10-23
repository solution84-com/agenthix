// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'

const mocks = vi.hoisted(() => ({
  data: undefined as unknown, queries: {} as Record<string, unknown>, saveOrg: vi.fn(), addProvider: vi.fn(), refetch: vi.fn(), complete: vi.fn(), update: vi.fn(), setName: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getSetupData: 'getSetupData',
  getWhereHqRuns: 'getWhereHqRuns',
  getSetupResume: 'getSetupResume',
  getAiProviders: 'getAiProviders',
  getHqCloudConnection: 'getHqCloudConnection',
  connectHqToCloud: 'connectHqToCloud',
  disconnectHqFromCloud: 'disconnectHqFromCloud',
  addAiProvider: 'addAiProvider',
  completeSetup: (...a: unknown[]) => mocks.complete(...a),
  setPersonName: (...a: unknown[]) => mocks.setName(...a),
  updateOrgIdentity: (...a: unknown[]) => mocks.update(...a),
  saveSetupOrganisation: (...a: unknown[]) => mocks.saveOrg(...a),
  uploadOrgImage: (...a: unknown[]) => mocks.upload(...a),
  removeOrgImage: (...a: unknown[]) => mocks.remove(...a),
  useAction: (fn: unknown) => (typeof fn === 'function' ? fn : fn === 'addAiProvider' ? mocks.addProvider : vi.fn()),
  useQuery: (op: string) => {
    const data = op === 'getSetupData' ? mocks.data : mocks.queries[op]
    return { data, isLoading: data === undefined, error: undefined, refetch: mocks.refetch }
  },
}))
vi.mock('wasp/client/auth', () => ({ useAuth: () => ({ data: { id: 'u1' } }) }))
vi.mock('../../../org/components/resizeImage', () => ({
  PICTURE_SIZE: { avatar: [256, 256], cover: [1200, 400] },
  resizeImage: async () => 'data:image/jpeg;base64,AAAA',
  imageFileProblem: (f: File) => (f.size > 10 * 1024 * 1024 ? 'That image is over 10 MB. Choose a smaller one.' : null),
}))
vi.mock('../../../shared/components/AuthedImg', () => ({ AuthedImg: ({ src, alt = '' }: { src: string; alt?: string }) => <img src={src} alt={alt} /> }))
vi.mock('wasp/client', () => ({ config: { apiUrl: 'http://hq.test' } }))

import { SetupPage } from '../SetupPage'

function Where() { const navigate = useNavigate(); return <><output data-testid="where">{useLocation().pathname}</output><button type="button" onClick={() => navigate(-1)}>browser back</button></> }
const CLOUD_OFF = { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: false }
const provider = (vendor: string, name: string, types: string[], state = 'works') => ({ id: vendor, vendor, name, types, state })
const queries = (over: Record<string, unknown> = {}) => { mocks.queries = { getSetupResume: { step: 'choice' }, getAiProviders: [], getHqCloudConnection: CLOUD_OFF, ...over } }
const setup = (hqSite: unknown = { state: 'connected', dockerRunning: true }, over: Record<string, unknown> = {}, entry = '/setup?step=organisation&path=keys') => {
  mocks.data = { org: { id: 'o', name: 'My Organisation', handle: null, vision: '', mission: '', avatarUrl: null, coverUrl: null, timeZone: 'Europe/London' }, needsSetup: true, setupComplete: false, isAdmin: true, hqSite, me: { id: 'u1', displayName: 'Dana Ruiz', username: 'dana' }, ...over }
  mocks.data = { ...(mocks.data as object), org: over.org ?? { ...(mocks.data as { org: object }).org, timeZone: 'Europe/London' } }
  render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/setup" element={<><SetupPage /><Where /></>} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>)
}
/** From the organisation step to the review: choosing models is not a step of setup here. */
const toReview = async () => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText(/^Step 6 of 6/)
}

beforeEach(() => {
  queries(); mocks.saveOrg.mockReset().mockResolvedValue({ ok: true }); mocks.addProvider.mockReset().mockResolvedValue({})
  mocks.refetch.mockReset(); mocks.complete.mockReset().mockResolvedValue({ done: true })
  mocks.setName.mockReset().mockResolvedValue({ displayName: 'x' }); mocks.update.mockReset().mockResolvedValue({ ok: true }); mocks.upload.mockReset().mockImplementation(async ({ type }: { type: string }) => ({ url: `/org/images/${type}.jpg` })); mocks.remove.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('Setup @SC-710', () => {
  it('opens on the organisation step, beside the sign-in page it makes, which follows the name', () => {
    setup()
    expect(screen.getByText(/^Step 5 of 6/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your organisation')
    expect(screen.getByText('Vision, mission and @handle can be added later on the Organisation page.')).toBeTruthy()
    const preview = screen.getByTestId('sign-in-preview')
    expect(preview.textContent).toContain("to My Organisation's HQ")
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
    expect(preview.textContent).toContain("to Acme Corp's HQ")
  })

  it('shows an uploaded picture and cover in their controls and the preview, and lets them be changed or removed', async () => {
    setup()
    const file = new File(['x'], 'p.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Choose a logo or picture'), { target: { files: [file] } })
    await screen.findByAltText('Your picture')
    expect(mocks.upload).toHaveBeenCalledWith({ type: 'avatar', dataUrl: 'data:image/jpeg;base64,AAAA' })
    fireEvent.change(screen.getByLabelText('Choose a cover image'), { target: { files: [file] } })
    await screen.findByAltText('Your cover')
    expect(mocks.upload).toHaveBeenCalledWith({ type: 'cover', dataUrl: 'data:image/jpeg;base64,AAAA' })
    expect(within(screen.getByTestId('sign-in-preview')).getByTestId('org-cover-banner').querySelector('img')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    await waitFor(() => expect(screen.queryByAltText('Your cover')).toBeNull())
    expect(mocks.remove).toHaveBeenCalledWith({ type: 'cover' })
    expect(within(screen.getByTestId('sign-in-preview')).getByTestId('org-cover-banner').querySelector('img')).toBeNull()
  })

  it('refuses an image over 10 MB with a plain message, without uploading it', async () => {
    setup()
    const big = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText('Choose a logo or picture'), { target: { files: [big] } })
    expect(await screen.findByText('That image is over 10 MB. Choose a smaller one.')).toBeTruthy()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('says what each image needs, and shows the stored picture and cover again on the next step', async () => {
    setup(undefined, { org: { id: 'o', name: 'My Organisation', handle: null, vision: '', mission: '', avatarUrl: '/org/images/a.jpg', coverUrl: '/org/images/c.jpg' } })
    expect(screen.getByText('Square, at least 256×256. PNG, JPG or WebP, up to 10 MB.')).toBeTruthy()
    expect(screen.getByAltText('Your picture').getAttribute('src')).toBe('/org/images/a.jpg')
    await toReview()
    expect(within(screen.getByTestId('sign-in-preview')).getByTestId('org-cover-banner').querySelector('img')?.getAttribute('src')).toBe('/org/images/c.jpg')
  })

  it('heads the form with the Agenthix mark and name and has no Powered by footer; only the preview, which is the organisation\'s page, keeps it', () => {
    setup()
    expect(screen.getByTestId('setup-brand').textContent).toBe('Agenthix')
    const footers = screen.getAllByText('Powered by Agenthix')
    expect(footers).toHaveLength(1)
    expect(screen.getByTestId('sign-in-preview').contains(footers[0])).toBe(true)
  })

  it('keeps the review on a refresh, showing what step 2 saved from the server', () => {
    setup(undefined, { org: { id: 'o', name: 'Acme Corp', handle: null, vision: '', mission: '', avatarUrl: null, coverUrl: null } }, '/setup?step=review&path=keys')
    expect(screen.getByText(/^Step 6 of 6/)).toBeTruthy()
    expect(screen.getByTestId('sign-in-preview').textContent).toContain("to Acme Corp's HQ")
  })

  it('goes back from the review to step 2 with the browser Back', async () => {
    setup()
    await toReview()
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    expect(await screen.findByText(/^Step 5 of 6/)).toBeTruthy()
  })

  it('goes back from the organisation to voice, and from the first step shows the account with the name filled in', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Voice' })).toBeTruthy()
    cleanup()
    setup(undefined, {}, '/setup?step=you&path=keys')
    expect((screen.getByLabelText(/^Your name/) as HTMLInputElement).value).toBe('Dana Ruiz')
    expect(screen.getByText('dana')).toBeTruthy()
    expect(screen.getByText('Set')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('saves an edited name on step 1 and continues to the choice; Back on the last look returns to the organisation', async () => {
    setup(undefined, {}, '/setup?step=you&path=keys')
    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: 'Dana R. Ruiz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'How will your agents reach AI?' })).toBeTruthy()
    expect(mocks.setName).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Dana R. Ruiz' })
    cleanup()
    setup(undefined, {}, '/setup?step=review&path=keys')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText(/^Step 5 of 6/)).toBeTruthy()
  })

  it('opens at the step setup stopped at for an unknown step', () => {
    setup(undefined, {}, '/setup?step=nonsense&path=keys')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How will your agents reach AI?')
  })

  it('shows on the review what the server holds, after a refresh', () => {
    setup(undefined, { org: { id: 'o', name: 'Acme Corp', handle: null, vision: '', mission: '', avatarUrl: '/org/images/a.jpg', coverUrl: '/org/images/c.jpg' } }, '/setup?step=review&path=keys')
    expect(screen.getByText('Dana Ruiz')).toBeTruthy()
    expect(screen.getByText('dana')).toBeTruthy()
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    expect(screen.getByAltText('Your picture').getAttribute('src')).toBe('/org/images/a.jpg')
    expect(screen.getByAltText('Your cover').getAttribute('src')).toBe('/org/images/c.jpg')
  })

  it('opens a step from Edit on the review and returns to the review on Continue', async () => {
    setup(undefined, {}, '/setup?step=review&path=keys')
    fireEvent.click(screen.getByRole('button', { name: 'Edit your organisation' }))
    expect(await screen.findByText(/^Step 5 of 6/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/^Step 6 of 6/)).toBeTruthy()
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Acme Corp' })
    expect(screen.queryByRole('button', { name: 'Edit model access' })).toBeNull()
  })

  it('finishes from the review, and Home follows', async () => {
    setup(undefined, {}, '/setup?step=review&path=keys')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(mocks.complete).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
  })

  it('shows Where agents run on the review, without Edit', () => {
    setup(undefined, {}, '/setup?step=review&path=keys')
    expect(screen.getByRole('heading', { name: 'Where agents run' })).toBeTruthy()
    expect(screen.getByText("HQ's site — running on this machine")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit where agents run' })).toBeNull()
  })

  it('stays on the step with a message when finishing fails', async () => {
    mocks.complete.mockRejectedValue(new Error('down'))
    setup(undefined, {}, '/setup?step=review&path=keys')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect((await screen.findByRole('alert')).textContent).toBe('Could not finish setup. Please try again.')
    expect(screen.getByTestId('where').textContent).toBe('/setup')
  })

  it('leaves for Home when setup is done or is not this person\'s', async () => {
    setup(undefined, { needsSetup: false, setupComplete: true })
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
  })

  it('refuses a name left empty', async () => {
    setup()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: ' ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect((await screen.findByRole('alert')).textContent).toBe('The organisation needs a name')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('saves the time zone and the default billing profile with the organisation, and shows the zone on the last look', async () => {
    setup()
    expect((screen.getByLabelText('Time zone') as HTMLSelectElement).value).toBe('Europe/London')
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Tokyo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    await screen.findByText(/^Step 6 of 6/)
    expect(mocks.saveOrg).toHaveBeenCalledWith({ timeZone: 'Asia/Tokyo' })
    expect(screen.getByText(/Asia\/Tokyo/)).toBeTruthy()
  })

  it('shows where models and voice come from on the last look, with a way to change the choice', () => {
    queries({ getAiProviders: [provider('anthropic', 'Anthropic', ['llm'])] })
    setup(undefined, {}, '/setup?step=review')
    expect(screen.getByText('Your own keys: Anthropic.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit models and voice' }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How will your agents reach AI?')
  })
})

describe('Setup opens where it stopped, and counts the chosen path', () => {
  it('opens at the choice with no provider, at voice with only a model provider, and at the organisation with all three', () => {
    setup(undefined, {}, '/setup')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('How will your agents reach AI?')
    cleanup()
    queries({ getSetupResume: { step: 'voice' }, getAiProviders: [provider('anthropic', 'Anthropic', ['llm'])] })
    setup(undefined, {}, '/setup')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Voice')
    expect(screen.getByText(/^Step 4 of 6/)).toBeTruthy()
    cleanup()
    queries({ getSetupResume: { step: 'organisation' }, getAiProviders: [provider('anthropic', 'Anthropic', ['llm']), provider('assemblyai', 'AssemblyAI', ['stt']), provider('inworld', 'Inworld', ['tts'])] })
    setup(undefined, {}, '/setup')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your organisation')
    expect(screen.getByText(/^Step 5 of 6/)).toBeTruthy()
  })

  it('counts four steps on the Cloud path and six with own keys', () => {
    setup(undefined, {}, '/setup?step=organisation&path=cloud')
    expect(screen.getByText(/^Step 3 of 4/)).toBeTruthy()
    cleanup()
    setup(undefined, {}, '/setup?step=organisation&path=keys')
    expect(screen.getByText(/^Step 5 of 6/)).toBeTruthy()
  })

  it('disables the Cloud card while its models and voice are not available yet, and own keys goes on to the model provider', async () => {
    setup(undefined, {}, '/setup?step=choice')
    expect(screen.getByText("Agenthix Cloud's models and voice aren't available yet.")).toBeTruthy()
    expect((within(screen.getByRole('region', { name: 'Agenthix Cloud' })).getByRole('button', { name: 'Connect' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Choose' }))
    expect(await screen.findByRole('heading', { name: 'Your model provider' })).toBeTruthy()
    expect(screen.getByText(/^Step 3 of 6/)).toBeTruthy()
    expect(screen.getByText('You can add more providers, or Agenthix Cloud, later in Manage › Providers.')).toBeTruthy()
  })

  it('offers Connect on the Cloud card when it is available, and goes straight to the organisation once connected', async () => {
    queries({ getHqCloudConnection: { ...CLOUD_OFF, aiAvailable: true, connection: { cloudOrganisationId: 'o1', name: 'Acme', connectedAt: '2026-10-01T00:00:00Z' } } })
    setup(undefined, {}, '/setup?step=choice')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Your organisation' })).toBeTruthy()
    expect(screen.getByText(/^Step 3 of 4/)).toBeTruthy()
  })

  it('shows a model provider that works instead of the form, and goes on to voice, which needs both providers', async () => {
    queries({ getAiProviders: [provider('anthropic', 'Anthropic', ['llm'])] })
    setup(undefined, {}, '/setup?step=model&path=keys')
    expect(screen.getByText('works. Added by you.', { exact: false })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Voice' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    cleanup()
    queries({ getAiProviders: [provider('anthropic', 'Anthropic', ['llm']), provider('assemblyai', 'AssemblyAI', ['stt']), provider('inworld', 'Inworld', ['tts'])] })
    setup(undefined, {}, '/setup?step=voice&path=keys')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Your organisation' })).toBeTruthy()
  })

  it('has no way to skip, and says so plainly when finishing is refused until providers work', async () => {
    mocks.complete.mockRejectedValue(new Error('Add a model provider and a speech-to-text and a text-to-speech provider that work before finishing setup'))
    setup(undefined, {}, '/setup?step=review&path=keys')
    expect(screen.queryByRole('button', { name: /skip/i })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    expect((await screen.findByRole('alert')).textContent).toContain('not working yet')
  })
})
