import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { applyTheme, storedTheme, THEME_STORAGE_KEY } from '../theme'

afterEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('the light/dark choice @SC-894', () => {
  it('is light until dark is chosen, and remembers the choice', () => {
    expect(storedTheme()).toBe('light')
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(storedTheme()).toBe('dark')
    applyTheme('light')
    expect(storedTheme()).toBe('light')
  })

  it('is applied before the first paint by a script file that reads the same key', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    const script = readFileSync(join(process.cwd(), 'public/theme-init.js'), 'utf8')
    new Function(script)()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('is loaded from a file in the page head, not an inline script, and the page names its portal', () => {
    const html = readFileSync(join(process.cwd(), 'index.html'), 'utf8')
    expect(html).toMatch(/<html[^>]*data-portal="fleet-console"/)
    expect(html).toContain('<script src="/theme-init.js"></script>')
    expect(html.match(/<script(?![^>]*src=)[^>]*>/g)).toBeNull()
  })
})
