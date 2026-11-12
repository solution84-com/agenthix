// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within, configure } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'

const mocks = vi.hoisted(() => ({
  data: undefined as unknown, queries: {} as Record<string, unknown>, saveOrg: vi.fn(), addProvider: vi.fn(), refetch: vi.fn(), complete: vi.fn(), update: vi.fn(), setName: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getFeatures: 'getFeatures',
  getSetupData: 'getSetupData',
  getWhereHqRuns: 'getWhereHqRuns',
  getSetupResume: 'getSetupResume',
  getSetupDefaults: 'getSetupDefaults',
  setModelDefaults: 'setModelDefaults',
  getAiProviders: 'getAiProviders',
  getAiProviderImpact: 'getAiProviderImpact',
  removeAiProvider: 'removeAiProvider',
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
vi.mock('../../../shared/pictures/upload/cropAndCompress', () => ({
  cropAndCompress: async () => 'data:image/webp;base64,AAAA',
  openedSize: async () => ({ width: 1000, height: 1000 }),
  imageFileProblem: (f: File) => (f.size > 10 * 1024 * 1024 ? 'That image is over 10 MB. Choose a smaller one.' : null),
}))
vi.mock('../../../shared/components/AuthedImg', () => ({ AuthedImg: ({ src, alt = '' }: { src: string; alt?: string }) => <img src={src} alt={alt} /> }))
// Setup renders several steps through lazy queries, which take one to two seconds on CI's runners: past Testing
// Library's default wait of one second.
configure({ asyncUtilTimeout: 5000 })
URL.createObjectURL = () => 'blob:chosen'
URL.revokeObjectURL = () => {}

vi.mock('wasp/client', () => ({ config: { apiUrl: 'http://hq.test' } }))

import { SetupPage } from '../SetupPage'

function Where() { const navigate = useNavigate(); return <><output data-testid="where">{useLocation().pathname}</output><button type="button" onClick={() => navigate(-1)}>browser back</button></> }
const CLOUD_OFF = { connection: null, connecting: null, lastAttempt: null, problem: null, runByCloud: false, aiAvailable: false }
const DEFAULTS = {
  orgName: 'My Organisation', choices: { current: null, recent: [], models: [] },
  conversation: { providerId: 'anthropic', model: 'claude-sonnet-5', text: 'Claude Sonnet 5 · via Anthropic', notWorking: false },
  stt: { providerId: 'assemblyai', model: 'universal-3-6-pro', text: 'universal-3-6-pro · via AssemblyAI', notWorking: false },
  tts: { providerId: 'inworld', model: 'inworld-tts-2', voice: 'Alistair', text: 'inworld-tts-2 · Alistair · via Inworld', notWorking: false },
  stt_options: [{ providerId: 'assemblyai', name: 'AssemblyAI', state: 'works', models: ['universal-3-6-pro'] }],
  tts_options: [{ providerId: 'inworld', name: 'Inworld', state: 'works', models: ['inworld-tts-2'] }],
}
const provider = (vendor: string, name: string, types: string[], state = 'works') => ({ id: vendor, vendor, name, types, state })
const queries = (over: Record<string, unknown> = {}) => { mocks.queries = { getSetupResume: { step: 'organisation' }, getSetupDefaults: DEFAULTS, getAiProviders: [], getHqCloudConnection: CLOUD_OFF, ...over } }
const setup = (hqSite: unknown = { state: 'connected', dockerRunning: true }, over: Record<string, unknown> = {}, entry = '/setup?step=organisation') => {
  mocks.data = { org: { id: 'o', name: 'My Organisation', handle: null, vision: '', mission: '', avatarUrl: null, coverUrl: null, timeZone: 'Europe/London' }, needsSetup: true, setupComplete: false, isAdmin: true, hqSite, me: { id: 'u1', displayName: 'Dana Ruiz', username: 'dana' }, ...over }
  mocks.data = { ...(mocks.data as object), org: over.org ?? { ...(mocks.data as { org: object }).org, timeZone: 'Europe/London' } }
  render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/setup" element={<><SetupPage /><Where /></>} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>)
}
const THREE = [provider('anthropic', 'Anthropic', ['llm']), provider('assemblyai', 'AssemblyAI', ['stt']), provider('inworld', 'Inworld', ['tts'])]
/** From the organisation step to the review, leaving AI for later. */
const toReview = async () => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))
  await screen.findByText(/^Step 4 of 4/)
}

beforeEach(() => {
  queries(); mocks.saveOrg.mockReset().mockResolvedValue({ ok: true }); mocks.addProvider.mockReset().mockResolvedValue({})
  mocks.refetch.mockReset(); mocks.complete.mockReset().mockResolvedValue({ done: true })
  mocks.setName.mockReset().mockResolvedValue({ displayName: 'x' }); mocks.update.mockReset().mockResolvedValue({ ok: true }); mocks.upload.mockReset().mockImplementation(async ({ type }: { type: string }) => ({ url: `/org/images/${type}.jpg` })); mocks.remove.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('Setup @SC-710 @SC-1184 @SC-1187 @SC-1935', () => {
  it('opens on the organisation step, beside the sign-in page it makes, which follows the name', () => {
    setup()
    expect(screen.getByText(/^Step 2 of 4/)).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your organisation')
    expect(screen.getByText('Vision, mission and @handle can be added later on the Organisation page.')).toBeTruthy()
    const preview = screen.getByTestId('sign-in-preview')
    expect(preview.textContent).toContain("to My Organisation's HQ")
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
    expect(preview.textContent).toContain("to Acme Corp's HQ")
  })

  it('shows an uploaded picture and cover in their controls and the preview, and lets them be changed or removed @SC-2012', async () => {
    setup()
    const file = new File(['x'], 'p.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Choose a logo or picture'), { target: { files: [file] } })
    // Choosing a file opens the crop frame; nothing is sent until it is confirmed.
    expect(await screen.findByTestId('crop-frame')).toBeTruthy()
    expect(mocks.upload).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Use this picture' }))
    await screen.findByAltText('Your picture')
    expect(mocks.upload).toHaveBeenCalledWith({ type: 'avatar', dataUrl: 'data:image/webp;base64,AAAA' })
    fireEvent.change(screen.getByLabelText('Choose a cover image'), { target: { files: [file] } })
    expect(await screen.findByTestId('crop-frame')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Use this picture' }))
    await screen.findByAltText('Your cover')
    expect(mocks.upload).toHaveBeenCalledWith({ type: 'cover', dataUrl: 'data:image/webp;base64,AAAA' })
    expect(within(screen.getByTestId('sign-in-preview')).getByTestId('org-cover-banner').querySelector('img')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Change' })).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1])
    await waitFor(() => expect(screen.queryByAltText('Your cover')).toBeNull())
    expect(mocks.remove).toHaveBeenCalledWith({ type: 'cover' })
    expect(within(screen.getByTestId('sign-in-preview')).getByTestId('org-cover-banner').querySelector('img')).toBeNull()
  })

  it('refuses an image over 10 MB with a plain message, without uploading it @SC-2012', async () => {
    setup()
    const big = new File(['x'], 'big.png', { type: 'image/png' })
    Object.defineProperty(big, 'size', { value: 11 * 1024 * 1024 })
    fireEvent.change(screen.getByLabelText('Choose a logo or picture'), { target: { files: [big] } })
    expect(await screen.findByText('That image is over 10 MB. Choose a smaller one.')).toBeTruthy()
    expect(mocks.upload).not.toHaveBeenCalled()
  })

  it('says what each image needs, and shows the stored picture and cover again on the next step @SC-2012', async () => {
    setup(undefined, { org: { id: 'o', name: 'My Organisation', handle: null, vision: '', mission: '', avatarUrl: '/org/images/a.jpg', coverUrl: '/org/images/c.jpg' } })
    expect(screen.getByText('Square works best; you crop it next. Any picture your browser can open.')).toBeTruthy()
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

  it('shows on the last look one AI row with what works and Kernel speaking as the voice, and no defaults of its own @SC-1849', () => {
    queries({ getAiProviders: THREE })
    setup(undefined, {}, '/setup?step=review')
    expect(screen.queryByRole('region', { name: 'Thinking' })).toBeNull()
    expect(screen.queryByText('Defaults for everyone')).toBeNull()
    expect(screen.queryByText('Models and voice')).toBeNull()
    const ai = within(screen.getByRole('heading', { name: 'AI' }).closest('section')!)
    for (const name of ['Anthropic', 'AssemblyAI', 'Inworld']) expect(ai.getByText(name)).toBeTruthy()
    expect(screen.getByText('Kernel, speaking as Alistair')).toBeTruthy()
  })

  it('keeps the review on a refresh, showing what step 2 saved from the server', () => {
    setup(undefined, { org: { id: 'o', name: 'Acme Corp', handle: null, vision: '', mission: '', avatarUrl: null, coverUrl: null } }, '/setup?step=review')
    expect(screen.getByText(/^Step 4 of 4/)).toBeTruthy()
    expect(screen.getByTestId('sign-in-preview').textContent).toContain("to Acme Corp's HQ")
  })

  it('goes back from the review to the AI step with the browser Back', async () => {
    setup()
    await toReview()
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    expect(await screen.findByRole('heading', { name: 'Connect AI' })).toBeTruthy()
  })

  it('goes back from the organisation to the first step, which shows the account with the name filled in', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'You' })).toBeTruthy()
    cleanup()
    setup(undefined, {}, '/setup?step=you')
    expect((screen.getByLabelText(/^Your name/) as HTMLInputElement).value).toBe('Dana Ruiz')
    expect(screen.getByText('dana')).toBeTruthy()
    expect(screen.getByText('Set')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('saves an edited name on step 1 and continues to the organisation; Back on the last look returns to the AI step', async () => {
    setup(undefined, {}, '/setup?step=you')
    expect(screen.getByText(/Next you name your organisation/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: 'Dana R. Ruiz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByRole('heading', { name: 'Your organisation' })).toBeTruthy()
    expect(mocks.setName).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Dana R. Ruiz' })
    cleanup()
    setup(undefined, {}, '/setup?step=review')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Connect AI' })).toBeTruthy()
  })

  it('opens at the step setup stopped at for an unknown step', () => {
    setup(undefined, {}, '/setup?step=nonsense')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your organisation')
  })

  it('shows on the review what the server holds, after a refresh', () => {
    setup(undefined, { org: { id: 'o', name: 'Acme Corp', handle: null, vision: '', mission: '', avatarUrl: '/org/images/a.jpg', coverUrl: '/org/images/c.jpg' } }, '/setup?step=review')
    expect(screen.getByText('Dana Ruiz')).toBeTruthy()
    expect(screen.getByText('dana')).toBeTruthy()
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    expect(screen.getByAltText('Your picture').getAttribute('src')).toBe('/org/images/a.jpg')
    expect(screen.getByAltText('Your cover').getAttribute('src')).toBe('/org/images/c.jpg')
  })

  it('opens a step from Edit on the review and returns to the review on Continue', async () => {
    setup(undefined, {}, '/setup?step=review')
    fireEvent.click(screen.getByRole('button', { name: 'Edit your organisation' }))
    expect(await screen.findByText(/^Step 2 of 4/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText(/^Step 4 of 4/)).toBeTruthy()
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Acme Corp' })
    expect(screen.queryByRole('button', { name: 'Edit model access' })).toBeNull()
  })

  it('finishes from the review, and Home follows', async () => {
    setup(undefined, {}, '/setup?step=review')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(mocks.complete).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
  })

  it('shows Where agents run on the review, without Edit', () => {
    setup(undefined, {}, '/setup?step=review')
    expect(screen.getByRole('heading', { name: 'Where agents run' })).toBeTruthy()
    expect(screen.getByText("HQ's site — running on this machine")).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit where agents run' })).toBeNull()
  })

  it('stays on the step with a message when finishing fails', async () => {
    mocks.complete.mockRejectedValue(new Error('down'))
    setup(undefined, {}, '/setup?step=review')
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
    expect((await screen.findByText('The organisation needs a name')).textContent).toBe('The organisation needs a name')
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('saves the time zone and the default billing profile with the organisation, and shows the zone on the last look', async () => {
    setup()
    expect((screen.getByLabelText('Time zone') as HTMLSelectElement).value).toBe('Europe/London')
    fireEvent.change(screen.getByLabelText('Time zone'), { target: { value: 'Asia/Tokyo' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))
    await screen.findByText(/^Step 4 of 4/)
    expect(mocks.saveOrg).toHaveBeenCalledWith({ timeZone: 'Asia/Tokyo' })
    expect(screen.getByText(/Asia\/Tokyo/)).toBeTruthy()
  })

  it('says on the last look what works, with a way back to the AI step @SC-1849', async () => {
    queries({ getAiProviders: [provider('anthropic', 'Anthropic', ['llm'])] })
    setup(undefined, {}, '/setup?step=review')
    expect(screen.getByText('Anthropic')).toBeTruthy()
    expect(screen.getByText('Model set.')).toBeTruthy()
    expect(screen.getByText('Hearing: Not set.')).toBeTruthy()
    expect(screen.getByText('Speaking: Not set.')).toBeTruthy()
    expect(screen.getByText('Kernel, typing only until a voice is added')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Edit AI' }))
    expect(await screen.findByRole('heading', { name: 'Connect AI' })).toBeTruthy()
  })

  it('says on the last look that the model is not set yet while a provider offers models but no default model exists @SC-1849', async () => {
    queries({ getAiProviders: [provider('inworld', 'Inworld', ['llm', 'tts'])], getSetupDefaults: { ...DEFAULTS, conversation: null } })
    setup(undefined, {}, '/setup?step=review')
    expect(screen.getByText('Model not set yet.')).toBeTruthy()
    expect(screen.getByText('Speaking set.')).toBeTruthy()
  })

  it('says on the last look when nothing is set up, and a model-less or voice-less set, then finishes @SC-1849 @SC-1845', async () => {
    setup(undefined, {}, '/setup?step=review')
    expect(screen.getByText('Not set up.')).toBeTruthy()
    expect(screen.getByText(/Agents can.t think or talk until you add a provider/)).toBeTruthy()
    expect(screen.getByText('Answers once a model provider is added.')).toBeTruthy()
    cleanup()
    queries({ getAiProviders: [provider('assemblyai', 'AssemblyAI', ['stt']), provider('inworld', 'Inworld', ['tts'])] })
    setup(undefined, {}, '/setup?step=review')
    expect(screen.getByText('Model: Not set.')).toBeTruthy()
    expect(screen.getByText('Hearing and speaking set.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(mocks.complete).toHaveBeenCalled())
  })
})

describe('Setup opens where it stopped, in four steps @SC-1182 @SC-1184', () => {
  it('opens at the organisation until it is saved, then at the last look: AI is never the resume step', () => {
    queries({ getSetupResume: { step: 'organisation' } })
    setup(undefined, {}, '/setup')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your organisation')
    expect(screen.getByText(/^Step 2 of 4/)).toBeTruthy()
    cleanup()
    queries({ getSetupResume: { step: 'review' } })
    setup(undefined, {}, '/setup')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Check everything before you start')
    expect(screen.getByText(/^Step 4 of 4/)).toBeTruthy()
  })

  it('carries the step in the address, and ignores a path or a removed step', () => {
    setup(undefined, {}, '/setup?step=ai&path=cloud')
    expect(screen.getByText(/^Step 3 of 4/)).toBeTruthy()
    cleanup()
    setup(undefined, {}, '/setup?step=voice')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Your organisation')
  })

  it('goes from the AI step to the last look, and Back from it to the organisation', async () => {
    setup(undefined, {}, '/setup?step=ai')
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByRole('heading', { name: 'Check everything before you start' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('heading', { name: 'Your organisation' })).toBeTruthy()
  })

  it('returns to the last look from Edit on the AI row once Continue is chosen', async () => {
    setup(undefined, {}, '/setup?step=review')
    fireEvent.click(screen.getByRole('button', { name: 'Edit AI' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByText(/^Step 4 of 4/)).toBeTruthy()
  })

  it('shows the organisation\'s sign-in page beside every step after the organisation @SC-1668', () => {
    for (const step of ['ai', 'review']) {
      setup(undefined, {}, `/setup?step=${step}`)
      expect(screen.getByTestId('sign-in-preview').textContent).toContain("to My Organisation's HQ")
      expect(screen.queryByTestId('brand-side')).toBeNull()
      cleanup()
    }
    setup(undefined, {}, '/setup?step=you')
    expect(screen.getByTestId('brand-side')).toBeTruthy()
  })

  it('keeps every step\'s buttons in one row pinned to the foot of the window @SC-1668', () => {
    setup()
    expect(screen.getByRole('button', { name: 'Continue' }).closest('[data-action-row]')).toBeTruthy()
  })
})
