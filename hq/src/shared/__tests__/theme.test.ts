// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { applyTheme, getStoredTheme, initTheme, THEME_STORAGE_KEY } from '../theme'

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
})

describe('theme @SC-489', () => {
  it('is light when nothing has been chosen', () => {
    expect(getStoredTheme()).toBe('light')
  })

  it('remembers a choice of dark and sets it on the page', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(getStoredTheme()).toBe('dark')
  })

  it('switches back to light', () => {
    applyTheme('dark')
    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
    expect(getStoredTheme()).toBe('light')
  })

  it('initTheme sets dark before the first render only for a stored dark choice', () => {
    const run = () => initTheme()
    run()
    expect(document.documentElement.getAttribute('data-theme')).toBeNull()
    localStorage.setItem(THEME_STORAGE_KEY, 'dark')
    run()
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
