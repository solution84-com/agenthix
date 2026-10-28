// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { EditorView } from '../editorTypes'
import type { EditorApi } from '../useEditorApi'
import { base64OfBytes, bytesOfText } from '../editorFiles'
import { useEditorState } from '../useEditorState'
import { AUTOSAVE_MS } from '../editorWords'

const data = (text: string) => [{ path: 'SKILL.md', base64: base64OfBytes(bytesOfText(text)) }]
const md = (body: string) => `---\nname: notes\ndescription: Writes notes\n---\n${body}\n`

const view = (body: string, revision: number | null): EditorView => ({
  target: { kind: 'library', assetId: 'a1' }, name: 'notes', identity: 'org/notes', where: 'Library', revision,
  files: data(md(body)), base: data(md('one')), baseLabel: 'version 1.0.0', inUse: '1.0.0', draftBy: null, revisions: [],
  editsHere: true, notEditableReason: null, mayPublish: true, nextVersions: null, nextNumber: null,
  agentsWith: { everyAgent: false, names: [] }, warnings: [],
})

const typed = (body: string) => ({ path: 'SKILL.md', bytes: bytesOfText(md(body)) })

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

function setUp(save: EditorApi['save']) {
  const api = { save, discard: vi.fn(), publish: vi.fn() } as unknown as EditorApi
  const reload = vi.fn().mockResolvedValue(undefined)
  const hook = renderHook(({ v }) => useEditorState(v, api, reload), { initialProps: { v: view('one', null) } })
  return { hook, reload }
}

describe('the draft saves itself (finding 8)', () => {
  it('saves a moment after the person stops typing, once, with the revision loaded, then counts as saved', async () => {
    const save = vi.fn().mockResolvedValue({ revision: 1 })
    const { hook } = setUp(save)
    act(() => hook.result.current.edit(typed('tw')))
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS - 100) })
    act(() => hook.result.current.edit(typed('two')))
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS - 100) })
    expect(save).not.toHaveBeenCalled()
    expect(hook.result.current.dirty).toBe(true)

    await act(async () => { vi.advanceTimersByTime(100) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual([{ path: 'SKILL.md', text: md('two') }])
    expect(save.mock.calls[0][1]).toBeNull()
    expect(hook.result.current.dirty).toBe(false)

    act(() => hook.result.current.edit(typed('three')))
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS) })
    expect(save.mock.calls[1][1]).toBe(1)
  })

  it('tries a refused save again only after the next change, and says why it failed', async () => {
    const save = vi.fn().mockRejectedValue(new Error('The site is unreachable. Nothing was changed.'))
    const { hook } = setUp(save)
    act(() => hook.result.current.edit(typed('two')))
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS) })
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS * 5) })
    expect(save).toHaveBeenCalledTimes(1)
    expect(hook.result.current.failed).toMatch(/unreachable/)
    act(() => hook.result.current.edit(typed('three')))
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS) })
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('never saves over a draft that moved under the person until they choose', async () => {
    const save = vi.fn().mockResolvedValue({ revision: 3 })
    const { hook } = setUp(save)
    act(() => hook.result.current.edit(typed('mine')))
    hook.rerender({ v: view('theirs', 2) })
    expect(hook.result.current.moved).toBe(true)
    await act(async () => { vi.advanceTimersByTime(AUTOSAVE_MS * 3) })
    expect(save).not.toHaveBeenCalled()

    await act(async () => { await hook.result.current.save() })
    expect(save).toHaveBeenCalledWith([{ path: 'SKILL.md', text: md('mine') }], 2)
    expect(hook.result.current.moved).toBe(false)
  })
})
