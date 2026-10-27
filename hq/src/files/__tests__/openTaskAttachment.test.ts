/** Opening a task's attachment (spec part 3, *A task's files*): the order of the checks, and the answer the frame takes. */
import { describe, it, expect, vi } from 'vitest'
import type { FileTicketInput, RelayAddress } from '@agenthix/core'
import { openTaskAttachment, type OpenTaskAttachmentDeps } from '../openTaskAttachment'

const PATH = '/files/task/t1/u1/q3 report.pdf'
const FILES: RelayAddress = { origin: 'https://files.example.com', door: 'files-address' }
const BARE: RelayAddress = { origin: 'https://hq.example.com', door: 'bare-address' }

function deps(over: Partial<OpenTaskAttachmentDeps> = {}) {
  let n = 0
  const d = {
    find: vi.fn(async () => ({ path: PATH, name: 'q3 report.pdf' })),
    access: vi.fn(async () => ({ size: 1200, mtimeMs: 1793008800000 })),
    hqRelay: vi.fn(async () => ({ id: 'relay-hq', address: FILES })),
    hqRelayName: () => "hq-box · HQ's relay",
    looksLikeText: vi.fn(async () => false),
    issue: vi.fn(async (_input: FileTicketInput) => ({ token: `h.t${++n}.s`, expiresAt: 1_000_000 + n })),
  }
  return { ...d, ...over } as typeof d
}

describe('opening a task attachment @SC-1516', () => {
  it('answers ready with the facts, a preview and a download on hq\'s relay, both upload tickets for this person', async () => {
    const d = deps()
    const answer = await openTaskAttachment('att1', 'me', d)
    expect(answer).toEqual({
      state: 'ready',
      facts: { name: 'q3 report.pdf', size: 1200, version: '1200:1793008800000', contentType: 'application/pdf', kind: 'pdf' },
      downloadLink: 'https://files.example.com/t/h.t1.s',
      previewLink: 'https://files.example.com/t/h.t2.s',
      expiresAt: 1_000_001,
    })
    expect(d.issue.mock.calls.map(([input]) => input)).toEqual([
      { space: 'upload', path: PATH, purpose: 'download', version: '1200:1793008800000', person: 'me', relay: 'relay-hq' },
      { space: 'upload', path: PATH, purpose: 'preview', version: '1200:1793008800000', person: 'me', relay: 'relay-hq' },
    ])
  })

  it('chooses the kind from the name and the first bytes', async () => {
    const text = await openTaskAttachment('att1', 'me', deps({
      find: vi.fn(async () => ({ path: '/files/task/t1/u1/notes.md', name: 'notes.md' })), looksLikeText: vi.fn(async () => true),
    }))
    expect(text.state === 'ready' && text.facts.kind).toBe('markdown')
    const binary = await openTaskAttachment('att1', 'me', deps({
      find: vi.fn(async () => ({ path: '/files/task/t1/u1/notes.md', name: 'notes.md' })), looksLikeText: vi.fn(async () => false),
    }))
    expect(binary.state === 'ready' && binary.facts.kind).toBe('none')
  })

  it('answers not-found, signing nothing and looking at nothing, for no such attachment or someone not allowed', async () => {
    for (const d of [deps({ find: vi.fn(async () => null) }), deps({ access: vi.fn(async () => null) })]) {
      expect(await openTaskAttachment('att1', 'me', d)).toEqual({ state: 'not-found' })
      expect(d.hqRelay).not.toHaveBeenCalled()
      expect(d.looksLikeText).not.toHaveBeenCalled()
      expect(d.issue).not.toHaveBeenCalled()
    }
  })

  it('checks access before asking for hq\'s relay', async () => {
    const order: string[] = []
    const d = deps({
      access: vi.fn(async () => { order.push('access'); return { size: 1, mtimeMs: 1 } }),
      hqRelay: vi.fn(async () => { order.push('relay'); return { id: 'r', address: FILES } }),
    })
    await openTaskAttachment('att1', 'me', d)
    expect(order).toEqual(['access', 'relay'])
  })

  it('says hq\'s relay isn\'t answering, before reading or signing anything', async () => {
    const d = deps({ hqRelay: vi.fn(async () => null) })
    expect(await openTaskAttachment('att1', 'me', d)).toEqual({ state: 'relay-unavailable', siteName: 'HQ', relayName: "hq-box · HQ's relay" })
    expect(d.looksLikeText).not.toHaveBeenCalled()
    expect(d.issue).not.toHaveBeenCalled()
  })

  it('offers only the download of a PDF where hq has no files address @SC-1512', async () => {
    const d = deps({ hqRelay: vi.fn(async () => ({ id: 'relay-hq', address: BARE })) })
    const answer = await openTaskAttachment('att1', 'me', d)
    expect(answer).toMatchObject({ state: 'no-files-address', downloadLink: 'https://hq.example.com/relay/t/h.t1.s' })
    expect(d.issue).toHaveBeenCalledTimes(1)
  })
})
