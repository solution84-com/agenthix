/** A repository is connected to a place's files or a workspace, never to a task's folder (spec part 4). */
import { describe, it, expect, vi } from 'vitest'

vi.mock('wasp/server', () => ({
  HttpError: class extends Error { constructor(readonly statusCode: number, message: string) { super(message) } },
}))

import { requireRepoTarget } from '../repoTarget'

describe('the target of a repository', () => {
  it('passes a place\'s files and a workspace on as they are', () => {
    const place = { ownerType: 'project' as const, ownerId: 'p1' }
    const workspace = { ...place, workspaceId: 'ws1', taskId: null }
    expect(requireRepoTarget(place, true)).toBe(place)
    expect(requireRepoTarget(workspace, false)).toBe(workspace)
  })

  it('refuses a task\'s folder, and says nothing was changed when the call changes something', () => {
    const task = { ownerType: 'project' as const, ownerId: 'p1', workspaceId: null, taskId: 't1' }
    expect(() => requireRepoTarget(task, true)).toThrow(/not to a task's folder\. Nothing was changed\.$/)
    expect(() => requireRepoTarget(task, false)).toThrow(/^(?!.*Nothing was changed).*task's folder\.$/)
    expect(() => requireRepoTarget(task, true)).toThrowError(expect.objectContaining({ statusCode: 400 }))
  })
})
