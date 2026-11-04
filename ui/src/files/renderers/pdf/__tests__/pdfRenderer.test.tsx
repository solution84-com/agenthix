import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import type { FileOpenAnswer } from '@agenthix/core'
import { FileFrame } from '../../../FileFrame'
import { MB, PREVIEW, facts, ready } from '../../../__tests__/testKit'
import { pdfRenderer, viewerSource } from '../pdfRenderer'

const FILES_ORIGIN = 'https://files.example.org'
const pdf = (over: Parameters<typeof ready>[0] = {}) =>
  ready({ name: 'q3.pdf', kind: 'pdf', contentType: 'application/pdf', size: 3 * MB, ...over })

function frameOf(): HTMLIFrameElement {
  const frame = document.querySelector('iframe')
  if (!frame) throw new Error('no frame')
  return frame
}

function post(data: unknown, o: { origin?: string; source?: Window | null } = {}) {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', {
      data, origin: o.origin ?? FILES_ORIGIN, source: o.source === undefined ? frameOf().contentWindow : o.source,
    }))
  })
}
const msg = (body: object) => ({ source: 'pdf-viewer', version: 1, ...body })

afterEach(() => { delete document.documentElement.dataset.theme })

describe('the PDF renderer @SC-1590', () => {
  it('is the registry’s entry for pdf: framed, up to 50 MB, a card when embedded', () => {
    expect(pdfRenderer).toMatchObject({ id: 'pdf', kinds: ['pdf'], runs: 'frame', previewLimit: 50 * MB, embeds: false, viewer: '/viewer/pdf' })
  })

  it('frames the viewer page on the files address, sandboxed with the least it needs, the ticket in the fragment', () => {
    render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    const frame = frameOf()
    expect(frame.getAttribute('src')).toBe(`${FILES_ORIGIN}/viewer/pdf#link=%2Ft%2Fpreview.ticket.x&theme=light`)
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-same-origin')
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer')
    expect(frame.getAttribute('allow')).toBeNull()
    expect(frame.getAttribute('title')).toBe('q3.pdf')
  })

  it('tells the viewer the page’s theme', () => {
    document.documentElement.dataset.theme = 'dark'
    render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    expect(frameOf().getAttribute('src')).toMatch(/&theme=dark$/)
  })

  it('takes the page count and reports from the viewer on the files origin', () => {
    render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    post(msg({ pages: 14 }))
    expect(screen.getByText('PDF · 3 MB · 14 pages')).toBeTruthy()
    post(msg({ report: { state: 'ready' } }))
    expect(document.querySelector('iframe')).toBeTruthy()
    post(msg({ report: { state: 'failed', reason: 'changed' } }))
    expect(screen.getByText('This file changed since you opened it.')).toBeTruthy()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('says a PDF it cannot read in words for a PDF, not as text', () => {
    render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    post(msg({ report: { state: 'failed', reason: 'unreadable' } }))
    expect(screen.getByText("This PDF can't be read, so it isn't shown.")).toBeTruthy()
    expect(screen.queryByText(/look like text/)).toBeNull()
  })

  it('says one page as one page', () => {
    render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    post(msg({ pages: 1 }))
    expect(screen.getByText('PDF · 3 MB · 1 page')).toBeTruthy()
  })

  it('ignores messages from any other origin, from any other window, and of any other shape', () => {
    render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    const changed = msg({ report: { state: 'failed', reason: 'changed' } })
    post(changed, { origin: 'https://evil.example' })
    post(changed, { origin: 'https://hq.example.org' })
    post(changed, { source: window })
    post(changed, { source: null })
    post({ ...changed, source: 'other' })
    post({ ...changed, version: 2 })
    post(msg({ report: { state: 'failed', reason: 'evil' } }))
    post(msg({ report: { state: 'partial', shown: 5 } }))
    post(msg({ pages: -1 }))
    post(msg({ pages: 2.5 }))
    post(msg({ pages: '14' }))
    post('pages=14')
    expect(screen.queryByText(/changed since/)).toBeNull()
    expect(screen.queryByText(/pages?$/)).toBeNull()
    expect(document.querySelector('iframe')).toBeTruthy()
  })

  it('says a PDF past 50 MB is too large, and frames nothing @SC-1571', () => {
    render(<FileFrame answer={pdf({ size: 60 * MB })} name="q3.pdf" onReopen={() => {}} />)
    expect(screen.getByText('Too large to preview (60 MB).')).toBeTruthy()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('frames nothing for a link that is not a ticket on an http(s) files address', () => {
    for (const previewLink of ['javascript:alert(1)', '/t/a.b.c', 'https://hq.example.org/relay/t/a.b.c', `${FILES_ORIGIN}/t/a.b.c?x=1`, 'not a link']) {
      const answer: FileOpenAnswer = { ...pdf(), previewLink } as FileOpenAnswer
      const { unmount } = render(<FileFrame answer={answer} name="q3.pdf" onReopen={() => {}} />)
      expect(document.querySelector('iframe'), previewLink).toBeNull()
      expect(screen.getByText("This file can't be read right now: its relay isn't answering.")).toBeTruthy()
      unmount()
    }
  })

  it('leaves state 5 to the frame when there is no files address', () => {
    const answer: FileOpenAnswer = { state: 'no-files-address', facts: facts({ name: 'q3.pdf', kind: 'pdf' }), downloadLink: PREVIEW, expiresAt: Date.now() + 1000 }
    render(<FileFrame answer={answer} name="q3.pdf" onReopen={() => {}} />)
    expect(screen.getByText('PDF preview needs a files address. An admin can set one up.')).toBeTruthy()
    expect(document.querySelector('iframe')).toBeNull()
  })

  it('keeps the viewer for renewed tickets, and hands it the new ticket’s path by message to its origin only', () => {
    const { rerender } = render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    const first = frameOf()
    const src = first.getAttribute('src')
    const sent = vi.spyOn(first.contentWindow!, 'postMessage')
    rerender(<FileFrame answer={{ ...pdf(), previewLink: `${FILES_ORIGIN}/t/renewed.ticket.y` } as FileOpenAnswer} name="q3.pdf" onReopen={() => {}} />)
    expect(frameOf()).toBe(first)
    expect(first.getAttribute('src')).toBe(src)
    expect(sent).toHaveBeenCalledExactlyOnceWith({ source: 'pdf-viewer-host', version: 1, link: '/t/renewed.ticket.y' }, FILES_ORIGIN)

    rerender(<FileFrame answer={{ ...pdf(), previewLink: 'https://elsewhere.example.org/t/other.ticket.z' } as FileOpenAnswer} name="q3.pdf" onReopen={() => {}} />)
    expect(sent).toHaveBeenCalledOnce()
  })

  it('mounts a new viewer for a new version', () => {
    const { rerender } = render(<FileFrame answer={pdf()} name="q3.pdf" onReopen={() => {}} />)
    const first = frameOf()
    rerender(<FileFrame answer={pdf({ version: '3:2' })} name="q3.pdf" onReopen={() => {}} />)
    expect(frameOf()).not.toBe(first)
  })

  it('is a card when embedded', () => {
    render(<FileFrame answer={pdf()} name="q3.pdf" mode="embedded" onReopen={() => {}} />)
    expect(document.querySelector('iframe')).toBeNull()
    expect(screen.getByText('q3.pdf')).toBeTruthy()
  })
})

describe('the viewer’s address @SC-1590', () => {
  it('is the files origin’s viewer path, with only the ticket’s path in the fragment', () => {
    expect(viewerSource('https://files.example.org:8443/t/a.b.c', 'light'))
      .toEqual({ origin: 'https://files.example.org:8443', src: 'https://files.example.org:8443/viewer/pdf#link=%2Ft%2Fa.b.c&theme=light' })
    expect(viewerSource('http://files.localhost:4100/t/a.b.c', 'dark')?.origin).toBe('http://files.localhost:4100')
    expect(viewerSource('ftp://files.example.org/t/a.b.c', 'light')).toBeNull()
    expect(viewerSource(`${window.location.origin}/t/a.b.c`, 'light')).toBeNull()
  })
})
