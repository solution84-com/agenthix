import { useEffect } from 'react'
import { expect, vi } from 'vitest'
import type { FileFacts, FileOpenAnswer, RendererReport } from '@agenthix/core'
import { createRegistry } from '../registry'
import type { Renderer } from '../renderer'

/** Shared by the frame's and the renderers' tests. */
export const MB = 1024 * 1024
export const PREVIEW = 'https://files.example.org/t/preview.ticket.x'
export const DOWNLOAD = 'https://files.example.org/t/download.ticket.x'

export function facts(over: Partial<FileFacts> = {}): FileFacts {
  return { name: 'notes.txt', size: 2048, version: '2048:1', contentType: 'text/plain', kind: 'text', ...over }
}

export function ready(over: Partial<FileFacts> = {}): FileOpenAnswer {
  return { state: 'ready', facts: facts(over), previewLink: PREVIEW, downloadLink: DOWNLOAD, expiresAt: Date.now() + 300_000 }
}

/** A renderer that draws a line and reports what it is told to, once mounted. */
export function stubRenderer(over: Partial<Renderer> & { reports?: RendererReport; fact?: string } = {}): Renderer {
  const { reports, fact, ...entry } = over
  function Stub({ report, fact: setFact }: { report: (r: RendererReport) => void; fact: (t: string) => void }) {
    useEffect(() => {
      if (fact) setFact(fact)
      if (reports) report(reports)
    }, [report, setFact])
    return <p>drawn by the stub</p>
  }
  return {
    id: 'stub', kinds: ['text', 'pdf'], runs: 'page', previewLimit: MB, embeds: false,
    render: props => <Stub report={props.report} fact={props.fact} />,
    ...entry,
  }
}

export const stubRegistry = (renderer: Renderer = stubRenderer()) => createRegistry([renderer])

/** A relay that answers ranged reads of `body` (or `status` alone), for the renderers' tests. */
export function relayServing(body: Uint8Array<ArrayBuffer>, status = 206) {
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    expect(url).toBe(PREVIEW)
    if (status !== 206) return new Response(null, { status })
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? '')!.map(Number)
    const last = Math.min(end!, body.length - 1)
    return new Response(body.slice(start, last + 1), { status, headers: { 'Content-Range': `bytes ${start}-${last}/${body.length}` } })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}
