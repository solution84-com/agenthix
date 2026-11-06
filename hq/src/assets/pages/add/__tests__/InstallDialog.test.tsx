// @vitest-environment jsdom
/** The four install states, each in its own words (skills spec part 3; board U4), and what comes with a template. */
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'

const preview = vi.fn()
const install = vi.fn()
const library: { rows: object[] } = { rows: [] }

vi.mock('wasp/client/operations', () => ({
  previewAssetInstall: { name: 'previewAssetInstall' },
  installAsset: { name: 'installAsset' },
  getLibraryAssets: { name: 'getLibraryAssets' },
  getPackageFiles: { name: 'getPackageFiles' },
  useQuery: () => ({ data: library }),
  useAction: (op: { name: string }) => (op.name === 'previewAssetInstall' ? preview : install),
}))

import { InstallDialog } from '../InstallDialog'
import type { InstallPreview } from '../../../install/types'

const item = (over: object = {}) => ({ kind: 'skill', identity: 'acme/seo-audit', publisher: 'acme', name: 'seo-audit', title: 'SEO Audit', version: '2.0.0', fingerprint: 'f', outcome: 'new', installedVersion: null, held: false, existingId: null, reason: null, ...over })
const base = (over: Partial<InstallPreview> = {}): InstallPreview => ({
  source: 'url', sourceUrl: 'https://github.com/acme/skills/releases/download/v2.0/seo-audit.zip', state: 'trusted', publisher: 'acme', publisherFixed: true,
  signer: null, signedBy: 'github.com/acme/skills', trustRoot: null, kind: 'skill', name: 'seo-audit', version: '2.0.0', title: 'SEO Audit', description: '', licence: null,
  fingerprint: 'fp1', main: item() as never, embedded: [], summary: 'Installs SEO Audit 2.0.0 as acme/seo-audit.', warnings: [], refusal: null,
  needs: { unsignedRead: false, publisherChoice: false }, ...over,
})
const SOURCE = { from: 'url' as const, link: 'https://github.com/acme/skills/releases/download/v2.0/seo-audit.zip' }

async function open(p: InstallPreview, onInstalled = vi.fn()) {
  preview.mockResolvedValue(p)
  install.mockResolvedValue({ assetId: 'a1', identity: p.main.identity, version: p.version, outcome: 'new', message: 'ok' })
  render(<InstallDialog source={SOURCE} onClose={() => {}} onInstalled={onInstalled} />)
  await waitFor(() => expect(screen.queryByText('Checking…')).toBeNull())
  return onInstalled
}

beforeEach(() => { library.rows = []; preview.mockReset(); install.mockReset() })
afterEach(cleanup)

describe('signed by someone trusted @SC-1612', () => {
  it('says who signed it, and installs on one click naming the fingerprint that was shown', async () => {
    const done = await open(base())
    expect(screen.getByRole('heading', { name: 'Install SEO Audit?' })).toBeTruthy()
    expect(screen.getByText(/✓ Signed by acme/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(install).toHaveBeenCalledWith({ ...SOURCE, confirm: { fingerprint: 'fp1' } })
  })
})

describe('signed by someone new @SC-1612', () => {
  const newcomer = () => base({ state: 'new-publisher', publisher: 'acme', publisherFixed: false, needs: { unsignedRead: false, publisherChoice: true } })

  it('names the signer, warns that a signature is not a safety check, and offers to trust them or install once', async () => {
    await open(newcomer())
    expect(screen.getByText(/You haven't installed anything from them before/)).toBeTruthy()
    expect(screen.getByText(/A signature tells you who published it, not that it's safe/)).toBeTruthy()
    expect((screen.getByLabelText('Call this publisher') as HTMLInputElement).value).toBe('Acme')
    expect(screen.getByText('Later versions signed the same way install without asking')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Trust Acme and install' })).toBeTruthy()
  })

  it('trusts by default, and installs once when asked', async () => {
    const done = await open(newcomer())
    fireEvent.click(screen.getByLabelText(/Install this once/))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(install.mock.calls[0]![0].confirm).toEqual({ fingerprint: 'fp1', newPublisher: { choice: 'once', name: 'acme', displayName: 'Acme' } })
  })

  it('offers a person who may not trust only "Install this once", and sends that choice', async () => {
    const done = await open({ ...newcomer(), mayTrust: false })
    expect(screen.queryByRole('button', { name: /Trust .* and install/ })).toBeNull()
    expect(screen.queryByLabelText(/Trust Acme and install/)).toBeNull()
    expect((screen.getByLabelText(/Install this once/) as HTMLInputElement).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(install.mock.calls[0]![0].confirm.newPublisher.choice).toBe('once')
  })

  it('asks first when a skill of that name from another signer is already here, and keeps the one you have by default', async () => {
    library.rows = [{ kind: 'skill', identity: 'acme/seo-audit', version: '2.0.0', signer: 'Signed by Acme (github.com/acme)' }]
    preview.mockResolvedValue({ ...newcomer(), main: item({ identity: 'acme-tools/seo-audit' }), version: '2.1.0', signedBy: 'github.com/acme-tools/skills' })
    render(<InstallDialog source={SOURCE} onClose={() => {}} onInstalled={() => {}} />)
    await waitFor(() => expect(screen.getByTestId('different-signer')).toBeTruthy())
    expect(screen.getByText(/That's not the publisher you trusted/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Keep 2.0.0' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Treat as a new publisher…' }))
    expect(screen.getByText(/You haven't installed anything from them before/)).toBeTruthy()
  })
})

describe('unsigned @SC-1612', () => {
  it("says it isn't signed, and keeps Install off until “I've read it” is ticked", async () => {
    const done = await open(base({ state: 'unsigned', publisher: 'unsigned', signedBy: null, needs: { unsignedRead: true, publisherChoice: false } }))
    expect(screen.getByText(/This isn't signed\. Agenthix can't tell who made it or whether it was changed on the way\. Read it before you install it\./)).toBeTruthy()
    const button = screen.getByRole('button', { name: 'Add' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
    fireEvent.click(screen.getByLabelText("I've read it"))
    expect(button.disabled).toBe(false)
    fireEvent.click(button)
    await waitFor(() => expect(done).toHaveBeenCalled())
    expect(install.mock.calls[0]![0].confirm).toEqual({ fingerprint: 'fp1', unsignedRead: true })
  })
})

describe("a signature that doesn't match @SC-1612", () => {
  it('refuses with no way to install, only Close', async () => {
    await open(base({ state: 'tampered', refusal: "This was changed after it was signed. It won't be installed. Nothing was changed." }))
    expect(screen.getByRole('heading', { name: "Can't install SEO Audit" })).toBeTruthy()
    expect(screen.getByRole('alert').textContent).toContain("This was changed after it was signed. It won't be installed.")
    expect(screen.queryByRole('button', { name: 'Add' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy()
  })
})

describe('a template @SC-1612 @SC-1618', () => {
  it('says what comes with it: its role skills, the ones you have, and the newer ones offered after install', async () => {
    await open(base({
      kind: 'agent', title: 'Project manager', main: item({ kind: 'agent', identity: 'agenthix/project-manager', name: 'project-manager', title: 'Project manager' }) as never,
      embedded: [
        item({ identity: 'agenthix/project-manager/read-context', name: 'project-manager/read-context', title: 'Read context' }),
        item({ identity: 'agenthix/pm-sprint-planning', name: 'pm-sprint-planning', title: 'Sprint Planning', version: '1.3.0', outcome: 'same', installedVersion: '1.3.0' }),
        item({ identity: 'agenthix/dev-code-review', name: 'dev-code-review', title: 'Code Review', version: '1.4.0', outcome: 'update', installedVersion: '1.3.0' }),
      ] as never,
    }))
    const brings = screen.getByTestId('template-brings')
    expect(brings.textContent).toContain('It brings 3 skills:')
    expect(brings.textContent).toContain('1 for its role: read-context')
    expect(brings.textContent).toContain('Sprint Planning 1.3.0, shared, not copied')
    expect(brings.textContent).toContain('Code Review 1.4.0 (you have 1.3.0). Update offered after install')
    expect(brings.textContent).toContain("Installing the template doesn't add it to anyone.")
  })
})
