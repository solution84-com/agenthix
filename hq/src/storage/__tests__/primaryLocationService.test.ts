import { describe, it, expect } from 'vitest'

import { resolvePrimaryLocation } from '../primaryLocationService'

describe('resolvePrimaryLocation @SC-244', () => {
  it('uses the session row location when set (a workspace)', () => {
    const loc = resolvePrimaryLocation({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: 'ws1', userId: 'u1', sessionType: 'chat' })
    expect(loc).toEqual({ ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1' })
  })

  it('uses an owner files location when no workspaceId', () => {
    const loc = resolvePrimaryLocation({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null, userId: 'u1', sessionType: 'chat' })
    expect(loc).toEqual({ ownerType: 'project', ownerId: 'p1', workspaceId: undefined })
  })
})

describe('resolvePrimaryLocation @SC-245', () => {
  it('falls back to the user files for a general chat (no primary set)', () => {
    const loc = resolvePrimaryLocation({ primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null, userId: 'u1', sessionType: 'chat' })
    expect(loc).toEqual({ ownerType: 'user', ownerId: 'u1' })
  })
})

describe('resolvePrimaryLocation — task session (ADR-0039 §10)', () => {
  it('resolves to a task location when session has taskId set', () => {
    const loc = resolvePrimaryLocation({
      primaryOwnerType: 'project',
      primaryOwnerId: 'p1',
      primaryWorkspaceId: null,
      taskId: 'task-uuid-123',
      userId: 'u1',
      sessionType: 'task',
    })
    expect(loc).toEqual({ ownerType: 'project', ownerId: 'p1', taskId: 'task-uuid-123' })
  })

  it('taskId takes precedence over workspaceId (should not occur in practice but is guarded)', () => {
    // TaskRunner never sets both; but if it did, taskId wins.
    const loc = resolvePrimaryLocation({
      primaryOwnerType: 'project',
      primaryOwnerId: 'p1',
      primaryWorkspaceId: 'ws1',
      taskId: 'task-uuid-123',
      userId: 'u1',
      sessionType: 'task',
    })
    expect(loc).toEqual({ ownerType: 'project', ownerId: 'p1', taskId: 'task-uuid-123' })
    expect(loc).not.toHaveProperty('workspaceId')
  })

  it('taskId null/undefined falls through to workspace/files logic', () => {
    const loc = resolvePrimaryLocation({
      primaryOwnerType: 'project',
      primaryOwnerId: 'p1',
      primaryWorkspaceId: 'ws1',
      taskId: null,
      userId: 'u1',
      sessionType: 'chat',
    })
    expect(loc).toEqual({ ownerType: 'project', ownerId: 'p1', workspaceId: 'ws1' })
  })
})
