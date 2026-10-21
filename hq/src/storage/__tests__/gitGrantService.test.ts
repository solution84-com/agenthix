import { describe, it, expect } from 'vitest'

import { assertRunCanAccessOwner } from '../gitGrantService'

const ctx = (over: Record<string, unknown> = {}) => ({
  kind: 'run',
  claims: { projectId: 'p1', userId: 'u1', agentId: 'a1', role: null, ...over },
}) as any

describe('a run reaches a repository because its boundary owns the attachment', () => {
  it('allows the project the run acts as', async () => {
    await expect(assertRunCanAccessOwner(ctx(), { ownerType: 'project', ownerId: 'p1', workspaceId: null }))
      .resolves.toBeUndefined()
  })

  it('refuses another project, whatever the agent is assigned to', async () => {
    await expect(assertRunCanAccessOwner(ctx(), { ownerType: 'project', ownerId: 'p2', workspaceId: null }))
      .rejects.toThrow(/boundary/i)
  })

  it('allows a person their own storage when the run acts as them', async () => {
    await expect(assertRunCanAccessOwner(
      ctx({ projectId: null, role: 'MEMBER' }), { ownerType: 'user', ownerId: 'u1', workspaceId: null },
    )).resolves.toBeUndefined()
  })

  it('refuses a person\'s storage to a run inside a project, even if a role were ever minted for it', async () => {
    await expect(assertRunCanAccessOwner(
      ctx({ projectId: 'p1', role: 'MEMBER' }), { ownerType: 'user', ownerId: 'u1', workspaceId: null },
    )).rejects.toThrow()
  })

  it('refuses another person\'s storage', async () => {
    await expect(assertRunCanAccessOwner(
      ctx({ projectId: null, role: 'MEMBER' }), { ownerType: 'user', ownerId: 'u2', workspaceId: null },
    )).rejects.toThrow(/boundary/i)
  })

  it('refuses a run with no boundary at all — it has nothing to act as', async () => {
    await expect(assertRunCanAccessOwner(
      ctx({ projectId: null, role: null }), { ownerType: 'project', ownerId: 'p1', workspaceId: null },
    )).rejects.toThrow(/boundary/i)
  })
})

describe("a person's connection (adr-0090)", () => {
  it('is no run, so it reaches no repository — its own person\'s storage included', async () => {
    const connection = { kind: 'connection', connection: { connectionId: 'c1', userId: 'u1', role: 'ADMIN', groups: new Set(), projectIds: null } } as any
    await expect(assertRunCanAccessOwner(connection, { ownerType: 'user', ownerId: 'u1', workspaceId: null })).rejects.toThrow()
    await expect(assertRunCanAccessOwner(connection, { ownerType: 'project', ownerId: 'p1', workspaceId: null })).rejects.toThrow()
  })
})
