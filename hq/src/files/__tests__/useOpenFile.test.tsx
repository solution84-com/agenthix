// @vitest-environment jsdom
/** Opening a file for the frame: once per selection, again on Try again, and again before its tickets run out. */
import { StrictMode, useState } from 'react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, render, act, waitFor } from '@testing-library/react'
import type { FileOpenAnswer, SiteFileRef } from '@agenthix/core'

vi.mock('wasp/client/operations', () => ({ openFile: vi.fn() }))
import { useOpenFile, RENEW_BEFORE_MS } from '../useOpenFile'

const loc = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: null }
const plan: SiteFileRef = { space: 'place', loc, path: 'docs/plan.md' }
const notes: SiteFileRef = { space: 'place', loc, path: 'docs/notes.md' }

function ready(n: number, expiresAt = Date.now() + 300_000): FileOpenAnswer {
  return {
    state: 'ready',
    facts: { name: 'plan.md', size: 10, version: 'v1', contentType: 'text/markdown', kind: 'markdown' },
    previewLink: `https://files.example.com/t/p${n}`, downloadLink: `https://files.example.com/t/d${n}`, expiresAt,
  }
}

function opener() {
  let n = 0
  return vi.fn(async (_ref: SiteFileRef) => { n += 1; return ready(n) })
}

afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
})

describe('useOpenFile @SC-1532 @SC-1929', () => {
  it('opens the selected file once, however often the screen draws, and again for a new selection', async () => {
    const open = opener()
    const { result, rerender } = renderHook(({ ref }) => useOpenFile(ref, open), { initialProps: { ref: plan } })
    await waitFor(() => expect(result.current.answer?.state).toBe('ready'))
    rerender({ ref: { ...plan, loc: { ...loc } } })
    rerender({ ref: { ...plan } })
    expect(open).toHaveBeenCalledTimes(1)
    rerender({ ref: notes })
    expect(result.current.answer).toBeUndefined()
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    expect(open).toHaveBeenLastCalledWith(notes)
  })

  it('opens nothing when nothing is selected', () => {
    const open = opener()
    const { result } = renderHook(() => useOpenFile(null, open))
    expect(open).not.toHaveBeenCalled()
    expect(result.current.answer).toBeUndefined()
  })

  it('opens it afresh on Try again or Show the new version', async () => {
    const open = opener()
    const { result } = renderHook(() => useOpenFile(plan, open))
    await waitFor(() => expect(result.current.answer).toBeDefined())
    act(() => result.current.reopen())
    await waitFor(() => expect(open).toHaveBeenCalledTimes(2))
    await waitFor(() => expect((result.current.answer as { previewLink: string }).previewLink).toMatch(/p2$/))
  })

  it('retries a passing failure quietly, then says why; Try again asks again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const down = new Error('HQ is read-only while it moves.')
    const open = vi.fn<(ref: SiteFileRef) => Promise<FileOpenAnswer>>()
      .mockRejectedValueOnce(down).mockRejectedValueOnce(down).mockRejectedValueOnce(down).mockRejectedValueOnce(down)
      .mockResolvedValueOnce(ready(1))
    const { result } = renderHook(() => useOpenFile(plan, open))
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000) })
    expect(result.current.error).toBeUndefined()
    await act(async () => { await vi.advanceTimersByTimeAsync(8_000) })
    expect(open).toHaveBeenCalledTimes(4)
    expect(result.current.error?.message).toBe('HQ is read-only while it moves.')
    act(() => result.current.reopen())
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    expect(result.current.answer?.state).toBe('ready')
    expect(result.current.error).toBeUndefined()
  })

  it('says a refusal at once, without asking again', async () => {
    const open = vi.fn<(ref: SiteFileRef) => Promise<FileOpenAnswer>>()
      .mockRejectedValueOnce(Object.assign(new Error('You can\'t open files here.'), { statusCode: 403 }))
    const { result } = renderHook(() => useOpenFile(plan, open))
    await waitFor(() => expect(result.current.error?.message).toBe('You can\'t open files here.'))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('keeps the file on screen when opening it again fails', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const open = vi.fn<(ref: SiteFileRef) => Promise<FileOpenAnswer>>()
      .mockResolvedValueOnce(ready(1, Date.now() + 60_000))
      .mockRejectedValue(Object.assign(new Error('Refused'), { statusCode: 403 }))
    const { result } = renderHook(() => useOpenFile(plan, open))
    await act(async () => { await vi.advanceTimersByTimeAsync(10) })
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000) })
    expect(open).toHaveBeenCalledTimes(2)
    expect(result.current.answer?.state).toBe('ready')
    expect(result.current.error?.message).toBe('Refused')
  })

  it('opens it again shortly before its tickets end, keeping the old answer on screen meanwhile @SC-1570', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const open = opener()
    const { result } = renderHook(() => useOpenFile(plan, open))
    await act(async () => { await Promise.resolve() })
    expect(open).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(300_000 - RENEW_BEFORE_MS - 1) })
    expect(open).toHaveBeenCalledTimes(1)
    await act(async () => { vi.advanceTimersByTime(2) })
    expect(open).toHaveBeenCalledTimes(2)
    expect(result.current.answer).toBeDefined()
    await act(async () => { await Promise.resolve() })
    expect((result.current.answer as { previewLink: string }).previewLink).toMatch(/p2$/)
  })

  it('waits for a hidden page to be looked at again before opening it again', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const open = opener()
    renderHook(() => useOpenFile(plan, open))
    await act(async () => { await Promise.resolve() })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    await act(async () => { vi.advanceTimersByTime(300_000) })
    expect(open).toHaveBeenCalledTimes(1)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')) })
    expect(open).toHaveBeenCalledTimes(2)
  })

  it('does not open again for an answer that carries no tickets', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    const open = vi.fn(async () => ({ state: 'not-found' }) as FileOpenAnswer)
    renderHook(() => useOpenFile(plan, open))
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(3_600_000) })
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('opens once when the screen mounts it twice, as development mode does', async () => {
    const open = opener()
    const { result } = renderHook(() => useOpenFile(plan, open), { wrapper: StrictMode })
    await waitFor(() => expect(result.current.answer?.state).toBe('ready'))
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('opens once when a layout change moves the open file to another place on the screen', async () => {
    const open = opener()
    const Shown = () => <p>{useOpenFile(plan, open).answer ? 'opened' : 'opening'}</p>
    let widen: () => void = () => {}
    // As the Files tool does when it first measures itself: narrow, then wide, with the file under another parent.
    function Tool() {
      const [wide, setWide] = useState(false)
      widen = () => setWide(true)
      return wide ? <div><section><Shown /></section></div> : <div><Shown /></div>
    }
    const view = render(<Tool />)
    act(() => widen())
    await waitFor(() => expect(view.getByText('opened')).toBeTruthy())
    expect(open).toHaveBeenCalledTimes(1)
  })

  it('opens afresh when the file is selected again later', async () => {
    const open = opener()
    const first = renderHook(() => useOpenFile(plan, open))
    await waitFor(() => expect(first.result.current.answer).toBeDefined())
    first.unmount()
    await Promise.resolve()
    const again = renderHook(() => useOpenFile(plan, open))
    await waitFor(() => expect((again.result.current.answer as { previewLink: string }).previewLink).toMatch(/p2$/))
    expect(open).toHaveBeenCalledTimes(2)
  })
})
