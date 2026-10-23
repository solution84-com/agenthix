/**
 * Changing and deleting a project, against the real test DB (SC-018, SC-304).
 * Filing a project under a product or programme is the org admin's; its own
 * fields are its project admin's; only named fields are ever written. Deleting
 * one is the org admin's: its running work stops first, its rows go in one
 * transaction with the instruction to the sites that hold its homes, and its
 * folder is removed last. The site calls are the shared fake or replaced here,
 * so what each site was asked can be read back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MEMBERSHIP_METHODS } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createAgent, createProduct, createProgram, createProject, createSession, ensureExecutionSite } from '../../test/factories'
import { makeTask } from './projectsHarness'

const files = vi.hoisted(() => ({ removeLocationOnSite: vi.fn() }))
vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  ...files,
}))
// No site is connected here unless a test says so, so held instructions stay held.
const channel = vi.hoisted(() => ({ isOnline: vi.fn(), request: vi.fn() }))
vi.mock('../../sites/channel', () => ({ siteChannelRegistry: channel }))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))

import { updateProject, deleteProject } from '../actions'
import { updateProject as updateProjectRecord, deleteProject as deleteProjectRecord } from '../projectService'
import * as siteStore from '../../test/fakes/siteRuntimeStore'

const SITE = 'site-1'
const as = (user: { id: string } | null) => ({ user: user ?? undefined }) as any

beforeEach(async () => {
  files.removeLocationOnSite.mockReset().mockResolvedValue({ removed: true })
  channel.isOnline.mockReset().mockReturnValue(false)
  await ensureExecutionSite({ siteId: SITE })
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

async function projectWithAdmin() {
  const projectAdmin = await createUserWithRole('MEMBER')
  const orgAdmin = await createUserWithRole('ADMIN')
  const project = await createProject({ name: 'Original', accessLevel: 'PRIVATE' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: projectAdmin.id, role: 'ADMIN' } })
  return { project, projectAdmin, orgAdmin }
}
const row = (id: string) => prisma.project.findUniqueOrThrow({ where: { id } })

describe('updateProject — each act is gated by whoever it belongs to @SC-304', () => {
  it('an org admin who is not a member may file it, and may not rename it', async () => {
    const { project, orgAdmin } = await projectWithAdmin()
    const product = await createProduct()

    await updateProject({ projectId: project.id, productId: product.id }, as(orgAdmin))
    await expect(updateProject({ projectId: project.id, name: 'Renamed' }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })

    expect(await row(project.id)).toMatchObject({ productId: product.id, name: 'Original' })
  })

  it('a project admin may rename it, and may not file or unfile it', async () => {
    const { project, projectAdmin } = await projectWithAdmin()
    const program = await createProgram()
    await prisma.project.update({ where: { id: project.id }, data: { programId: program.id } })

    await updateProject({ projectId: project.id, name: 'Renamed' }, as(projectAdmin))
    await expect(updateProject({ projectId: project.id, programId: null }, as(projectAdmin))).rejects.toMatchObject({ statusCode: 403 })

    expect(await row(project.id)).toMatchObject({ name: 'Renamed', programId: program.id })
  })

  it('doing both in one call needs both, and an empty update still needs the project admin', async () => {
    const { project, projectAdmin, orgAdmin } = await projectWithAdmin()
    const program = await createProgram()
    await prisma.userSettings.update({ where: { userId: projectAdmin.id }, data: { role: 'ADMIN' } })

    await expect(updateProject({ projectId: project.id, name: 'X', programId: program.id }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateProject({ projectId: project.id }, as(orgAdmin))).rejects.toMatchObject({ statusCode: 403 })
    await updateProject({ projectId: project.id, name: 'Both', programId: program.id }, as(projectAdmin))

    expect(await row(project.id)).toMatchObject({ name: 'Both', programId: program.id })
  })

  it('refuses a caller who is not signed in, and changes nothing', async () => {
    const { project } = await projectWithAdmin()
    await expect(updateProject({ projectId: project.id, name: 'X' }, as(null))).rejects.toMatchObject({ statusCode: 401 })
    expect((await row(project.id)).name).toBe('Original')
  })

  // Agents own schedule spec §4.
  it("a personal project cannot be filed, by an org admin either, and its owner may still rename it", async () => {
    const owner = await createUserWithRole('ADMIN')
    const personal = await createProject({ personalOwnerId: owner.id, accessLevel: 'PRIVATE' })
    await prisma.projectMember.create({ data: { projectId: personal.id, userId: owner.id, role: 'ADMIN' } })
    const product = await createProduct()

    await expect(updateProject({ projectId: personal.id, productId: product.id }, as(owner))).rejects.toMatchObject({ statusCode: 400 })
    await updateProject({ projectId: personal.id, name: 'Home' }, as(owner))

    expect(await row(personal.id)).toMatchObject({ name: 'Home', productId: null })
  })
})

// A params type is compile-time only; Wasp hands the action whatever JSON was posted.
describe('updateProject — accepted fields @SC-018', () => {
  it('writes every field a project may be given, upper-casing the key, and clears with an explicit null', async () => {
    const project = await createProject()
    const product = await createProduct()
    const program = await createProgram()
    const agent = await createAgent()

    await updateProjectRecord({
      projectId: project.id, name: 'X', description: 'D', productId: product.id, programId: program.id, defaultAgentId: agent.id, key: 'abc',
    })
    expect(await row(project.id)).toMatchObject({
      name: 'X', description: 'D', productId: product.id, programId: program.id, defaultAgentId: agent.id, key: 'ABC',
    })

    await updateProjectRecord({ projectId: project.id, productId: null, programId: null })
    expect(await row(project.id)).toMatchObject({ productId: null, programId: null, name: 'X' })
  })

  it('never writes accessLevel, executionSiteId, slug or a nested relation that would mint a project admin', async () => {
    const project = await createProject({ accessLevel: 'PRIVATE' })
    const attacker = await createUser()
    const before = await row(project.id)

    await updateProjectRecord({
      projectId: project.id, name: 'X', accessLevel: 'OPEN', executionSiteId: null, slug: 'chosen',
      members: { create: [{ userId: attacker.id, role: 'ADMIN' }] },
    } as any)

    expect(await row(project.id)).toMatchObject({ name: 'X', accessLevel: 'PRIVATE', executionSiteId: before.executionSiteId, slug: before.slug })
    expect(await prisma.projectMember.findFirst({ where: { userId: attacker.id } })).toBeNull()
  })

  it('refuses a new key once tasks exist, a malformed key, and one already in use', async () => {
    const project = await createProject({ key: 'AAA' })
    await createProject({ key: 'BBB' })
    await expect(updateProjectRecord({ projectId: project.id, key: 'B1' })).rejects.toMatchObject({ statusCode: 400 })
    await expect(updateProjectRecord({ projectId: project.id, key: 'bbb' })).rejects.toMatchObject({ statusCode: 409 })
    await makeTask(project.id)
    await expect(updateProjectRecord({ projectId: project.id, key: 'CCC' })).rejects.toMatchObject({ statusCode: 400 })
    expect((await row(project.id)).key).toBe('AAA')
  })
})

describe('deleting a project', () => {
  async function doomed() {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject()
    const task = await makeTask(project.id)
    const user = await createUser()
    const chat = await createSession({ userId: user.id, agentId: (await createAgent()).id, primaryOwnerType: 'project', primaryOwnerId: project.id })
    return { admin, project, task, chat }
  }
  const projectExists = async (id: string) => (await prisma.project.findUnique({ where: { id } })) !== null

  it('stops its runs, then deletes its rows, then removes its folder from the site that holds it', async () => {
    const { admin, project, task, chat } = await doomed()
    siteStore.addRun(SITE, { id: 'r1', sessionId: chat.id, status: 'RUNNING' })
    let atRemoval: { run?: string; projectRow: boolean } | undefined
    files.removeLocationOnSite.mockImplementation(async () => {
      atRemoval = { run: (await siteStore.getRun(SITE, 'r1'))?.status, projectRow: await projectExists(project.id) }
      return { removed: true }
    })

    await deleteProject({ projectId: project.id }, as(admin))

    expect(atRemoval).toEqual({ run: 'CANCELLED', projectRow: false })
    expect(files.removeLocationOnSite).toHaveBeenCalledWith(
      { ownerType: 'project', ownerId: project.id }, { wholeOwner: true, logicalSiteId: SITE },
    )
    expect(await prisma.task.findUnique({ where: { id: task.id } })).toBeNull()
  })

  it('holds the projectDeleted instruction for each site that holds its homes, with the delete', async () => {
    const { admin, project } = await doomed()

    await deleteProject({ projectId: project.id }, as(admin))

    const held = await prisma.heldSiteInstruction.findMany()
    expect(held).toEqual([expect.objectContaining({ siteId: SITE, method: MEMBERSHIP_METHODS.projectDeleted, acknowledgedAt: null })])
    expect(held[0].params).toMatchObject({ projectId: project.id, instructionId: held[0].id })
  })

  it('still succeeds when the site is down — the folder is left behind, the rows are not', async () => {
    const { admin, project } = await doomed()
    files.removeLocationOnSite.mockRejectedValue(new Error('unreachable'))
    await expect(deleteProject({ projectId: project.id }, as(admin))).resolves.toBeUndefined()
    expect(await projectExists(project.id)).toBe(false)
    // The warning names the project and the site, so the folder can be found and removed by hand.
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(new RegExp(`project ${project.id}.*${SITE}.*unreachable`, 's')))
  })

  it('still deletes a project whose site cannot be told, and asks no site to remove anything', async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject({ executionSiteId: null })
    await deleteProject({ projectId: project.id }, as(admin))
    expect(await projectExists(project.id)).toBe(false)
    expect(files.removeLocationOnSite).not.toHaveBeenCalled()
  })

  it('removes and holds nothing when the delete itself fails — the project still exists', async () => {
    const { admin, project } = await doomed()
    const tx = vi.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('constraint'))
    await expect(deleteProject({ projectId: project.id }, as(admin))).rejects.toThrow('constraint')
    tx.mockRestore()
    expect(await projectExists(project.id)).toBe(true)
    expect(await prisma.heldSiteInstruction.count()).toBe(0)
    expect(files.removeLocationOnSite).not.toHaveBeenCalled()
  })

  it('does not wait on a site that takes its instruction slowly', async () => {
    const { admin, project } = await doomed()
    channel.isOnline.mockReturnValue(true)
    const reads = vi.spyOn(prisma.heldSiteInstruction, 'findMany').mockReturnValue(new Promise(() => {}) as never)
    await deleteProject({ projectId: project.id }, as(admin))
    reads.mockRestore()
    expect(files.removeLocationOnSite).toHaveBeenCalled()
  })

  it('deletes and removes nothing when the site cannot confirm its runs stopped', async () => {
    const { admin, project, chat } = await doomed()
    siteStore.addRun(SITE, { id: 'r1', sessionId: chat.id, status: 'RUNNING' })
    siteStore.makeSiteUnreachable(SITE)

    await expect(deleteProject({ projectId: project.id }, as(admin))).rejects.toMatchObject({
      statusCode: 503, message: expect.stringContaining('could not be confirmed stopped'),
    })
    expect(await projectExists(project.id)).toBe(true)
    expect(await prisma.heldSiteInstruction.count()).toBe(0)
    expect(files.removeLocationOnSite).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not an org admin, or not signed in, touching nothing', async () => {
    const { project } = await doomed()
    const operator = await createUserWithRole('MEMBER')
    await expect(deleteProject({ projectId: project.id }, as(operator))).rejects.toMatchObject({ statusCode: 403 })
    await expect(deleteProject({ projectId: project.id }, as(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(await projectExists(project.id)).toBe(true)
    expect(files.removeLocationOnSite).not.toHaveBeenCalled()
  })

  // Your space exists as long as its person does; another personal project is its owner's alone to delete.
  describe('a personal project', () => {
    async function withRun(personalSpace: boolean) {
      const owner = await createUser()
      const personal = await createProject({ personalOwnerId: owner.id, personalSpace })
      const chat = await createSession({ userId: owner.id, primaryOwnerType: 'project', primaryOwnerId: personal.id })
      siteStore.addRun(SITE, { id: 'r1', sessionId: chat.id, status: 'RUNNING' })
      return { owner, personal }
    }

    it('never deletes Your space, for an org admin or for its owner, before anything is stopped, deleted or removed', async () => {
      const admin = await createUserWithRole('ADMIN')
      const { owner, personal } = await withRun(true)

      await expect(deleteProject({ projectId: personal.id }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
      await expect(deleteProject({ projectId: personal.id }, as(owner))).rejects.toMatchObject({ statusCode: 400 })
      expect(await projectExists(personal.id)).toBe(true)
      expect(siteStore.cancelledRuns).toEqual([])
      expect(files.removeLocationOnSite).not.toHaveBeenCalled()
    })

    it('lets its owner delete a personal project that is not their space', async () => {
      const { owner, personal } = await withRun(false)

      await deleteProject({ projectId: personal.id }, as(owner))

      expect(await projectExists(personal.id)).toBe(false)
    })

    it('does not let an org admin delete another person’s personal project, answering as if it did not exist', async () => {
      const admin = await createUserWithRole('ADMIN')
      const { personal } = await withRun(false)

      await expect(deleteProject({ projectId: personal.id }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
      expect(await projectExists(personal.id)).toBe(true)
      expect(siteStore.cancelledRuns).toEqual([])
      expect(files.removeLocationOnSite).not.toHaveBeenCalled()
    })
  })
})

describe("deleteProject's extra write shares the delete's own transaction", () => {
  it('commits with the delete', async () => {
    const project = await createProject()
    await deleteProjectRecord(project.id, (tx) => tx.heldSiteInstruction.create({ data: { siteId: SITE, method: 'm', params: {} } }))
    expect(await prisma.project.findUnique({ where: { id: project.id } })).toBeNull()
    expect(await prisma.heldSiteInstruction.count()).toBe(1)
  })

  it('and rolls back with it: a failure after the extra write leaves the project and nothing held', async () => {
    const project = await createProject()
    await expect(deleteProjectRecord(project.id, async (tx) => {
      await tx.heldSiteInstruction.create({ data: { siteId: SITE, method: 'm', params: {} } })
      throw new Error('constraint')
    })).rejects.toThrow('constraint')
    expect(await prisma.project.findUnique({ where: { id: project.id } })).not.toBeNull()
    expect(await prisma.heldSiteInstruction.count()).toBe(0)
  })
})
