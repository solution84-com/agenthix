import { describe, expect, it } from 'vitest'
import { parseBranchBack } from '../branchBack'

const HEAD = 'a'.repeat(40)
const frame = (over: Record<string, unknown> = {}) => ({
  workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
  copyId: '00000000-0000-4000-8000-000000000001',
  branch: 'add-login-page',
  cause: 'sweep',
  back: { head: HEAD, previous: null, moved: true, backup: null },
  runId: 'r1',
  ...over,
})

describe("a site's branch.back frame", () => {
  it('reads the fields hq uses', () => {
    expect(parseBranchBack(frame())).toEqual({
      workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
      copyId: '00000000-0000-4000-8000-000000000001', branch: 'add-login-page', back: { head: HEAD, moved: true },
    })
  })

  it('drops a frame that does not fit', () => {
    expect(parseBranchBack(null)).toBeNull()
    expect(parseBranchBack(frame({ copyId: '../../etc' }))).toBeNull()
    expect(parseBranchBack(frame({ branch: '-x' }))).toBeNull()
    expect(parseBranchBack(frame({ back: { head: 'HEAD~1', moved: true } }))).toBeNull()
    expect(parseBranchBack(frame({ workspace: { ownerType: 'project' } }))).toBeNull()
  })
})
