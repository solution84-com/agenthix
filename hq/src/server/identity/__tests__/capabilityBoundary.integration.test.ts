/**
 * Who a capability says the run is for, against the real test database: the
 * runner, the role a run may carry (@SC-298, ADR-0060), the project it
 * is scoped to, the site it is placed on (@SC-318), and a personal project's
 * task, which is its person's (agents own schedule spec §4).
 */
process.env.SECRETS_MASTER_KEY = Buffer.alloc(32, 7).toString('base64')

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { LocationRef } from '@agenthix/core'
import { prisma } from '../../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../../storage/workspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../storage/workspaceStore')>()
  return { ...actual, getWorkspace: vi.fn(async (id: string) => ({ id, allowedTools: null })) }
})

import { resolveCapabilityClaims } from '../capabilityService'
import { agent, chatSession, chatLoc, userFilesLoc, projectTaskLoc, seedOrganisation, seedPersonalProject, site, override } from './capabilityFixtures'

type MintArgs = Parameters<typeof resolveCapabilityClaims>[0]
const mint = (session: Record<string, unknown>, primaryLoc: LocationRef, taskId: string | null = null) =>
  resolveCapabilityClaims({ agent, session: { ...chatSession, ...session } as MintArgs['session'], primaryLoc, taskId, startedBy: 'person' })
const role = (userId: string, value: 'ADMIN' | 'MEMBER') => prisma.userSettings.create({ data: { userId, role: value } })

let site1: { id: string }
beforeEach(async () => {
  ;({ site1 } = await seedOrganisation())
})

describe('the runner claim at mint', () => {
  it('a chat in a project runs for the invoking person', async () => {
    const claims = await mint({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null }, { ownerType: 'project', ownerId: 'p1' })
    expect(claims.runner).toEqual({ kind: 'person', userId: 'u1' })
  })

  it('a task in a project runs for the project', async () => {
    const claims = await mint({ sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null, taskId: 't1' }, projectTaskLoc, 't1')
    expect(claims.runner).toEqual({ kind: 'project', projectId: 'p1' })
  })

  it("a task in a person's own storage runs for that person, whoever the session names", async () => {
    await seedPersonalProject('u1', site1.id)
    const claims = await mint(
      { sessionType: 'task', userId: 'admin-1', primaryOwnerType: 'user', primaryOwnerId: 'u1', primaryWorkspaceId: null, taskId: 't-mine' },
      { ownerType: 'user', ownerId: 'u1', taskId: 't-mine' }, 't-mine',
    )
    expect(claims.runner).toEqual({ kind: 'person', userId: 'u1' })
  })

  it("refuses a project's task whose session works in a person's own storage", async () => {
    await expect(mint(
      { sessionType: 'task', userId: 'admin-1', primaryOwnerType: 'user', primaryOwnerId: 'u1', primaryWorkspaceId: null, taskId: 't1' },
      { ownerType: 'user', ownerId: 'u1', taskId: 't1' }, 't1',
    )).rejects.toThrow("does not match its task's boundary")
  })

  it("refuses to mint a chat in another person's own storage", async () => {
    await expect(mint({ userId: 'bob' }, { ownerType: 'user', ownerId: 'u1' })).rejects.toThrow('cannot be given a runner')
  })
})

describe('mint-time role resolution @SC-298', () => {
  it("a chat in the person's own storage carries their role from their own settings, and no project", async () => {
    await role('u1', 'MEMBER')
    await prisma.user.create({ data: { id: 'someone-else' } })
    await role('someone-else', 'ADMIN')
    const claims = await mint({}, chatLoc)
    expect(claims.role).toBe('MEMBER')
    expect(claims.projectId).toBeNull()
  })

  it("a task mint carries no role even when the session's user is an ADMIN", async () => {
    await role('u1', 'ADMIN')
    const claims = await mint({ taskId: 't1', primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null }, projectTaskLoc, 't1')
    expect(claims.role).toBeNull()
  })

  it('a non-chat session carries no role even with no task', async () => {
    await role('u1', 'ADMIN')
    expect((await mint({ sessionType: 'task' }, chatLoc)).role).toBeNull()
  })

  it('a chat with no settings row resolves to no role', async () => {
    expect((await mint({}, chatLoc)).role).toBeNull()
  })

  it('a chat in a project carries no role — the run acts as the project (ADR-0060)', async () => {
    await role('u1', 'ADMIN')
    const claims = await mint({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null }, { ownerType: 'project', ownerId: 'p1' })
    expect(claims.role).toBeNull()
    expect(claims.projectId).toBe('p1')
  })

  it("a task run carries its task's current project as the scope", async () => {
    await prisma.project.create({ data: { id: 'p-moved', name: 'Moved', key: 'MOVED', executionSiteId: site1.id } })
    await prisma.task.update({ where: { id: 't1' }, data: { projectId: 'p-moved' } })
    const claims = await mint({ taskId: 't1', primaryOwnerType: 'project', primaryOwnerId: 'p-moved', primaryWorkspaceId: null }, { ownerType: 'project', ownerId: 'p-moved', taskId: 't1' }, 't1')
    expect(claims.projectId).toBe('p-moved')
    expect(claims.role).toBeNull()
  })

  // gitGrantService infers "this run acts as the person in userId" from a
  // non-null role, which holds only while every mint keeps this invariant.
  it("whenever a mint returns a role, projectId is null and userId is the session's own user", async () => {
    await role('u1', 'MEMBER')
    const results = await Promise.all([
      mint({}, chatLoc),
      mint({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null }, { ownerType: 'project', ownerId: 'p1' }),
      mint({ taskId: 't1', primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null }, projectTaskLoc, 't1'),
    ])
    for (const claims of results) {
      if (claims.role !== null) {
        expect(claims.projectId).toBeNull()
        expect(claims.userId).toBe(chatSession.userId)
      }
    }
    // Not vacuous: the chat in the person's own storage is granted one.
    expect(results.some((c) => c.role !== null)).toBe(true)
  })
})

describe('a run is placed on the site holding its storage @SC-318', () => {
  it("places a run in a project, files or task, on the project's own site", async () => {
    const other = await site('site-project')
    await prisma.project.update({ where: { id: 'p1' }, data: { executionSiteId: other.id } })
    const inTask = await mint({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null, taskId: 't1' }, projectTaskLoc, 't1')
    const inFiles = await mint({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null }, { ownerType: 'project', ownerId: 'p1' })
    expect([inTask.siteId, inFiles.siteId]).toEqual(['site-project', 'site-project'])
  })

  it("places a run in a person's own storage on the site holding that storage", async () => {
    const home = await site('site-holding-u1')
    await prisma.userStoragePlacement.update({ where: { userId: 'u1' }, data: { siteId: home.id } })
    const claims = await mint({ primaryOwnerType: null, primaryOwnerId: null, primaryWorkspaceId: null }, userFilesLoc)
    expect(claims.siteId).toBe('site-holding-u1')
  })

  it('places a workspace-primary run on the site holding that workspace', async () => {
    const holder = await site('site-holding-w1')
    await prisma.workspacePlacement.update({ where: { workspaceId: 'w1' }, data: { siteId: holder.id } })
    expect((await mint({}, chatLoc)).siteId).toBe('site-holding-w1')
  })

  it('gives two agents the same answer for the same location', async () => {
    const loc: LocationRef = { ownerType: 'project', ownerId: 'p1' }
    const session = { ...chatSession, primaryOwnerType: 'project' as const, primaryOwnerId: 'p1', primaryWorkspaceId: null }
    const here = await resolveCapabilityClaims({ agent, session, primaryLoc: loc, taskId: null, startedBy: 'person' })
    const elsewhere = await resolveCapabilityClaims({ agent: { ...agent, id: 'a2' }, session, primaryLoc: loc, taskId: null, startedBy: 'person' })
    expect([here.siteId, elsewhere.siteId]).toEqual(['site-1', 'site-1'])
  })

  it('refuses a project with no execution site rather than falling back', async () => {
    await prisma.project.update({ where: { id: 'p1' }, data: { executionSiteId: null } })
    await expect(mint({ primaryOwnerType: 'project', primaryOwnerId: 'p1', primaryWorkspaceId: null }, { ownerType: 'project', ownerId: 'p1' }))
      .rejects.toThrow('Project p1 has no Execution Site')
  })
})

describe("a personal project's task run is its person's", () => {
  const personalTask = {
    id: 's-mine', sessionType: 'task', userId: 'u1', taskId: 't-mine',
    primaryOwnerType: 'user' as const, primaryOwnerId: 'u1', primaryWorkspaceId: null,
  }
  const personalLoc: LocationRef = { ownerType: 'user', ownerId: 'u1', taskId: 't-mine' }

  beforeEach(async () => {
    await seedPersonalProject('u1', site1.id)
  })

  it("runs for its person, scoped to its own personal project, with no role and their overrides", async () => {
    await role('u1', 'ADMIN')
    await override('user', 'u1', { allowedTools: [{ name: 'write_file', state: 'never' }] })
    await override('project', 'p-mine', { allowedTools: [{ name: 'read_file', state: 'never' }] })
    const claims = await resolveCapabilityClaims({ agent, session: personalTask, primaryLoc: personalLoc, taskId: 't-mine', startedBy: 'person' })
    expect(claims).toMatchObject({ runner: { kind: 'person', userId: 'u1' }, projectId: 'p-mine', role: null, userId: 'u1' })
    // The person's narrowing applied, the personal project's did not.
    expect(claims.permissions.neverTools).toContain('write_file')
    expect(claims.permissions.neverTools).not.toContain('read_file')
  })

  it("is placed on the site holding its person's storage", async () => {
    const home = await site('site-home')
    await prisma.userStoragePlacement.update({ where: { userId: 'u1' }, data: { siteId: home.id } })
    const claims = await resolveCapabilityClaims({ agent, session: personalTask, primaryLoc: personalLoc, taskId: 't-mine', startedBy: 'person' })
    expect(claims.siteId).toBe('site-home')
  })

  it("refuses a session that names the personal project's own storage — it has none to mount", async () => {
    await expect(resolveCapabilityClaims({
      agent, session: { ...personalTask, primaryOwnerType: 'project', primaryOwnerId: 'p-mine' },
      primaryLoc: { ownerType: 'project', ownerId: 'p-mine', taskId: 't-mine' }, taskId: 't-mine', startedBy: 'person',
    })).rejects.toThrow("personal project's storage")
  })

  it("refuses a session in another person's storage", async () => {
    await prisma.user.create({ data: { id: 'u2' } })
    await prisma.userStoragePlacement.create({ data: { userId: 'u2', siteId: site1.id } })
    await expect(resolveCapabilityClaims({
      agent, session: { ...personalTask, userId: 'u2', primaryOwnerId: 'u2' },
      primaryLoc: { ownerType: 'user', ownerId: 'u2', taskId: 't-mine' }, taskId: 't-mine', startedBy: 'person',
    })).rejects.toThrow("does not match its task's boundary")
  })

  it("refuses a chat bound to a personal project's storage, its owner's included", async () => {
    await expect(resolveCapabilityClaims({
      agent, session: { ...chatSession, primaryOwnerType: 'project', primaryOwnerId: 'p-mine', primaryWorkspaceId: null },
      primaryLoc: { ownerType: 'project', ownerId: 'p-mine' }, taskId: null, startedBy: 'person',
    })).rejects.toThrow("personal project's storage")
  })
})
