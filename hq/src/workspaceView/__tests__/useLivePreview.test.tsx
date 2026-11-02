// @vitest-environment jsdom
/** HQ is told a shown live preview is in use about once a minute, however often the view renders. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'

const marked = vi.hoisted(() => vi.fn((_args: unknown) => Promise.resolve()))
const current = vi.hoisted(() => ({ livePreviewId: 'lp1', state: 'running' }))
vi.mock('wasp/client/operations', () => ({
  useQuery: (query: string) => ({ data: query === 'getLivePreviewPlaces' ? { current } : current, error: null, refetch: vi.fn() }),
  // Wasp's useAction answers a new function on every render.
  useAction: () => (args: unknown) => marked(args),
  getLivePreview: 'getLivePreview',
  getLivePreviewPlaces: 'getLivePreviewPlaces',
  markLivePreviewInUse: 'markLivePreviewInUse',
}))

import { IN_USE_EVERY_MS, useLivePreview } from '../hooks/useLivePreview'

beforeEach(() => {
  vi.useFakeTimers()
  marked.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('useLivePreview @SC-1699', () => {
  it('tells HQ once when shown, not again on each render', async () => {
    const hook = renderHook(() => useLivePreview('w1', 'b1', { enabled: true, shown: true }))
    for (let i = 0; i < 5; i++) hook.rerender()
    await vi.advanceTimersByTimeAsync(0)
    expect(marked).toHaveBeenCalledTimes(1)
    expect(marked).toHaveBeenCalledWith({ livePreviewId: 'lp1' })
  })

  it('tells HQ again after a minute', async () => {
    renderHook(() => useLivePreview('w1', 'b1', { enabled: true, shown: true }))
    await vi.advanceTimersByTimeAsync(IN_USE_EVERY_MS)
    expect(marked).toHaveBeenCalledTimes(2)
  })

  it('tells HQ nothing while the live preview is not shown', async () => {
    renderHook(() => useLivePreview('w1', 'b1', { enabled: true, shown: false }))
    await vi.advanceTimersByTimeAsync(IN_USE_EVERY_MS)
    expect(marked).not.toHaveBeenCalled()
  })
})
