import { describe, it, expect, vi } from 'vitest'
import type { FileAboutResult, FileTicketInput, SiteFileRef } from '@agenthix/core'
import { openFile, OpenRefused, type OpenFileDeps, type SiteAndRelay } from '../openFile'

const ref: SiteFileRef = { space: 'place', loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null }, path: 'docs/plan.md' }
const about = (name = 'plan.md', looksLikeText = true): FileAboutResult =>
  ({ ok: true, name, size: 120, modifiedAt: '2026-10-26T10:00:00.000Z', version: '120:1793008800000', contentType: 'text/markdown', looksLikeText })
const held: SiteAndRelay = { siteId: 'site-1', siteName: 'office-server', relay: { id: 'relay-1', name: 'relay-2', isHq: false, address: 'https://files-2.example.com', usable: true } }

function deps(over: Partial<OpenFileDeps> = {}) {
  const issued: FileTicketInput[] = []
  let n = 0
  const d: OpenFileDeps = {
    checkAccess: async r => r,
    siteFor: async () => 'site-1',
    siteAndRelay: async () => held,
    isRelayConnected: () => true,
    about: async () => about(),
    browserAddressOf: () => ({ origin: 'https://files-2.example.com', door: 'files-address' }),
    issue: async input => { issued.push(input); n += 1; return { token: `h.p${n}.s`, expiresAt: 1000 * n } },
    ...over,
  }
  return { d, issued }
}

describe('opening a file @SC-1509', () => {
  it('answers the facts, the kind and both links on the relay, each ticket at the file\'s version', async () => {
    const { d, issued } = deps()
    const answer = await openFile(ref, 'u1', d)
    expect(answer).toEqual({
      state: 'ready',
      facts: { name: 'plan.md', size: 120, version: '120:1793008800000', contentType: 'text/markdown', kind: 'markdown' },
      downloadLink: 'https://files-2.example.com/t/h.p1.s',
      previewLink: 'https://files-2.example.com/t/h.p2.s',
      expiresAt: 1000,
    })
    expect(issued.map(i => i.purpose)).toEqual(['download', 'preview'])
    expect(issued[0]).toMatchObject({ ...ref, version: '120:1793008800000', person: 'u1', site: 'site-1', relay: 'relay-1' })
  })

  it('gives code its language', async () => {
    const { d } = deps({ about: async () => about('main.py') })
    expect(await openFile(ref, 'u1', d)).toMatchObject({ facts: { kind: 'code', language: 'python' } })
  })

  it('answers not-found, asking nothing and signing nothing, when the person may not read it @SC-1510 @SC-1570', async () => {
    const about = vi.fn()
    const { d, issued } = deps({ checkAccess: async () => { throw new OpenRefused('not-found') }, about })
    expect(await openFile(ref, 'u1', d)).toEqual({ state: 'not-found' })
    expect(about).not.toHaveBeenCalled()
    expect(issued).toEqual([])
  })

  it('answers relay-unavailable at once, without asking the site or signing, when the relay is not connected @SC-1511', async () => {
    const about = vi.fn()
    const { d, issued } = deps({ isRelayConnected: () => false, about })
    expect(await openFile(ref, 'u1', d)).toEqual({ state: 'relay-unavailable', siteName: 'office-server', relayName: 'relay-2' })
    expect(about).not.toHaveBeenCalled()
    expect(issued).toEqual([])
  })

  it('answers relay-unavailable for a relay with no address a browser can reach @SC-1511', async () => {
    const { d } = deps({ browserAddressOf: () => null })
    expect(await openFile(ref, 'u1', d)).toMatchObject({ state: 'relay-unavailable' })
  })

  it('answers no-relay for a site with none, or only a removed one @SC-1511', async () => {
    expect(await openFile(ref, 'u1', deps({ siteAndRelay: async () => ({ ...held, relay: null }) }).d))
      .toEqual({ state: 'no-relay', siteName: 'office-server' })
    expect(await openFile(ref, 'u1', deps({ siteAndRelay: async () => ({ ...held, relay: { ...held.relay!, usable: false } }) }).d))
      .toEqual({ state: 'no-relay', siteName: 'office-server' })
  })

  it('answers site-unavailable when the site does not answer, and signs nothing @SC-1511', async () => {
    const { d, issued } = deps({ about: async () => { throw new OpenRefused('site-unavailable') } })
    expect(await openFile(ref, 'u1', d)).toEqual({ state: 'site-unavailable' })
    expect(issued).toEqual([])
  })

  it('answers not-found when the site says it is not there or not a file @SC-1510', async () => {
    const { d, issued } = deps({ about: async () => ({ ok: false, refusal: 'not-a-file' }) })
    expect(await openFile(ref, 'u1', d)).toEqual({ state: 'not-found' })
    expect(issued).toEqual([])
  })

  it('answers linked, with nothing signed, when the site says the file is hard-linked', async () => {
    const { d, issued } = deps({ about: async () => ({ ok: false, refusal: 'linked' }) })
    expect(await openFile(ref, 'u1', d)).toEqual({ state: 'linked' })
    expect(issued).toEqual([])
  })

  it('answers no-files-address for a PDF on a bare address, with a download only @SC-1512', async () => {
    const { d, issued } = deps({
      about: async () => about('q3.pdf', false),
      browserAddressOf: () => ({ origin: 'http://192.168.1.20', door: 'bare-address' }),
    })
    expect(await openFile(ref, 'u1', d)).toEqual({
      state: 'no-files-address',
      facts: { name: 'q3.pdf', size: 120, version: '120:1793008800000', contentType: 'application/pdf', kind: 'pdf' },
      downloadLink: 'http://192.168.1.20/relay/t/h.p1.s',
      expiresAt: 1000,
    })
    expect(issued.map(i => i.purpose)).toEqual(['download'])
  })

  it('previews text on a bare address through the bare door @SC-1512', async () => {
    const { d } = deps({ browserAddressOf: () => ({ origin: 'http://192.168.1.20', door: 'bare-address' }) })
    expect(await openFile(ref, 'u1', d)).toMatchObject({ state: 'ready', previewLink: 'http://192.168.1.20/relay/t/h.p2.s' })
  })

  it('answers not-found for a site hq no longer knows @SC-1510 @SC-1511', async () => {
    expect(await openFile(ref, 'u1', deps({ siteAndRelay: async () => null }).d)).toEqual({ state: 'not-found' })
  })

  it('lets any other failure through @SC-1511', async () => {
    const { d } = deps({ issue: async () => { throw new Error('no key') } })
    await expect(openFile(ref, 'u1', d)).rejects.toThrow('no key')
  })
})
