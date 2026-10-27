import type { FileBytes, RendererFailure } from '@agenthix/core'

/** A read that failed in a way the frame words: `changed` (the relay answered 409) or `unavailable`. */
export class FileBytesError extends Error {
  constructor(readonly reason: Extract<RendererFailure, 'changed' | 'unavailable'>) {
    super(reason === 'changed' ? 'The file changed since it was opened.' : 'The file could not be read from its relay.')
    this.name = 'FileBytesError'
  }
}

export interface FileBytesOptions {
  /** Aborts every read; the frame aborts it when the renderer unmounts. */
  signal?: AbortSignal
  fetch?: typeof fetch
}

/** "bytes 0-1023/4096" → its total, or undefined when the total is unknown or the header is not one. */
function totalOf(contentRange: string | null): number | undefined {
  const match = /^bytes (?:\d+-\d+|\*)\/(\d+)$/.exec(contentRange?.trim() ?? '')
  return match ? Number(match[1]) : undefined
}

/** Reads a body up to `limit` bytes, then stops: a relay that ignores the range never sends the whole file into memory. */
async function readUpTo(response: Response, limit: number): Promise<{ bytes: Uint8Array; more: boolean }> {
  if (!response.body) {
    const all = new Uint8Array(await response.arrayBuffer())
    return { bytes: all.slice(0, limit), more: all.length > limit }
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let length = 0
  let more = false
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    length += value.length
    if (length > limit) { more = true; await reader.cancel(); break }
  }
  const bytes = new Uint8Array(Math.min(length, limit))
  let at = 0
  for (const chunk of chunks) {
    const part = chunk.subarray(0, Math.min(chunk.length, bytes.length - at))
    bytes.set(part, at)
    at += part.length
    if (at === bytes.length) break
  }
  return { bytes, more }
}

/**
 * A file's bytes over `fetch`, from its ticket link on the relay. Each read asks for a range; no credentials go with
 * it (the relay's address is not hq's, and a ticket is the only authority it reads). Given a function, each read asks
 * it for the link, so a renewed ticket serves the reads after it; `link` stays the first one.
 */
export function createFileBytes(link: string | (() => string), options: FileBytesOptions = {}): FileBytes {
  const fetchIt = options.fetch ?? globalThis.fetch.bind(globalThis)
  const current = typeof link === 'function' ? link : () => link

  async function get(range: string): Promise<Response> {
    let response: Response
    try {
      response = await fetchIt(current(), {
        headers: { Range: range },
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        signal: options.signal,
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      throw new FileBytesError('unavailable')
    }
    if (response.status === 409) throw new FileBytesError('changed')
    if (response.status !== 200 && response.status !== 206 && response.status !== 416) {
      throw new FileBytesError('unavailable')
    }
    return response
  }

  return {
    link: current(),
    async read(limit) {
      if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('A read needs a limit of at least one byte.')
      const response = await get(`bytes=0-${limit - 1}`)
      // An empty file has no first byte to give.
      if (response.status === 416) return { bytes: new Uint8Array(0), whole: true }
      const { bytes, more } = await readUpTo(response, limit)
      if (response.status === 200) return { bytes, whole: !more }
      const total = totalOf(response.headers.get('Content-Range'))
      return { bytes, whole: !more && (total !== undefined ? bytes.length >= total : bytes.length < limit) }
    },
    async range(start, end) {
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
        throw new RangeError('A range needs 0 ≤ start ≤ end.')
      }
      const response = await get(`bytes=${start}-${end}`)
      if (response.status === 416) return new Uint8Array(0)
      const wanted = end - start + 1
      if (response.status === 206) return (await readUpTo(response, wanted)).bytes
      // The relay sent the whole file: keep only what was asked for.
      const { bytes } = await readUpTo(response, end + 1)
      return bytes.slice(start)
    },
  }
}
