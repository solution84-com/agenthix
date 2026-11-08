/** The workspace view's address and what the browser remembers of it (live preview spec, part 1, *Switching*). */
import { describe, it, expect } from 'vitest'
import {
  addressNamesAPlace, asksToMerge, byRecent, noteOpened, readRemembered, readViewAddress, recentWorkspaces, remember, viewAddressOf,
  workspaceViewPath,
} from '../viewAddress'

function memory(): Pick<Storage, 'getItem' | 'setItem'> & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return { data, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v) } }
}

describe('the address @SC-1688', () => {
  it('carries the branch, the section and the file, and leaves main out', () => {
    expect(viewAddressOf({ branch: 'login-page', section: 'files', file: 'src/App.tsx', diff: null, version: null })).toBe('?branch=login-page&section=files&file=src%2FApp.tsx')
    expect(viewAddressOf({ branch: 'main', section: 'git', file: null, diff: 'README.md', version: null })).toBe('?section=git&diff=README.md')
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

  it('knows a merge request’s link, and keeps it out of the place', () => {
    const params = new URLSearchParams('branch=login-page&merge=1')
    expect(asksToMerge(params)).toBe(true)
    expect(asksToMerge(new URLSearchParams('branch=login-page'))).toBe(false)
    expect(viewAddressOf({ ...({ branch: 'login-page', section: 'files', file: null, diff: null, version: null }) })).not.toContain('merge')
  })

  it('is the workspace’s own path', () => {
    expect(workspaceViewPath('w 1')).toBe('/workspaces/w%201/view')
  })
})

describe('what the browser remembers @SC-1688', () => {
  it('remembers the place per person and per workspace', () => {
    const store = memory()
    remember(store, 'u1', 'w1', { branch: 'login-page', section: 'files', file: 'a.ts', diff: null, version: null })
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

  it('lists workspaces most recently opened first @SC-1683', () => {
    const store = memory()
    noteOpened(store, 'u1', 'a')
    noteOpened(store, 'u1', 'b')
    noteOpened(store, 'u1', 'a')
    expect(recentWorkspaces(store, 'u1')).toEqual(['a', 'b'])
    const items = [{ id: 'c' }, { id: 'b' }, { id: 'a' }, { id: 'd' }]
    expect(byRecent(items, recentWorkspaces(store, 'u1')).map(i => i.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('keeps an older version of main in the address, never on a branch, and never remembers it', () => {
    expect(viewAddressOf({ branch: 'main', section: 'files', file: null, diff: null, version: 'v12' })).toBe('?section=files&version=v12')
    expect(viewAddressOf({ branch: 'login-page', section: 'files', file: null, diff: null, version: 'v12' })).toBe('?branch=login-page&section=files')
    expect(readViewAddress(new URLSearchParams('version=v12'))).toEqual({ version: 'v12' })
    expect(readViewAddress(new URLSearchParams('branch=login-page&version=v12'))).toEqual({ branch: 'login-page' })
    const store = new Map<string, string>()
    const s2 = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v) } }
    remember(s2, 'u1', 'w1', { branch: 'main', section: 'files', file: null, diff: null, version: 'v12' })
    expect(readRemembered(s2, 'u1', 'w1')).toEqual({ branch: 'main', section: 'files' })
  })
})
