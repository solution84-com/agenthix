/** Shared mocks of the Files tools' screens: the address, the data hooks, and the site-backed neighbours. */
import { vi } from 'vitest'
import type { ListedEntry } from '@agenthix/ui/projects'

export const address = { params: new URLSearchParams(), listeners: new Set<() => void>() }

export function setAddress(query: string) {
  address.params = new URLSearchParams(query)
  address.listeners.forEach(l => l())
}

export const data = {
  useFolder: vi.fn(),
  useArtefacts: vi.fn(),
  useWorkspaces: vi.fn(),
}

/** hq's *open* action, and the relay a ready answer points at. */
export const opened = { openFile: vi.fn(), openFiles: vi.fn() }

export const PREVIEW = 'https://files.example.com/t/hdr.preview.sig'
export const DOWNLOAD = 'https://files.example.com/t/hdr.download.sig'

export function readyAnswer(name: string, kind: string, size: number, contentType = 'text/markdown') {
  return {
    state: 'ready', facts: { name, size, version: 'v1', contentType, kind },
    previewLink: PREVIEW, downloadLink: DOWNLOAD, expiresAt: Date.now() + 300_000,
  }
}

/** The relay, answering ranges of `body` at the preview link. */
export function relayServing(body: string) {
  const bytes = new TextEncoder().encode(body)
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    const [, start, end] = /bytes=(\d+)-(\d+)/.exec(new Headers(init?.headers).get('Range') ?? 'bytes=0-0')!.map(Number)
    const last = Math.min(end!, bytes.length - 1)
    return new Response(bytes.slice(start, last + 1), { status: 206, headers: { 'Content-Range': `bytes ${start}-${last}/${bytes.length}` } })
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

export const ok = <T,>(value: T) => ({ data: value, isLoading: false, error: null as Error | null })
export const failed = (error: Error) => ({ data: undefined, isLoading: false, error })
export const siteDown = Object.assign(new Error('Execution Site "Laptop" is unreachable — its runs and workspaces are unavailable until it reconnects'), { statusCode: 503 })

export const NOW_ISO = (days: number, hour = 9) => new Date(Date.now() - days * 86_400_000 + (hour - new Date().getHours()) * 3_600_000).toISOString()
export type { ListedEntry }
