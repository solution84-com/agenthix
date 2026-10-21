/**
 * Which sites hear that a membership ended (person-scoped execution spec §4),
 * against the real test database and the real site resolution dispatch uses:
 * the storage site plus the site of every session concerned, never a site hq
 * cannot hold an instruction for, and never a throw.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createUser, createAgent, createProject, createTestTask } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { sitesForMemberInProject, sitesForProject, sitesForPerson, nonMembersWhoWorkedIn } from '../membershipEnding'

let seq = 0
function makeSite(data: Record<string, unknown> = {}) {
  seq++
  return prisma.executionSite.create({ data: { siteId: `site-${seq}`, label: `Site ${seq}`, credentialHash: 'h'.repeat(64), ...data } })
}

let agentId: string
beforeEach(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  agentId = (await createAgent()).id
})

/** A chat in the project's files, or in one of its workspaces placed on `placedOn` (none: never placed). */
async function chatIn(projectId: string, userId: string, workspace?: { placedOn: string | null }) {
  seq++
  const workspaceId = workspace ? `ws-${seq}` : null
  if (workspace?.placedOn) await prisma.workspacePlacement.create({ data: { workspaceId: workspaceId!, siteId: workspace.placedOn } })
  return prisma.agentSession.create({
    data: { userId, agentId, sessionType: 'chat', primaryOwnerType: 'project', primaryOwnerId: projectId, primaryWorkspaceId: workspaceId },
  })
}

describe('sitesForMemberInProject', () => {
  it("is the project's storage site and the site of each of the member's sessions there, each once, never a revoked one", async () => {
    const [storage, workspaceSite, revoked, elsewhere] = [await makeSite(), await makeSite(), await makeSite({ status: 'REVOKED' }), await makeSite()]
    const project = await createProject({ executionSiteId: storage.id })
    const member = await createUser()
    const colleague = await createUser()
    await chatIn(project.id, member.id)
    await chatIn(project.id, member.id, { placedOn: workspaceSite.id })
    await chatIn(project.id, member.id, { placedOn: workspaceSite.id })
    await chatIn(project.id, member.id, { placedOn: revoked.id })
    await chatIn(project.id, colleague.id, { placedOn: elsewhere.id })

    expect(await sitesForMemberInProject(project.id, member.id)).toEqual([storage.siteId, workspaceSite.siteId])
  })

  it('still answers when the storage site or a session cannot be placed', async () => {
    const workspaceSite = await makeSite()
    const project = await createProject({ executionSiteId: null })
    const member = await createUser()
    await chatIn(project.id, member.id, { placedOn: workspaceSite.id })
    await chatIn(project.id, member.id, { placedOn: null })

    expect(await sitesForMemberInProject(project.id, member.id)).toEqual([workspaceSite.siteId])
  })

  it("counts a session on one of the project's tasks, wherever that session works", async () => {
    const storage = await makeSite()
    const taskSite = await makeSite()
    const project = await createProject({ executionSiteId: storage.id })
    const filesElsewhere = await createProject({ executionSiteId: taskSite.id })
    const member = await createUser()
    const task = await createTestTask({ data: { title: 't', projectId: project.id, number: 1, onBehalfOfUserId: member.id } })
    await prisma.agentSession.create({
      data: { userId: member.id, agentId, sessionType: 'task', taskId: task.id, primaryOwnerType: 'project', primaryOwnerId: filesElsewhere.id },
    })

    expect(await sitesForMemberInProject(project.id, member.id)).toEqual([storage.siteId, taskSite.siteId])
  })
})

describe('sitesForProject', () => {
  it('uses the storage site it is given rather than reading it again, and adds every session\'s site', async () => {
    const [storage, given, workspaceSite] = [await makeSite(), await makeSite(), await makeSite()]
    const project = await createProject({ executionSiteId: storage.id })
    await chatIn(project.id, (await createUser()).id, { placedOn: workspaceSite.id })

    expect(await sitesForProject(project.id, given.siteId)).toEqual([given.siteId, workspaceSite.siteId])
    expect(await sitesForProject(project.id)).toEqual([storage.siteId, workspaceSite.siteId])
  })
})

describe('sitesForPerson', () => {
  it('is every site that is not revoked', async () => {
    const a = await makeSite({ status: 'ONLINE' })
    const b = await makeSite({ status: 'OFFLINE' })
    await makeSite({ status: 'REVOKED' })

    expect((await sitesForPerson()).sort()).toEqual([a.siteId, b.siteId].sort())
  })
})

describe('nonMembersWhoWorkedIn', () => {
  it('counts only chats in the project, by people who are not its members, each once', async () => {
    const site = await makeSite()
    const project = await createProject({ executionSiteId: site.id })
    const other = await createProject({ executionSiteId: site.id })
    const [member, visitor, taskRunner, elsewhere] = [await createUser(), await createUser(), await createUser(), await createUser()]
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id } })
    await chatIn(project.id, member.id)
    await chatIn(project.id, visitor.id)
    await chatIn(project.id, visitor.id)
    await prisma.agentSession.create({
      data: { userId: taskRunner.id, agentId, sessionType: 'task', primaryOwnerType: 'project', primaryOwnerId: project.id },
    })
    await chatIn(other.id, elsewhere.id)

    expect(await nonMembersWhoWorkedIn(project.id)).toEqual([visitor.id])
  })
})
