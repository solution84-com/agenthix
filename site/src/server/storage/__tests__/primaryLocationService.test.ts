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

vi.mock('node:fs/promises', () => ({ default: { mkdir: vi.fn().mockResolvedValue(undefined) } }))
vi.mock('../paths', () => ({
  locationDir: (l: { ownerType: string; ownerId: string; taskId?: string; workspaceId?: string }) => {
    if (l.taskId) return `/site/${l.ownerType}s/${l.ownerId}/tasks/${l.taskId}`
    if (l.workspaceId) return `/site/${l.ownerType}s/${l.ownerId}/workspaces/${l.workspaceId}`
    return `/site/${l.ownerType}s/${l.ownerId}/files`
  },
}))

import fs from 'node:fs/promises'
import { getLocationCwd } from '../primaryLocationService'

beforeEach(() => vi.clearAllMocks())

describe('getLocationCwd @SC-244', () => {
  it('ensures + returns the cwd dir', async () => {
    const dir = await getLocationCwd({ ownerType: 'user', ownerId: 'u1' })
    expect(dir).toBe('/site/users/u1/files')
    expect(fs.mkdir).toHaveBeenCalledWith('/site/users/u1/files', { recursive: true })
  })

  it('task location cwd is under tasks/{taskId}/', async () => {
    const dir = await getLocationCwd({ ownerType: 'project', ownerId: 'p1', taskId: 'task-uuid-123' })
    expect(dir).toBe('/site/projects/p1/tasks/task-uuid-123')
    expect(fs.mkdir).toHaveBeenCalledWith('/site/projects/p1/tasks/task-uuid-123', { recursive: true })
  })
})
