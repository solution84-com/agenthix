import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('wasp/server', () => ({ prisma: {} }))
vi.mock('../../server/utils/logFile', () => ({ readLogFile: vi.fn() }))
vi.mock('../../sites/channel', () => ({
  siteChannelRegistry: { request: h.request, isOnline: () => true },
  ChannelRequestFailed: class extends Error {},
}))

import { readAllLines } from '../logSources'

const found = {
  info: { source: 's1', label: 'Site', kind: 'site' as const, connected: true, notice: null },
  site: { id: 's1', siteId: 'site-1', label: 'Site', isDefault: false },
}
const line = (n: number) => ({ at: `2030-01-01T00:00:${String(n % 60).padStart(2, '0')}Z`, level: 'info', source: 'x', message: `m${n}` })

beforeEach(() => h.request.mockReset())

describe('reading every line of a source', () => {
  it('follows an honest site\'s cursors to the end', async () => {
    h.request
      .mockResolvedValueOnce({ lines: [line(1), line(2)], nextCursor: 'a' })
      .mockResolvedValueOnce({ lines: [line(3)], nextCursor: null })
    const read = await readAllLines(found, {})
    expect(read.lines).toHaveLength(3)
    expect(read.truncated).toBe(false)
  })

  it('stops when a site keeps returning a cursor with no lines', async () => {
    h.request.mockResolvedValue({ lines: [], nextCursor: 'again' })
    const read = await readAllLines(found, {})
    expect(h.request).toHaveBeenCalledTimes(1)
    expect(read.lines).toEqual([])
    expect(read.truncated).toBe(true)
  })

  it('stops when a site returns the cursor it was just given', async () => {
    h.request.mockResolvedValue({ lines: [line(1)], nextCursor: 'same' })
    await readAllLines(found, {})
    expect(h.request).toHaveBeenCalledTimes(2)
  })

  it('stops after a bounded number of pages when every cursor is new', async () => {
    let n = 0
    h.request.mockImplementation(async () => ({ lines: [line(n)], nextCursor: `c${n++}` }))
    const read = await readAllLines(found, {}, 3000)
    expect(h.request).toHaveBeenCalledTimes(6)
    expect(read.truncated).toBe(true)
  })
})
