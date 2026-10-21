// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { copyText } from '../copyText'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

describe('copying text', () => {
  it('uses the clipboard where the browser gives one', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    expect(await copyText('a link')).toBe(true)
    expect(writeText).toHaveBeenCalledWith('a link')
  })

  it('selects the text and copies it on a page with no clipboard (plain http)', async () => {
    vi.stubGlobal('navigator', {})
    let copied = ''
    document.execCommand = vi.fn(() => { copied = document.querySelector('textarea')!.value; return true })
    expect(await copyText('http://192.168.0.13:4100/join/abc')).toBe(true)
    expect(copied).toBe('http://192.168.0.13:4100/join/abc')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back when the clipboard refuses, and says false when nothing works', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    document.execCommand = vi.fn(() => false)
    expect(await copyText('x')).toBe(false)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    document.execCommand = vi.fn(() => { throw new Error('gone') })
    expect(await copyText('x')).toBe(false)
  })
})
