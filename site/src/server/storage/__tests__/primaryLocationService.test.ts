/**
 * `getLocationCwd` is site's alone — hq names a run's location, site creates the
 * directory that name resolves to. These two cases moved here from hq's own
 * suite with the function.
 *
 * Tagged SC-244, which is the scenario whose text they answer: "the run's cwd
 * is that nested dir". Their hq describe was tagged SC-246 (session scratch),
 * which these cases never covered — it shared a describe with the scratch case
 * that has since gone.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const h = vi.hoisted(() => ({ code: new Set<string>() }))
vi.mock('../../../agents/runtime/homeFolder', () => ({ ensureFoldersUnder: vi.fn().mockResolvedValue(undefined) }))
vi.mock('../codeSpace', () => ({ isCodeWorkspace: vi.fn(async (ws: { workspaceId: string }) => h.code.has(ws.workspaceId)) }))
vi.mock('../paths', () => ({
  locationDir: (l: { ownerType: string; ownerId: string; taskId?: string; workspaceId?: string }) => {
    if (l.taskId) return `/site/${l.ownerType}s/${l.ownerId}/tasks/${l.taskId}`
    if (l.workspaceId) return `/site/${l.ownerType}s/${l.ownerId}/workspaces/${l.workspaceId}`
    return `/site/${l.ownerType}s/${l.ownerId}/files`
  },
  ownerDir: (ownerType: string, ownerId: string) => `/site/${ownerType}s/${ownerId}`,
  getCodeDir: (w: { ownerType: string; ownerId: string; workspaceId: string }) => `/site/code/${w.ownerType}s/${w.ownerId}/${w.workspaceId}`,
}))

import { ensureFoldersUnder } from '../../../agents/runtime/homeFolder'
import { getLocationCwd } from '../primaryLocationService'

beforeEach(() => {
  vi.clearAllMocks()
  h.code.clear()
})

describe('getLocationCwd @SC-244', () => {
  it('ensures + returns the cwd dir, made from the boundary\'s own folder down (adr-0173)', async () => {
    const dir = await getLocationCwd({ ownerType: 'user', ownerId: 'u1' })
    expect(dir).toBe('/site/users/u1/files')
    expect(ensureFoldersUnder).toHaveBeenCalledWith('/site/users/u1', ['files'])
  })

  it('task location cwd is under tasks/{taskId}/', async () => {
    const dir = await getLocationCwd({ ownerType: 'project', ownerId: 'p1', taskId: 'task-uuid-123' })
    expect(dir).toBe('/site/projects/p1/tasks/task-uuid-123')
    expect(ensureFoldersUnder).toHaveBeenCalledWith('/site/projects/p1', ['tasks/task-uuid-123'])
  })

  it("a repository workspace's is its main in the code space, and nothing is made in the boundary", async () => {
    h.code.add('w1')
    expect(await getLocationCwd({ ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' })).toBe('/site/code/projects/p1/w1')
    expect(ensureFoldersUnder).not.toHaveBeenCalled()
  })
})
