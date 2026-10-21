/**
 * hq's typed caller for a site's own files — reading one. The bytes cross on the
 * content transport, never the control channel, and a read that fails part-way
 * or never completes is a failure, not what arrived.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PassThrough } from 'node:stream'
import { LOCATION_FILE_METHODS, LocationFileError } from '@agenthix/core'

const request = vi.hoisted(() => vi.fn())
vi.mock('../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request }, ChannelRequestFailed }
})

const openContentStream = vi.hoisted(() => vi.fn())
vi.mock('../../sites/content', async () => {
  const { ContentStreamFailed } = await import('../../sites/content/contentStream')
  return { openContentStream, ContentStreamFailed }
})

// Where a location lives is storageSite's own suite; here it is one site.
const resolveStorageSite = vi.hoisted(() => vi.fn())
vi.mock('../storageSite', () => ({ resolveStorageSite }))

import { ContentStreamFailed } from '../../sites/content/contentStream'
import { readFileOnSite, LOCATION_READ_TIMEOUT_MS } from '../locationFileStore'

const loc = { ownerType: 'project' as const, ownerId: 'p1' }

beforeEach(() => {
  vi.clearAllMocks()
  resolveStorageSite.mockResolvedValue('site-logical-1')
})

describe('reading a file', () => {
  function streamOf(...chunks: string[]) {
    const stream = new PassThrough()
    setImmediate(() => {
      for (const chunk of chunks) stream.write(chunk)
      stream.end()
    })
    return stream
  }

  it('opens the read on the content transport and collects its bytes', async () => {
    openContentStream.mockResolvedValue(streamOf('# Project', ' — Roadmap\n'))
    const bytes = await readFileOnSite(loc, 'ROADMAP.md')
    expect(bytes.toString('utf8')).toBe('# Project — Roadmap\n')
    expect(openContentStream).toHaveBeenCalledWith('site-logical-1', LOCATION_FILE_METHODS.readFile, {
      loc: { ownerType: 'project', ownerId: 'p1', workspaceId: null, taskId: null },
      relPath: 'ROADMAP.md',
    })
    // The bytes never cross the control channel, whatever the file's size.
    expect(request).not.toHaveBeenCalled()
  })

  it('fails when the stream fails part-way, rather than returning what arrived', async () => {
    const stream = new PassThrough()
    openContentStream.mockResolvedValue(stream)
    setImmediate(() => {
      stream.write('half a file')
      stream.destroy(new ContentStreamFailed('the path is outside the location', 'handler_failed'))
    })
    await expect(readFileOnSite(loc, 'escape')).rejects.toThrow(/outside the location/)
  })

})

/**
 * `CONTENT_OPEN_TIMEOUT_MS` bounds only the site ACCEPTING the stream. A read
 * that is accepted and then never progresses has nothing bounding it, and
 * holds the stream — and its caller — open indefinitely.
 */
describe('a read that never completes', () => {
  it('fails with a stated reason instead of waiting forever', async () => {
    vi.useFakeTimers()
    try {
      const stream = new PassThrough()
      openContentStream.mockResolvedValue(stream)
      const read = readFileOnSite(loc, 'ROADMAP.md')
      const settled = expect(read).rejects.toThrow(/did not complete/)
      await vi.advanceTimersByTimeAsync(LOCATION_READ_TIMEOUT_MS + 1)
      await settled
      // And the stream is let go rather than left open behind the failure.
      expect(stream.destroyed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not fire for a read that finishes in time', async () => {
    vi.useFakeTimers()
    try {
      const stream = new PassThrough()
      openContentStream.mockResolvedValue(stream)
      const read = readFileOnSite(loc, 'ROADMAP.md')
      stream.write('done')
      stream.end()
      await vi.advanceTimersByTimeAsync(1)
      expect((await read).toString('utf8')).toBe('done')
      await vi.advanceTimersByTimeAsync(LOCATION_READ_TIMEOUT_MS + 1)
    } finally {
      vi.useRealTimers()
    }
  })
})
