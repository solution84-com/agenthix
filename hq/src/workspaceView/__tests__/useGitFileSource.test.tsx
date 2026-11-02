// @vitest-environment jsdom
/** A file read from Git keeps its blob link while it is on screen, through React's development double mount. */
import { useEffect } from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

vi.mock('wasp/client/operations', () => ({ useQuery: vi.fn(), getGitFile: 'getGitFile' }))
vi.mock('../../storage/pages/OpenedFile', () => ({ OpenedFile: () => null }))

import { useGitFileSource } from '../components/GitFileMiddle'

let made = 0
const revoked: string[] = []

beforeEach(() => {
  vi.useFakeTimers()
  made = 0
  revoked.length = 0
  URL.createObjectURL = vi.fn(() => `blob:test/${++made}`)
  URL.revokeObjectURL = vi.fn((link: string) => { revoked.push(link) })
})
afterEach(() => { vi.useRealTimers() })

describe('useGitFileSource', () => {
  it('keeps the link of the first open through a strict-mode remount, and lets it go when the file leaves', async () => {
    // The viewer opens from an effect on its first mount and takes that open over across the remount (useOpenFile).
    let opening: Promise<unknown> | null = null
    const hook = renderHook(() => {
      const source = useGitFileSource('src/app.js', 'const a = 1', 'k1')
      useEffect(() => { opening ??= source.open() }, [source])
      return source
    }, { reactStrictMode: true })
    await act(async () => { await opening })
    act(() => { vi.runAllTimers() })
    expect(made).toBe(1)
    expect(revoked).toEqual([])
    hook.unmount()
    act(() => { vi.runAllTimers() })
    expect(revoked).toEqual(['blob:test/1'])
  })

  it('lets go of the link before when the file is opened again', async () => {
    const hook = renderHook(() => useGitFileSource('src/app.js', 'const a = 1', 'k1'))
    await hook.result.current.open()
    await hook.result.current.open()
    expect(revoked).toEqual(['blob:test/1'])
  })
})
