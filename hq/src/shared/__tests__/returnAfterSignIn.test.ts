// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { rememberReturnPath, safeReturnPath, takeReturnPath } from '../returnAfterSignIn'

function memoryStore() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    raw: m,
  }
}

describe('safeReturnPath — never an open redirect', () => {
  it('keeps a path on hq, with its query', () => {
    expect(safeReturnPath('/open-preview/abc123')).toBe('/open-preview/abc123')
    expect(safeReturnPath('/a/b?x=1#h')).toBe('/a/b?x=1#h')
  })

  it.each([
    'https://evil.test/open-preview/x',
    '//evil.test/open-preview/x',
    '/\\evil.test',
    '\\\\evil.test',
    'javascript:alert(1)',
    'open-preview/x',
    '/\tevil',
    '',
  ])('drops %j', raw => {
    expect(safeReturnPath(raw)).toBeNull()
  })

  it('drops anything that is not a string', () => {
    expect(safeReturnPath(undefined)).toBeNull()
    expect(safeReturnPath({ path: '/' })).toBeNull()
  })
})

describe('remember and take', () => {
  it('returns the remembered path once', () => {
    const s = memoryStore()
    rememberReturnPath('/open-preview/abc', s, 1000)
    expect(takeReturnPath(s, 2000)).toBe('/open-preview/abc')
    expect(takeReturnPath(s, 2000)).toBeNull()
  })

  it('never remembers an external or scheme-relative target', () => {
    const s = memoryStore()
    rememberReturnPath('https://evil.test/', s, 1000)
    rememberReturnPath('//evil.test/', s, 1000)
    expect(s.raw.size).toBe(0)
    expect(takeReturnPath(s, 1000)).toBeNull()
  })

  it('ignores a stored external target written by something else', () => {
    const s = memoryStore()
    s.setItem('agenthix:return-after-sign-in', JSON.stringify({ path: '//evil.test/', at: 1000 }))
    expect(takeReturnPath(s, 1000)).toBeNull()
  })

  it('forgets a path left for more than a few minutes', () => {
    const s = memoryStore()
    rememberReturnPath('/open-preview/abc', s, 0)
    expect(takeReturnPath(s, 11 * 60 * 1000)).toBeNull()
  })
})
