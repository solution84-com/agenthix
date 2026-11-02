/** The workspace view's address and what the browser remembers of it (live preview spec, part 1, *Switching*). */
import { describe, it, expect } from 'vitest'
import {
  addressNamesAPlace, byRecent, noteOpened, readRemembered, readViewAddress, recentWorkspaces, remember, viewAddressOf,
  workspaceViewPath,
} from '../viewAddress'

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

describe('the address', () => {
  it('carries the branch, the section and the file, and leaves main out', () => {
    expect(viewAddressOf({ branch: 'login-page', section: 'files', file: 'src/App.tsx', diff: null })).toBe('?branch=login-page&section=files&file=src%2FApp.tsx')
    expect(viewAddressOf({ branch: 'main', section: 'git', file: null, diff: 'README.md' })).toBe('?section=git&diff=README.md')
  })

  it('reads back what it wrote, and ignores a section it does not know', () => {
    const read = readViewAddress(new URLSearchParams('branch=login-page&section=nowhere&diff=a.ts'))
    expect(read).toEqual({ branch: 'login-page', diff: 'a.ts' })
  })

  it('shows a file before a change when both are named', () => {
    expect(readViewAddress(new URLSearchParams('file=a.ts&diff=b.ts'))).toEqual({ file: 'a.ts' })
  })

  it('knows when it names a place in the view', () => {
    expect(addressNamesAPlace(new URLSearchParams(''))).toBe(false)
    expect(addressNamesAPlace(new URLSearchParams('section=git'))).toBe(true)
  })

  it('is the workspace’s own path', () => {
    expect(workspaceViewPath('w 1')).toBe('/workspaces/w%201/view')
  })
})

describe('what the browser remembers', () => {
  it('remembers the place per person and per workspace', () => {
    const store = memory()
    remember(store, 'u1', 'w1', { branch: 'login-page', section: 'files', file: 'a.ts', diff: null })
    expect(readRemembered(store, 'u1', 'w1')).toEqual({ branch: 'login-page', section: 'files', file: 'a.ts' })
    expect(readRemembered(store, 'u2', 'w1')).toEqual({})
    expect(readRemembered(store, 'u1', 'w2')).toEqual({})
  })

  it('checks what it reads back, as the address is checked', () => {
    const store = memory()
    store.setItem('workspaceView:u1:w1', JSON.stringify({ branch: 7, section: 'files', file: 'x'.repeat(5000) }))
    expect(readRemembered(store, 'u1', 'w1')).toEqual({ section: 'files' })
    store.setItem('workspaceView:u1:w1', '{not json')
    expect(readRemembered(store, 'u1', 'w1')).toEqual({})
  })

  it('lists workspaces most recently opened first', () => {
    const store = memory()
    noteOpened(store, 'u1', 'a')
    noteOpened(store, 'u1', 'b')
    noteOpened(store, 'u1', 'a')
    expect(recentWorkspaces(store, 'u1')).toEqual(['a', 'b'])
    const items = [{ id: 'c' }, { id: 'b' }, { id: 'a' }, { id: 'd' }]
    expect(byRecent(items, recentWorkspaces(store, 'u1')).map(i => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
