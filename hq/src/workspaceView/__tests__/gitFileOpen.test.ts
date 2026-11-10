/**
 * hq's open for a Git workspace's file at a commit (review 2, N3): a binary file at an older version is answered by its
 * kind, with a preview and a download ticket that both name that commit and the file's blob id, so the relay carries
 * its bytes from the site's read of that commit. Nothing of it is read as text through hq.
 */
import { describe, it, expect } from 'vitest'
import { readFileRef, type FileAboutResult, type FileTicketInput, type SiteFileRef } from '@agenthix/core'
import { openFile, type OpenFileDeps } from '../../files/openFile'
import { gitFileRef } from '../components/GitFileMiddle'

const workspace = { id: 'w1', name: 'sales-report', ownerType: 'project' as const, ownerId: 'p1' }
const V1 = 'a'.repeat(40)
const BLOB = 'd'.repeat(40)

function deps(about: FileAboutResult) {
  const issued: FileTicketInput[] = []
  const asked: SiteFileRef[] = []
  const d: OpenFileDeps = {
    checkAccess: async r => r,
    siteFor: async () => 'site-1',
    siteAndRelay: async () => ({ siteId: 'site-1', siteName: 'office-server', relay: { id: 'relay-1', name: 'HQ', isHq: true, address: null, usable: true } }),
    isRelayConnected: () => true,
    about: async (_site, ref) => { asked.push(ref); return about },
    browserAddressOf: () => ({ origin: 'https://files.example.com', door: 'files-address' }),
    issue: async input => { issued.push(input); return { token: `h.p${issued.length}.s`, expiresAt: 1000 } },
  }
  return { d, issued, asked }
}

describe('a Git workspace\'s binary file at a version @SC-1686', () => {
  it('is an image with both tickets naming its commit and blob id', async () => {
    const ref = readFileRef(gitFileRef(workspace, 'images/revenue-by-month.png', V1)) as SiteFileRef
    expect(ref).toMatchObject({ commit: V1 })
    const { d, issued, asked } = deps({
      ok: true, name: 'revenue-by-month.png', size: 5300, modifiedAt: '2026-11-01T10:00:00.000Z', version: BLOB,
      contentType: 'image/png', looksLikeText: false,
    })
    const answer = await openFile(ref, 'u1', d)
    expect(answer).toMatchObject({
      state: 'ready', facts: { kind: 'image', version: BLOB, size: 5300 },
      previewLink: 'https://files.example.com/t/h.p2.s', downloadLink: 'https://files.example.com/t/h.p1.s',
    })
    expect(asked).toEqual([ref])
    expect(issued.map(i => [i.purpose, (i as { commit?: string }).commit, i.version])).toEqual([['download', V1, BLOB], ['preview', V1, BLOB]])
  })

  it('is a PDF drawn by its viewer, not its source as text', async () => {
    const ref = readFileRef(gitFileRef(workspace, 'report/q3-sales-report.pdf', V1)) as SiteFileRef
    const { d } = deps({
      ok: true, name: 'q3-sales-report.pdf', size: 26_000, modifiedAt: '2026-11-01T10:00:00.000Z', version: BLOB,
      contentType: 'application/pdf', looksLikeText: true,
    })
    expect(await openFile(ref, 'u1', d)).toMatchObject({ state: 'ready', facts: { kind: 'pdf' } })
  })
})
