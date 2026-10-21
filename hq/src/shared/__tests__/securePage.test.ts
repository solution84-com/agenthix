import { afterEach, describe, expect, it, vi } from 'vitest'
import { getUserMedia, microphonePossible, SECURE_PAGE_WORDS, SecurePageNeeded } from '../securePage'

afterEach(() => { vi.unstubAllGlobals() })

describe('the microphone on a page that is not secure @SC-1147', () => {
  it('is refused in words, not by a missing object', async () => {
    // Plain http at a network address: the browser leaves navigator.mediaDevices out.
    vi.stubGlobal('navigator', {})
    expect(microphonePossible()).toBe(false)
    const err = await getUserMedia({ audio: true }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(SecurePageNeeded)
    expect((err as Error).message).toBe(SECURE_PAGE_WORDS)
    expect(SECURE_PAGE_WORDS).toMatch(/https/)
    expect(SECURE_PAGE_WORDS).toMatch(/localhost/)
  })

  it('opens through the browser on a secure page', async () => {
    const stream = {} as MediaStream
    const asked = vi.fn(async () => stream)
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia: asked } })
    expect(microphonePossible()).toBe(true)
    await expect(getUserMedia({ audio: true })).resolves.toBe(stream)
    expect(asked).toHaveBeenCalledWith({ audio: true })
  })
})
