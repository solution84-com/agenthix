// @vitest-environment jsdom
/** A skill's files when the chosen file's read fails, and the versions read's own nudge (C7, C10). */
import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, renderHook, screen } from '@testing-library/react'
import { ReadNudgesHeld } from '@agenthix/ui/attention'

const h = vi.hoisted(() => ({ content: {} as Record<string, unknown>, versions: {} as Record<string, unknown> }))
vi.mock('wasp/client/operations', () => ({
  getAssetDiff: 'diff', getAssetContent: 'content', getAssetVersions: 'versions',
  useQuery: (q: string) => (q === 'content' ? h.content : q === 'versions' ? h.versions : { data: undefined, refetch: vi.fn() }),
}))

import { SkillFiles } from '../skill/SkillFiles'
import { useSkillVersions } from '../skill/SkillVersionMenu'

const noAnswer = Object.assign(new Error('Failed to fetch'), { statusCode: undefined })
const files = [{ path: 'SKILL.md', size: 10, kind: 'markdown', contentType: 'text/markdown' }, { path: 'a.py', size: 5, kind: 'code', contentType: 'text/x-python' }]
afterEach(cleanup)

describe('SkillFiles @SC-1910 @SC-1929', () => {
  it('says a failed file read in the file pane, never "no files", and keeps the tree', () => {
    h.content = { data: { files, opened: { path: 'SKILL.md', base64: btoa('x') } }, error: null, dataUpdatedAt: Date.now(), refetch: vi.fn(), isLoading: false }
    const { rerender } = render(<SkillFiles assetId="a1" versionId={null} version="1.0.0" narrow={false} />)
    h.content = { data: undefined, error: noAnswer, dataUpdatedAt: 0, refetch: vi.fn(), isLoading: false }
    rerender(<SkillFiles assetId="a1" versionId={null} version="1.0.0" narrow={false} />)
    expect(screen.queryByText('This version has no files to show.')).toBeNull()
    expect(screen.getByTestId('asset-file-failed').textContent).toContain('The file could not be read')
    expect(screen.getAllByTestId('tree-file').length).toBe(2)
    expect(screen.getByTestId('asset-tree').textContent).not.toContain('could not be read')
  })
})

describe('useSkillVersions nudge @SC-1910', () => {
  const failed = (error: unknown) => { h.versions = { data: undefined, error, dataUpdatedAt: 0, refetch: vi.fn() } }
  const nudge = (held: boolean) => {
    const { result } = renderHook(() => useSkillVersions('a1'), { wrapper: ({ children }) => <ReadNudgesHeld.Provider value={held}>{children}</ReadNudgesHeld.Provider> })
    return render(<>{result.current.nudge}</>).container
  }

  it('is not drawn while the frame line holds read nudges back', () => {
    failed(noAnswer)
    expect(nudge(true).textContent).toBe('')
    expect(nudge(false).textContent).toContain('The versions could not be read')
  })

  it('offers no Try again on a final answer', () => {
    failed(Object.assign(new Error('no'), { statusCode: 404 }))
    const c = nudge(false)
    expect(c.textContent).toContain('The versions could not be read')
    expect(c.querySelector('button')).toBeNull()
  })
})
