import { describe, expect, it, vi } from 'vitest'
import { Load } from '../load'
import { SiteLines, type LineSocket } from '../lines/siteLines'

function socket(): LineSocket & { closed: number | null } {
  return { readyState: 1, OPEN: 1, closed: null, send: (_d, cb) => cb?.(), close(code) { this.closed = code ?? 0 } }
}
const events = () => ({ onData: vi.fn(), onEnd: vi.fn(), onError: vi.fn() })

describe('one line per site @SC-1473', () => {
  it('retires the old line on a new dial, closing it once its streams are over', () => {
    const lines = new SiteLines()
    const a = socket()
    const muxA = lines.add('site-1', a)
    const ev = events()
    const id = muxA.open('files.serve', {}, ev)
    const b = socket()
    const muxB = lines.add('site-1', b)
    expect(lines.current('site-1')).toBe(muxB)
    expect(a.closed).toBeNull()
    muxA.receiveText(JSON.stringify({ t: 'end', id }))
    muxA.end(id)
    lines.settle(muxA)
    expect(a.closed).toBe(4000)
  })

  it('closes an idle old line at once, and a busy one after the grace', () => {
    vi.useFakeTimers()
    try {
      const lines = new SiteLines(1000)
      const a = socket()
      lines.add('site-1', a)
      lines.add('site-1', socket())
      expect(a.closed).toBe(4000)
      const c = socket()
      const ev = events()
      lines.add('site-2', c).open('files.serve', {}, ev)
      lines.add('site-2', socket())
      vi.advanceTimersByTime(1001)
      expect(c.closed).toBe(4000)
      expect(ev.onError).toHaveBeenCalledWith('disconnected', expect.any(String))
    } finally {
      vi.useRealTimers()
    }
  })

  it('forgets a line whose socket closed, failing its streams; a displaced socket does not clear its replacement', () => {
    const lines = new SiteLines()
    const a = socket()
    const ev = events()
    lines.add('site-1', a).open('files.serve', {}, ev)
    const b = socket()
    lines.add('site-1', b)
    lines.remove('site-1', a)
    expect(ev.onError).toHaveBeenCalled()
    expect(lines.sites()).toEqual(['site-1'])
    lines.remove('site-1', b)
    expect(lines.sites()).toEqual([])
  })

  it('closes every line when the relay is named anew', () => {
    const lines = new SiteLines()
    const a = socket()
    lines.add('site-1', a)
    lines.closeAll(4003, 'renamed')
    expect(a.closed).toBe(4003)
    expect(lines.current('site-1')).toBeNull()
  })
})

describe('streams per person @SC-1473', () => {
  it('counts each person apart and releases once', () => {
    const load = new Load(2)
    const r1 = load.take('p1') as () => void
    load.take('p1')
    expect(load.take('p1')).toBe(false)
    expect(load.take('p2')).not.toBe(false)
    r1()
    r1()
    expect(load.openStreams).toBe(2)
    expect(load.take('p1')).not.toBe(false)
  })
})
