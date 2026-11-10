import { useEffect } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { FileOpenAnswer } from '@agenthix/core'
import { FileFrame, type FileFrameProps } from '../FileFrame'
import { DOWNLOAD, MB, PREVIEW, facts, ready, stubRegistry, stubRenderer } from './testKit'

afterEach(() => vi.unstubAllGlobals())

function frame(answer: FileOpenAnswer | undefined, over: Partial<FileFrameProps> = {}) {
  const onReopen = vi.fn()
  render(<FileFrame answer={answer} name="q3.pdf" registry={stubRegistry()} onReopen={onReopen} {...over} />)
  return { onReopen }
}

const downloadLink = () => screen.queryAllByRole('link', { name: 'Download' })[0] ?? null
const greyedDownload = () => screen.getByRole('button', { name: 'Download' })

describe('FileFrame: the eight states @SC-1578', () => {
  it('1 · no renderer for the kind', () => {
    frame(ready({ name: 'export.zip', kind: 'none', contentType: 'application/octet-stream', size: 4.2 * MB }))
    expect(screen.getByText('No preview for .zip files.')).toBeTruthy()
    expect(screen.getAllByRole('link', { name: 'Download' }).every(a => a.getAttribute('href') === DOWNLOAD)).toBe(true)
    expect(screen.getByText('ZIP · 4.2 MB')).toBeTruthy()
  })

  it('2 · past the cap, part shown: the renderer under the line', () => {
    const registry = stubRegistry(stubRenderer({ reports: { state: 'partial', shown: MB } }))
    frame(ready({ name: 'run.log', size: 3.4 * MB }), { registry })
    expect(screen.getByText('Showing the first 1 MB of 3.4 MB. Download to see all of it.')).toBeTruthy()
    expect(screen.getByText('drawn by the stub')).toBeTruthy()
    // Download is the header's, once: the line points to it and draws no second one.
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(1)
  })

  it('3 · past the cap, nothing useful to show', () => {
    const registry = stubRegistry(stubRenderer({ reports: { state: 'failed', reason: 'too-large' } }))
    frame(ready({ size: 68 * MB }), { registry })
    expect(screen.getByText('Too large to preview (68 MB).')).toBeTruthy()
    expect(screen.queryByText('drawn by the stub')).toBeNull()
    expect(downloadLink()).toBeTruthy()
  })

  it('4 · looks like text but isn\'t: by its name, or by the renderer\'s report', () => {
    frame(ready({ name: 'notes.md', kind: 'none' }))
    expect(screen.getByText("This doesn't look like text, so it isn't shown.")).toBeTruthy()
    expect(downloadLink()).toBeTruthy()
  })

  it('4 · a renderer that finds bytes that aren\'t text', () => {
    frame(ready(), { registry: stubRegistry(stubRenderer({ reports: { state: 'failed', reason: 'unreadable' } })) })
    expect(screen.getByText("This doesn't look like text, so it isn't shown.")).toBeTruthy()
  })

  it('5 · PDF with no files address', () => {
    const hint = vi.fn(() => <a href="/help">How to set one up</a>)
    frame({ state: 'no-files-address', facts: facts({ name: 'q3.pdf', kind: 'pdf' }), downloadLink: DOWNLOAD, expiresAt: 0 }, { adminHint: hint })
    expect(screen.getByText('PDF preview needs a files address. An admin can set one up.')).toBeTruthy()
    expect(hint).toHaveBeenCalledWith('no-files-address')
    expect(screen.getByRole('link', { name: 'How to set one up' })).toBeTruthy()
    expect(downloadLink()).toBeTruthy()
  })

  it('6 · changed while open: Show the new version opens it again', () => {
    const { onReopen } = frame(ready(), { registry: stubRegistry(stubRenderer({ reports: { state: 'failed', reason: 'changed' } })) })
    expect(screen.getByText('This file changed since you opened it.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show the new version' }))
    expect(onReopen).toHaveBeenCalledOnce()
    expect(downloadLink()).toBeTruthy()
  })

  it('7 · the site\'s relay isn\'t answering: the names from the answer, Try again, Download greyed', () => {
    const { onReopen } = frame({ state: 'relay-unavailable', siteName: 'office-server', relayName: 'relay-2' })
    expect(screen.getByText("Files on office-server can't be opened right now: relay-2 isn't answering.")).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onReopen).toHaveBeenCalledOnce()
    expect((greyedDownload() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByRole('heading', { name: 'q3.pdf' })).toBeTruthy()
  })

  it('7 · a renderer whose reads find no relay', () => {
    frame(ready(), { registry: stubRegistry(stubRenderer({ reports: { state: 'failed', reason: 'unavailable' } })) })
    expect(screen.getByText("This file can't be read right now: its relay isn't answering.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect((greyedDownload() as HTMLButtonElement).disabled).toBe(true)
  })

  it('8 · the site isn\'t answering', () => {
    frame({ state: 'site-unavailable' })
    expect(screen.getByText("The site holding these files isn't answering.")).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
    expect((greyedDownload() as HTMLButtonElement).disabled).toBe(true)
  })

  it('8 · a site too old to show a past version says it must be upgraded @SC-1883', () => {
    frame({ state: 'site-unavailable', upgrade: { siteName: 'office-server' } })
    expect(screen.getByText("office-server can't show a past version of a file until it is upgraded. An admin can upgrade it to the newest release.")).toBeTruthy()
    expect((greyedDownload() as HTMLButtonElement).disabled).toBe(true)
  })

  it('Download is a link in every state but 7 and 8', () => {
    const answers: FileOpenAnswer[] = [
      ready({ name: 'a.zip', kind: 'none' }),
      ready({ kind: 'text' }),
      { state: 'no-files-address', facts: facts({ kind: 'pdf' }), downloadLink: DOWNLOAD, expiresAt: 0 },
    ]
    for (const answer of answers) {
      const { unmount } = render(<FileFrame answer={answer} name="x" registry={stubRegistry()} onReopen={() => {}} />)
      expect(downloadLink()?.getAttribute('href')).toBe(DOWNLOAD)
      unmount()
    }
  })
})

describe('FileFrame: around the renderer @SC-1579 @SC-1893', () => {
  it('says Loading… while the answer is asked for', () => {
    frame(undefined)
    expect(screen.getByText('Loading…')).toBeTruthy()
    expect((greyedDownload() as HTMLButtonElement).disabled).toBe(true)
  })

  it('draws the breadcrumb, the title and the facts line with the kind\'s own fact', () => {
    const registry = stubRegistry(stubRenderer({ reports: { state: 'ready' }, fact: '14 pages' }))
    frame(ready({ name: 'q3.pdf', kind: 'pdf', size: 1.2 * MB }), {
      registry, breadcrumb: ['Files', 'reports'], changed: 'Changed today 10:42 by an agent run',
    })
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).textContent).toBe('Files › reports')
    expect(screen.getByRole('heading', { name: 'q3.pdf' })).toBeTruthy()
    expect(screen.getByText('Changed today 10:42 by an agent run · PDF · 1.2 MB · 14 pages')).toBeTruthy()
  })

  it('names code by its language', () => {
    frame(ready({ name: 'a.ts', kind: 'code', language: 'typescript', size: 100 }), { registry: stubRegistry(stubRenderer({ kinds: ['code'] })) })
    expect(screen.getByText('TypeScript · 100 B')).toBeTruthy()
  })

  it('offers Full screen in the header, and ⋯ Copy link, Copy path, Show in Files and Mention from the caller', () => {
    const [onMention, onCopyLink, onCopyPath, onShowInFiles, onFullScreen] = [vi.fn(), vi.fn(), vi.fn(), vi.fn(), vi.fn()]
    frame(ready(), { onMention, onCopyLink, onCopyPath, onShowInFiles, onFullScreen })
    fireEvent.click(screen.getByRole('button', { name: 'Full screen' }))
    expect(onFullScreen).toHaveBeenCalledOnce()
    for (const [label, fn] of [['Copy link', onCopyLink], ['Copy path', onCopyPath], ['Show in Files', onShowInFiles], ['Mention', onMention]] as const) {
      fireEvent.click(screen.getByRole('button', { name: 'More actions' }))
      fireEvent.click(screen.getByRole('menuitem', { name: label }))
      expect(fn).toHaveBeenCalledOnce()
    }
  })

  it('says a confirmation under the actions, never in the facts line (M7)', () => {
    frame(ready({ name: 'a.txt', size: 100 }), { notice: 'Link copied.' })
    expect(screen.getByText('Link copied.')).toBeTruthy()
    expect(screen.getByText('Text · 100 B').textContent).not.toContain('Link copied')
  })

  it('‹ back names where the person came from, with the folder above the name', () => {
    const onBack = vi.fn()
    frame(ready({ name: 'q3.pdf' }), { back: { label: 'QR-1', onBack }, breadcrumb: ['QR-1', 'Attachments'] })
    fireEvent.click(screen.getByRole('button', { name: 'QR-1' }))
    expect(onBack).toHaveBeenCalledOnce()
    expect(screen.getByTestId('file-frame-folder').textContent).toBe('QR-1 › Attachments')
    expect(screen.getByRole('heading', { name: 'q3.pdf' })).toBeTruthy()
  })

  it('the folder toggle says what it does and shows its state', () => {
    const onToggle = vi.fn()
    frame(ready(), { folderToggle: { shown: false, onToggle } })
    const toggle = screen.getByRole('button', { name: 'Show the folder' })
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('mounts the renderer afresh for a new version, and aborts the old one\'s reads', () => {
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      if (init?.signal) signals.push(init.signal)
      return new Promise<Response>(() => {})
    }))
    const { rerender } = render(<FileFrame answer={ready()} name="notes.txt" onReopen={() => {}} />)
    expect(signals).toHaveLength(1)
    rerender(<FileFrame answer={ready({ version: '2048:2' })} name="notes.txt" onReopen={() => {}} />)
    expect(signals[0]!.aborted).toBe(true)
    expect(signals).toHaveLength(2)
    expect(signals[1]!.aborted).toBe(false)
  })

  it('keeps the renderer for renewed tickets: nothing read again, later reads by the new ticket', async () => {
    const urls: string[] = []
    const signals: AbortSignal[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      urls.push(String(url))
      if (init?.signal) signals.push(init.signal)
      return new Response('hello', { status: 206, headers: { 'Content-Range': 'bytes 0-4/5' } })
    }))
    const renewed: FileOpenAnswer = { ...ready(), previewLink: 'https://files.example.org/t/renewed.ticket.x' } as FileOpenAnswer
    const { rerender } = render(<FileFrame answer={ready()} name="notes.txt" onReopen={() => {}} />)
    await screen.findByText('hello')
    rerender(<FileFrame answer={renewed} name="notes.txt" onReopen={() => {}} />)
    expect(screen.getByText('hello')).toBeTruthy()
    expect(urls).toEqual([PREVIEW])
    expect(signals[0]!.aborted).toBe(false)

    let mounts = 0
    let reread: (() => Promise<Uint8Array>) | undefined
    const counting = stubRenderer({
      render: props => {
        reread = () => props.bytes.range(0, 1)
        return <Mounted onMount={() => { mounts += 1 }} />
      },
    })
    const { rerender: again } = render(<FileFrame answer={ready()} name="notes.txt" registry={stubRegistry(counting)} onReopen={() => {}} />)
    again(<FileFrame answer={renewed} name="notes.txt" registry={stubRegistry(counting)} onReopen={() => {}} />)
    expect(mounts).toBe(1)
    await reread!()
    expect(urls.at(-1)).toBe('https://files.example.org/t/renewed.ticket.x')
  })
})

function Mounted({ onMount }: { onMount: () => void }) {
  useEffect(onMount, [])
  return <p>mounted</p>
}

describe('FileFrame: links @SC-1580', () => {
  it('never makes an href of a link that is not http(s) or a path', () => {
    const answer = { ...ready({ name: 'a.zip', kind: 'none' }), downloadLink: 'javascript:alert(1)' } as FileOpenAnswer
    frame(answer)
    expect(downloadLink()).toBeNull()
  })
})

describe('FileFrame: embedded @SC-1581', () => {
  it('draws a card for a kind whose renderer does not embed: a click opens it', () => {
    const onOpen = vi.fn()
    frame(ready({ name: 'q3-data.csv', kind: 'text', size: 84 * 1024 }), { mode: 'embedded', onOpen })
    expect(screen.queryByText('drawn by the stub')).toBeNull()
    expect(screen.queryByRole('heading')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /q3-data\.csv/ }))
    expect(onOpen).toHaveBeenCalledOnce()
    expect(downloadLink()).toBeTruthy()
  })

  it('draws a renderer that embeds, with no controls', () => {
    frame(ready({ kind: 'image' }), { mode: 'embedded', registry: stubRegistry(stubRenderer({ kinds: ['image'], embeds: true })) })
    expect(screen.getByText('drawn by the stub')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Mention' })).toBeNull()
  })

  it('says why on the card when the file cannot be shown', () => {
    frame({ state: 'site-unavailable' }, { mode: 'embedded' })
    expect(screen.getByText("The site holding these files isn't answering.")).toBeTruthy()
    expect(downloadLink()).toBeNull()
  })
})

describe('FileFrame: close', () => {
  it('draws ✕ when the caller can close it, and none otherwise', () => {
    const onClose = vi.fn()
    frame(ready({ name: 'a.txt' }), { onClose })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('has no ✕ without a way to close', () => {
    frame(ready({ name: 'a.txt' }))
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })
})

describe('FileFrame: an empty file, a linked file, and the band @SC-1884 @SC-1885 @SC-1886', () => {
  it('an empty file says so in the preview\'s place, and draws no renderer', () => {
    frame(ready({ size: 0 }))
    expect(screen.getByText('This file is empty.')).toBeTruthy()
    expect(screen.queryByText('drawn by the stub')).toBeNull()
    expect(downloadLink()).toBeTruthy()
  })

  const LINKED = "This file can't be opened. It's linked to another file elsewhere on the machine, so Agenthix can't be sure it's safe to show you. Ask the agent to save it again as an ordinary copy."

  it('a hard-linked file has its own state, with Ask the agent and no download', () => {
    const onAsk = vi.fn()
    frame({ state: 'linked' }, { onAsk })
    expect(screen.getByText(LINKED)).toBeTruthy()
    expect(screen.queryByText(/isn't there/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Ask the agent' }))
    expect(onAsk).toHaveBeenCalledOnce()
    expect(downloadLink()).toBeNull()
    expect((greyedDownload() as HTMLButtonElement).disabled).toBe(true)
  })

  it('offers no Ask the agent where the caller has no message box to put it in', () => {
    frame({ state: 'linked' })
    expect(screen.getByText(LINKED)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Ask the agent' })).toBeNull()
  })

  it('a file that is not there still says so in its own words', () => {
    frame({ state: 'not-found' })
    expect(screen.getByText("This file isn't there, or it isn't yours to open.")).toBeTruthy()
  })

  it('a no-preview file has one Download, the header\'s', () => {
    frame(ready({ name: 'export.zip', kind: 'none', contentType: 'application/octet-stream' }))
    expect(screen.getAllByRole('link', { name: 'Download' })).toHaveLength(1)
  })

  it('puts the facts line and the partial line in one band with a divider under it', () => {
    const registry = stubRegistry(stubRenderer({ reports: { state: 'partial', shown: MB, words: 'Showing the first 10 of 20 rows. Download to see and sort all of it.' } }))
    frame(ready({ size: 3 * MB }), { registry })
    const band = screen.getByTestId('file-frame-band')
    expect(band.className).toContain('border-b')
    expect(band.textContent).toContain('Showing the first 10 of 20 rows. Download to see and sort all of it.')
    expect(band.textContent).toContain('Text · 3 MB')
  })

  it('lets a renderer that fills scroll in one place: the view does not scroll around it', () => {
    frame(ready(), { registry: stubRegistry(stubRenderer({ fills: true })) })
    expect(screen.getByTestId('file-frame-view').className).not.toContain('overflow-auto')
    expect(screen.getByTestId('file-frame-view').className).toContain('flex-1')
  })
})
