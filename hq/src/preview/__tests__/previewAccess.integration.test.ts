/**
 * Two reads a preview makes of hq's own tables, against the real test database:
 *
 * - the boundary a run may preview, derived from the session its verified claims
 *   name and never from the caller, with the site that holds it;
 * - who may watch a preview: whoever may reach the storage boundary on its row,
 *   asked of the one location access rule (@SC-230).
 *
 * The site call a named workspace makes is the only stand-in.
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createSession, createUser, ensureExecutionSite, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})
vi.mock('../../storage/workspaceStore', () => ({ getWorkspace: vi.fn() }))

import { getWorkspace } from '../../storage/workspaceStore'
import { ControlPlaneError } from '../../server/controlplane/types'
import { resolvePreviewBoundary } from '../previewBoundary'
import { authorizePreview, canAccess } from '../previewAuth'

async function refusal(p: Promise<unknown>): Promise<ControlPlaneError> {
  try {
    await p
  } catch (err) {
    return err as ControlPlaneError
  }
  throw new Error('expected a refusal')
}

describe('the boundary a preview runs in', () => {
  it('comes from the session the claims name, with the site that holds it and its owner slug', async () => {
    const site = await ensureExecutionSite()
    const project = await createProject({ slug: 'acme' })
    const session = await createSession({ primaryOwnerType: 'project', primaryOwnerId: project.id })

    const resolved = await resolvePreviewBoundary({ agentId: session.agentId, sessionId: session.id })

    expect(resolved).toEqual({
      agentId: session.agentId,
      sessionId: session.id,
      siteId: site.siteId,
      location: { ownerType: 'project', ownerId: project.id, workspaceId: undefined },
      ownerSlug: 'acme',
    })
  })

  it('carries a workspace run into its own workspace, and a task run into its own task', async () => {
    const project = await createProject()
    const ws = await createSession({ primaryOwnerType: 'project', primaryOwnerId: project.id, primaryWorkspaceId: 'ws-1' })
    const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: ws.userId } })
    const tk = await createSession({ primaryOwnerType: 'project', primaryOwnerId: project.id, taskId: task.id, sessionType: 'task' })

    expect((await resolvePreviewBoundary({ agentId: ws.agentId, sessionId: ws.id })).location)
      .toMatchObject({ ownerId: project.id, workspaceId: 'ws-1' })
    expect((await resolvePreviewBoundary({ agentId: tk.agentId, sessionId: tk.id })).location)
      .toMatchObject({ ownerId: project.id, taskId: task.id })
  })

  it("names a personal project's person for its task, and nobody for a chat there or for a shared project's task", async () => {
    const owner = await createUser()
    const personal = await createProject({ personalOwnerId: owner.id })
    const shared = await createProject()
    const task = await createSession({ userId: owner.id, primaryOwnerType: 'project', primaryOwnerId: personal.id, sessionType: 'task' })
    const chat = await createSession({ userId: owner.id, primaryOwnerType: 'project', primaryOwnerId: personal.id })
    const sharedTask = await createSession({ primaryOwnerType: 'project', primaryOwnerId: shared.id, sessionType: 'task' })

    expect((await resolvePreviewBoundary({ agentId: task.agentId, sessionId: task.id })).personalOwnerId).toBe(owner.id)
    expect((await resolvePreviewBoundary({ agentId: chat.agentId, sessionId: chat.id })).personalOwnerId).toBeUndefined()
    expect((await resolvePreviewBoundary({ agentId: sharedTask.agentId, sessionId: sharedTask.id })).personalOwnerId).toBeUndefined()
  })

  it("runs a chat with no storage of its own in its person's storage, on the default site", async () => {
    const site = await ensureExecutionSite()
    const session = await createSession()
    expect(await resolvePreviewBoundary({ agentId: session.agentId, sessionId: session.id })).toMatchObject({
      siteId: site.siteId,
      location: { ownerType: 'user', ownerId: session.userId },
      ownerSlug: 'personal',
    })
  })

  // Every refusal crosses the control-plane forward, which answers a plain
  // Error with "internal error" — so a reason that is not a ControlPlaneError is
  // a reason nobody reads.
  it('refuses a session it cannot find, naming it', async () => {
    const err = await refusal(resolvePreviewBoundary({ agentId: 'a', sessionId: 'sess-missing' }))
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('not_found')
    expect(err.message).toMatch(/sess-missing/)
  })

  it('refuses when no Execution Site holds that storage', async () => {
    const project = await createProject({ executionSiteId: null })
    const session = await createSession({ primaryOwnerType: 'project', primaryOwnerId: project.id })
    const err = await refusal(resolvePreviewBoundary({ agentId: session.agentId, sessionId: session.id }))
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('not_found')
    expect(err.message).toMatch(/No Execution Site/)
  })
})

describe('who may watch a preview @SC-230', () => {
  const on = (over: Record<string, unknown>) =>
    ({ id: 'p1', token: 'tok', status: 'running', sessionId: 's1', agentId: 'a1', ownerType: null, ownerId: null, workspaceId: null, taskId: null, ...over }) as never

  it('admits a member of the private project whose files are behind it, and refuses anyone else', async () => {
    const insider = await createUser()
    const outsider = await createUser()
    const project = await createProject({ accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: project.id, userId: insider.id } })
    const row = on({ ownerType: 'project', ownerId: project.id })

    expect(await canAccess(insider, row)).toBe(true)
    expect(await canAccess(outsider, row)).toBe(false)
  })

  it('refuses a row written before the boundary was recorded, rather than admitting it', async () => {
    expect(await canAccess(await createUser(), on({}))).toBe(false)
  })

  it("admits a person to their own personal storage, and refuses them another person's", async () => {
    const me = await createUser()
    const other = await createUser()
    expect(await canAccess(me, on({ ownerType: 'user', ownerId: me.id }))).toBe(true)
    expect(await canAccess(me, on({ ownerType: 'user', ownerId: other.id }))).toBe(false)
  })

  it('refuses a project that no longer exists', async () => {
    expect(await canAccess(await createUser(), on({ ownerType: 'project', ownerId: 'gone' }))).toBe(false)
  })

  // The rule refuses a workspace it cannot verify rather than opening an
  // unvalidated location, and that refusal must not become a pass here.
  it('refuses when the site holding the named workspace cannot answer', async () => {
    const project = await createProject({ accessLevel: 'OPEN' })
    const member = await createUser()
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    vi.mocked(getWorkspace).mockRejectedValue(new Error('Execution Site site-b is unreachable'))
    expect(await canAccess(member, on({ ownerType: 'project', ownerId: project.id, workspaceId: 'ws-1' }))).toBe(false)
  })

  // The whole door, not just the policy: an outsider naming a live preview gets 403.
  it('answers 403 at the door for an outsider naming a live preview', async () => {
    const project = await createProject({ accessLevel: 'PRIVATE' })
    const res = await authorizePreview('tok', await createUser(), {
      getById: async () => on({ ownerType: 'project', ownerId: project.id }),
      canAccess,
    })
    expect(res).toMatchObject({ ok: false, code: 403 })
  })
})
