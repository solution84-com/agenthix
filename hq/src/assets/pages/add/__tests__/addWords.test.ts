import { describe, it, expect } from 'vitest'
import { dialogState, installedWords, sourceWords, titleOf } from '../installWords'
import { packageFilesView, PACKAGE_TEXT_LIMIT } from '../packageFiles'
import { hasUpload, linkReady, NO_UPLOAD } from '../packageSource'
import type { InstallPreview } from '../../../install/types'

const preview = (over: Partial<InstallPreview>): InstallPreview => ({
  source: 'upload', sourceUrl: null, state: 'trusted', publisher: 'acme', publisherFixed: true, signer: null, signedBy: null, trustRoot: null,
  kind: 'skill', name: 'seo-audit', version: '2.0.0', title: 'SEO Audit', description: '', licence: null, fingerprint: 'f',
  main: {} as never, embedded: [], summary: '', warnings: [], refusal: null, needs: { unsignedRead: false, publisherChoice: false }, ...over,
})

describe('the four install states and their words', () => {
  it('maps a check to its dialog: trusted, a new publisher, unsigned, or refused with no override', () => {
    expect(dialogState(preview({ state: 'trusted' }))).toBe('trusted')
    expect(dialogState(preview({ state: 'built-in' }))).toBe('trusted')
    expect(dialogState(preview({ state: 'new-publisher' }))).toBe('new-publisher')
    expect(dialogState(preview({ state: 'unsigned' }))).toBe('unsigned')
    expect(dialogState(preview({ state: 'tampered', refusal: 'This was changed after it was signed.' }))).toBe('refused')
  })

  it('titles the dialog by what it asks, and says "Can\'t install" for a refusal', () => {
    expect(titleOf(preview({}))).toBe('Install SEO Audit?')
    expect(titleOf(preview({ refusal: 'no' }))).toBe("Can't install SEO Audit")
  })

  it('says where it came from', () => {
    expect(sourceWords({ source: 'upload', sourceUrl: null })).toBe('uploaded')
    expect(sourceWords({ source: 'image', sourceUrl: null })).toBe('from Agenthix')
    expect(sourceWords({ source: 'url', sourceUrl: 'https://github.com/acme/skills/releases/download/v2.0/seo-audit.zip' })).toBe('from github.com/acme/skills/releases/download/v2.0/seo-audit.zip')
  })

  it('says what it did and what comes next, without claiming an agent has it', () => {
    expect(installedWords('Bug Reporting', '1.0.0', 'new')).toBe('Bug Reporting 1.0.0 is in the Library. No agent has it yet.')
    expect(installedWords('Code Review', '1.4.0', 'update')).toContain('until you update it')
    expect(installedWords('Code Review', '1.3.0', 'same')).toContain('Nothing new was installed')
  })
})

describe('reading a package before installing it', () => {
  const arrival = (files: Array<{ path: string; content: Buffer }>) => ({ source: 'upload' as const, arrived: { root: 'x', files }, bundle: null, sourceUrl: null })

  it('returns text files as text, and a binary or oversized file as not shown', () => {
    const view = packageFilesView(arrival([
      { path: 'SKILL.md', content: Buffer.from('# Hi') },
      { path: 'logo.png', content: Buffer.from([1, 0, 2]) },
      { path: 'big.txt', content: Buffer.alloc(PACKAGE_TEXT_LIMIT + 1, 97) },
    ]))
    expect(view.files).toEqual([
      { path: 'SKILL.md', size: 4, text: '# Hi' },
      { path: 'big.txt', size: PACKAGE_TEXT_LIMIT + 1, text: null },
      { path: 'logo.png', size: 3, text: null },
    ])
    expect(view.more).toBe(0)
  })

  it('counts the files it leaves out', () => {
    const files = Array.from({ length: 65 }, (_, i) => ({ path: `f${String(i).padStart(2, '0')}.md`, content: Buffer.from('x') }))
    const view = packageFilesView(arrival(files))
    expect(view.files).toHaveLength(60)
    expect(view.more).toBe(5)
  })
})

describe('choosing a package', () => {
  it('needs a file or a link before it can be checked', () => {
    expect(hasUpload(NO_UPLOAD)).toBe(false)
    expect(hasUpload({ ...NO_UPLOAD, zip: new File(['x'], 'a.zip') })).toBe(true)
    expect(linkReady('  ')).toBe(false)
    expect(linkReady('https://example.com/a.zip')).toBe(true)
  })
})
