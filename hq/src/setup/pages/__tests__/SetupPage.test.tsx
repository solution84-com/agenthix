// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation, useNavigate } from 'react-router'

const mocks = vi.hoisted(() => ({
  data: undefined as unknown, login: { present: false } as { present: boolean }, orgKey: { present: false } as { present: boolean }, orgKeys: {} as Record<string, boolean>, deleteCred: vi.fn(), refetch: vi.fn(), complete: vi.fn(), update: vi.fn(), setName: vi.fn(), upload: vi.fn(), remove: vi.fn(),
}))
vi.mock('wasp/client/operations', () => ({
  getSetupData: 'getSetupData',
  getWhereHqRuns: 'getWhereHqRuns',
  completeSetup: (...a: unknown[]) => mocks.complete(...a),
  setPersonName: (...a: unknown[]) => mocks.setName(...a),
  updateOrgIdentity: (...a: unknown[]) => mocks.update(...a),
  uploadOrgImage: (...a: unknown[]) => mocks.upload(...a),
  removeOrgImage: (...a: unknown[]) => mocks.remove(...a),
  getModelCredentialStatus: 'getModelCredentialStatus',
  deleteModelCredential: (...a: unknown[]) => mocks.deleteCred(...a),
  useAction: (fn: (...a: unknown[]) => unknown) => fn,
  useQuery: (q: string, args?: { kind?: string; provider?: string }) => {
    const [, setTick] = React.useState(0)
    return q === 'getModelCredentialStatus'
      ? { data: args?.kind === 'API_KEY' ? { present: mocks.orgKey.present || !!mocks.orgKeys[args.provider ?? ''] } : mocks.login, refetch: () => { mocks.refetch(); setTick(t => t + 1) } }
      : { data: mocks.data, isLoading: mocks.data === undefined, refetch: mocks.refetch }
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
vi.mock('../../../model-access/pages/ModelAccessPanel', () => ({ ModelAccessPanel: () => <span>model access menu</span> }))

import { SetupPage } from '../SetupPage'

function Where() { const navigate = useNavigate(); return <><output data-testid="where">{useLocation().pathname}</output><button type="button" onClick={() => navigate(-1)}>browser back</button></> }
const setup = (hqSite: unknown = { state: 'connected', dockerRunning: true }, over: Record<string, unknown> = {}, entry = '/setup?step=organisation') => {
  mocks.data = { org: { id: 'o', name: 'My Organisation', handle: null, vision: '', mission: '', avatarUrl: null, coverUrl: null }, needsSetup: true, setupComplete: false, isAdmin: true, hqSite, me: { id: 'u1', displayName: 'Dana Ruiz', username: 'dana' }, ...over }
  render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/setup" element={<><SetupPage /><Where /></>} /><Route path="*" element={<Where />} /></Routes></MemoryRouter>)
}
const toModelStep = async () => {
  fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  await screen.findByText('Agents need a model to answer. Add at least one — you can change this any time.')
}

beforeEach(() => {
  mocks.login = { present: false }; mocks.orgKey = { present: false }; mocks.orgKeys = {}; mocks.deleteCred.mockReset().mockImplementation(async () => { mocks.login = { present: false } }); mocks.refetch.mockReset(); mocks.complete.mockReset().mockResolvedValue({ done: true })
  mocks.setName.mockReset().mockResolvedValue({ displayName: 'x' }); mocks.update.mockReset().mockResolvedValue({ ok: true }); mocks.upload.mockReset().mockImplementation(async ({ type }: { type: string }) => ({ url: `/org/images/${type}.jpg` })); mocks.remove.mockReset().mockResolvedValue({ ok: true })
})
afterEach(cleanup)

describe('Setup @SC-710', () => {
  it('opens on the organisation step, beside the sign-in page it makes, which follows the name', () => {
    setup()
    expect(screen.getByText('Step 2 of 4')).toBeTruthy()
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
    await toModelStep()
    expect(within(screen.getByTestId('sign-in-preview')).getByTestId('org-cover-banner').querySelector('img')?.getAttribute('src')).toBe('/org/images/c.jpg')
  })

  it('heads the form with the Agenthix mark and name and has no Powered by footer; only the preview, which is the organisation\'s page, keeps it', () => {
    setup()
    expect(screen.getByTestId('setup-brand').textContent).toBe('Agenthix')
    const footers = screen.getAllByText('Powered by Agenthix')
    expect(footers).toHaveLength(1)
    expect(screen.getByTestId('sign-in-preview').contains(footers[0])).toBe(true)
  })

  it('keeps step 3 on a refresh, showing what step 2 saved from the server', () => {
    setup(undefined, { org: { id: 'o', name: 'Acme Corp', handle: null, vision: '', mission: '', avatarUrl: null, coverUrl: null } }, '/setup?step=model')
    expect(screen.getByText('Step 3 of 4')).toBeTruthy()
    expect(screen.getByTestId('sign-in-preview').textContent).toContain("to Acme Corp's HQ")
  })

  it('goes back from step 3 to step 2 with the browser Back', async () => {
    setup()
    await toModelStep()
    fireEvent.click(screen.getByRole('button', { name: 'browser back' }))
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
  })

  it('goes back from step 2 to step 1, which shows the account with the name filled in', async () => {
    setup()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Step 1 of 4')).toBeTruthy()
    expect((screen.getByLabelText(/^Your name/) as HTMLInputElement).value).toBe('Dana Ruiz')
    expect(screen.getByText('dana')).toBeTruthy()
    expect(screen.getByText('Set')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull()
  })

  it('saves an edited name on step 1 and continues to step 2; Back on step 3 returns to step 2', async () => {
    setup(undefined, {}, '/setup?step=you')
    fireEvent.change(screen.getByLabelText(/^Your name/), { target: { value: 'Dana R. Ruiz' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
    expect(mocks.setName).toHaveBeenCalledWith({ userId: 'u1', displayName: 'Dana R. Ruiz' })
    await toModelStep()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
  })

  it('starts at the beginning for an unknown step', () => {
    setup(undefined, {}, '/setup?step=nonsense')
    expect(screen.getByText('Step 1 of 4')).toBeTruthy()
  })

  it('saves the name, then asks for model access with one line, and no site line while the site is connected', async () => {
    setup()
    await toModelStep()
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Acme Corp' })
    expect(screen.getByText('Step 3 of 4')).toBeTruthy()
    expect(screen.getByText('model access menu')).toBeTruthy()
    expect(screen.queryByText(/HQ's site/)).toBeNull()
  })

  it('reads Skip for now while nothing is set, and Continue once something is', async () => {
    setup()
    await toModelStep()
    expect(screen.getByRole('button', { name: 'Skip for now' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull()
    cleanup()
    mocks.orgKeys = { openai: true }
    setup()
    await toModelStep()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Skip for now' })).toBeNull()
  })

  it('counts the person\'s own Claude login as set', async () => {
    mocks.login = { present: true }
    setup()
    await toModelStep()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy()
  })

  it('has Back and Skip for now on step 3, no Finish or Later, and it opens the review without model access', async () => {
    setup()
    await toModelStep()
    expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Later' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByText('Step 4 of 4')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Check everything before you start')
    expect(screen.getByTestId('sign-in-preview')).toBeTruthy()
    expect(screen.getByText(/agents can't answer until one is set/)).toBeTruthy()
  })

  it('shows on the review what the server holds, after a refresh', () => {
    mocks.login = { present: true }
    setup(undefined, { org: { id: 'o', name: 'Acme Corp', handle: null, vision: '', mission: '', avatarUrl: '/org/images/a.jpg', coverUrl: '/org/images/c.jpg' } }, '/setup?step=review')
    expect(screen.getByText('Dana Ruiz')).toBeTruthy()
    expect(screen.getByText('dana')).toBeTruthy()
    expect(screen.getAllByText('Acme Corp').length).toBeGreaterThan(0)
    expect(screen.getByAltText('Your picture').getAttribute('src')).toBe('/org/images/a.jpg')
    expect(screen.getByAltText('Your cover').getAttribute('src')).toBe('/org/images/c.jpg')
    expect(screen.getByText('Claude subscription')).toBeTruthy()
  })

  it('lists the Claude login and each organisation key by provider on the review', () => {
    mocks.login = { present: true }
    mocks.orgKeys = { openai: true, google: true }
    setup(undefined, {}, '/setup?step=review')
    expect(screen.getByText('Claude subscription')).toBeTruthy()
    expect(screen.getByText('OpenAI key')).toBeTruthy()
    expect(screen.getByText('GPT models')).toBeTruthy()
    expect(screen.getByText('Google Gemini key')).toBeTruthy()
    expect(screen.getByText('Gemini models')).toBeTruthy()
    expect(screen.queryByText('Anthropic key')).toBeNull()
  })

  it('opens a step from Edit on the review and returns to the review on Continue', async () => {
    setup(undefined, {}, '/setup?step=review')
    fireEvent.click(screen.getByRole('button', { name: 'Edit your organisation' }))
    expect(await screen.findByText('Step 2 of 4')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme Corp' } })
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Step 4 of 4')).toBeTruthy()
    expect(mocks.update).toHaveBeenCalledWith({ name: 'Acme Corp' })
    fireEvent.click(screen.getByRole('button', { name: 'Edit model access' }))
    expect(await screen.findByText('Step 3 of 4')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByText('Step 4 of 4')).toBeTruthy()
  })

  it('finishes from the review, and Home follows', async () => {
    setup(undefined, {}, '/setup?step=review')
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(mocks.complete).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/'))
  })

  it('shows the site line on step 3 only when HQ\'s site is not connected, lets setup finish, and checks again on request @SC-711', async () => {
    setup({ state: 'notConnected', dockerRunning: null })
    await toModelStep()
    expect(screen.getByText("HQ's site isn't connected, so Sign in with Claude won't work until it is.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Check again' }))
    expect(mocks.refetch).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(await screen.findByText("HQ's site isn't connected, so Sign in with Claude won't work until it is.")).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Finish' }))
    await waitFor(() => expect(mocks.complete).toHaveBeenCalled())
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
    expect((await screen.findByRole('alert')).textContent).toBe('The organisation needs a name')
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
