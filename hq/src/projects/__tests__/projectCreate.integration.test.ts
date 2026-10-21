/**
 * Creating a project (SC-017, SC-287, SC-310), against the real test DB. A
 * project is the org's structure, so creating one is the org admin's; its
 * workspace is bytes on one machine, so it names an eligible Execution Site;
 * the creator becomes its first admin; and its starter documents are seeded by
 * that site — the site calls are replaced, so what was asked of it can be read
 * back.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocationFileError, SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProduct, createProgram, ensureExecutionSite } from '../../test/factories'

const site = vi.hoisted(() => ({ seedFilesOnSite: vi.fn(), ensureDirOnSite: vi.fn() }))
vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  ...site,
}))
vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import { createProject } from '../actions'
import { createProject as createProjectRecord } from '../projectService'
import { NO_EXECUTION_SITE_MESSAGE } from '../../shared/noExecutionSite'

const as = (user: { id: string } | undefined) => ({ user }) as any
let SITE_ROW_ID: string

beforeEach(async () => {
  site.seedFilesOnSite.mockReset().mockResolvedValue({ written: [], skipped: [] })
  site.ensureDirOnSite.mockReset().mockResolvedValue({ created: true })
  SITE_ROW_ID = (await ensureExecutionSite({ siteId: 's1', protocolVersion: SITE_PROTOCOL_VERSION })).id
})

describe('a project with no site picked', () => {
  it("goes on hq's own default site", async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject({ name: 'Thing' }, as(admin))
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).executionSiteId).toBe(SITE_ROW_ID)
  })

  it('is refused when there is no default site to put it on', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.executionSite.update({ where: { id: SITE_ROW_ID }, data: { isDefault: false } })
    await ensureExecutionSite({ siteId: 's2', isDefault: false })
    await expect(createProject({ name: 'Thing' }, as(admin))).rejects.toThrow()
    expect(await prisma.project.count()).toBe(0)
  })
})

describe('who may create a project @SC-310', () => {
  it.each(['MEMBER'] as const)('refuses an %s — shaping the org\'s structure is the org admin\'s', async (role) => {
    const caller = await createUserWithRole(role)
    await expect(createProject({ name: 'Thing', siteId: 's1' }, as(caller))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.project.count()).toBe(0)
    expect(site.seedFilesOnSite).not.toHaveBeenCalled()
  })

  it('refuses a caller who is not signed in', async () => {
    await expect(createProject({ name: 'Thing', siteId: 's1' }, as(undefined))).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.project.count()).toBe(0)
  })

  it('lets an ADMIN create one, and makes them its first admin', async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject({ name: 'Thing', siteId: 's1' }, as(admin))
    expect(await prisma.projectMember.findMany({ where: { projectId: project.id } }))
      .toEqual([expect.objectContaining({ userId: admin.id, role: 'ADMIN' })])
  })
})

describe('a project is placed on an Execution Site @SC-287', () => {
  it('records the chosen site by its row id, looked up by the installation id the picker supplies', async () => {
    const admin = await createUserWithRole('ADMIN')
    const project = await createProject({ name: 'Thing', siteId: 's1' }, as(admin))
    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).executionSiteId).toBe(SITE_ROW_ID)
  })

  // A site's refusal to seed is a decision it made correctly, not a fault in hq.
  it("reports a site's refusal to seed with its own status, not a 500", async () => {
    const admin = await createUserWithRole('ADMIN')
    site.seedFilesOnSite.mockRejectedValue(new LocationFileError('refused', 'location.seedFiles in project p1'))
    await expect(createProject({ name: 'Thing', siteId: 's1' }, as(admin))).rejects.toMatchObject({ statusCode: 502 })
  })

  it('refuses an unknown site and a revoked one, creating nothing', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.executionSite.create({ data: { siteId: 'gone', label: 'Gone', status: 'REVOKED' } })
    for (const siteId of ['nope', 'gone']) {
      await expect(createProject({ name: 'Thing', siteId } as any, as(admin))).rejects.toMatchObject({ statusCode: 400 })
    }
    expect(await prisma.project.count()).toBe(0)
  })

  it('with no Execution Site connected, fails with the shared error', async () => {
    const admin = await createUserWithRole('ADMIN')
    await prisma.executionSite.deleteMany()
    await expect(createProject({ name: 'Thing', siteId: 's1' }, as(admin))).rejects.toThrow(NO_EXECUTION_SITE_MESSAGE)
  })
})

describe('which sites a project may be placed on', () => {
  async function siteRow(status: string, protocolVersion: string | null) {
    return prisma.executionSite.create({ data: { siteId: `site-${status}`, label: `${status} site`, status, protocolVersion } })
  }
  const create = async (executionSiteId: string) =>
    createProjectRecord({ name: 'X', executionSiteId, createdByUserId: (await createUserWithRole('ADMIN')).id })

  it('refuses a revoked site', async () => {
    await expect(create((await siteRow('REVOKED', SITE_PROTOCOL_VERSION)).id)).rejects.toThrow(/revoked/i)
  })

  it('refuses a site suspended on a protocol mismatch, naming the version HQ speaks and the side to upgrade', async () => {
    await expect(create((await siteRow('VERSION_MISMATCH', '9.0')).id)).rejects.toThrow(new RegExp(`HQ speaks ${SITE_PROTOCOL_VERSION}\\); upgrade HQ`))
  })

  // A laptop that is asleep is where the work belongs; it runs when it wakes.
  it('places it on an offline but registered site', async () => {
    await expect(create((await siteRow('OFFLINE', SITE_PROTOCOL_VERSION)).id)).resolves.toBeTruthy()
  })

  it('does not fall back to another site when the named one does not exist', async () => {
    await expect(create('unknown-id')).rejects.toThrow()
    expect(await prisma.project.count()).toBe(0)
  })
})

describe('createProject — accepted fields @SC-017', () => {
  it('persists every field a project may be given, deriving slug and upper-casing the key', async () => {
    const product = await createProduct()
    const program = await createProgram()
    const project = await createProjectRecord({
      name: 'Thing', description: 'D', productId: product.id, programId: program.id, key: 'thg',
      executionSiteId: SITE_ROW_ID, createdByUserId: (await createUser()).id,
    })
    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({
      name: 'Thing', description: 'D', productId: product.id, programId: program.id, slug: 'thing', key: 'THG', executionSiteId: SITE_ROW_ID,
    })
  })

  it('derives a key when none is given, and files under no product or programme', async () => {
    const project = await createProjectRecord({ name: 'Bare', executionSiteId: SITE_ROW_ID, createdByUserId: (await createUser()).id })
    expect(project).toMatchObject({ key: expect.stringMatching(/^[A-Z]{2,6}$/), productId: null, programId: null })
  })

  it('ignores an id, slug, timestamps and nested relation writes the caller supplies', async () => {
    const intruder = await createUser()
    const project = await createProjectRecord({
      name: 'Thing', key: 'THG', executionSiteId: SITE_ROW_ID, createdByUserId: (await createUser()).id,
      id: 'chosen-by-caller', slug: 'chosen-slug', createdAt: new Date(0),
      members: { create: [{ userId: intruder.id, role: 'ADMIN' }] },
    } as any)

    expect(project.id).not.toBe('chosen-by-caller')
    expect(project.slug).toBe('thing')
    expect(project.createdAt.getTime()).toBeGreaterThan(0)
    expect(await prisma.projectMember.findFirst({ where: { userId: intruder.id } })).toBeNull()
  })

  it('provisions the files home under the generated id, never one the caller chose', async () => {
    const project = await createProjectRecord({
      name: 'Thing', key: 'THG', executionSiteId: SITE_ROW_ID, createdByUserId: (await createUser()).id, id: 'chosen-by-caller',
    } as any)
    const location = { ownerType: 'project', ownerId: project.id }
    expect(site.ensureDirOnSite).toHaveBeenCalledWith(location)
    expect(site.seedFilesOnSite).toHaveBeenCalledWith(location, expect.any(Array))
  })

  it('refuses a key already in use and a malformed one', async () => {
    const creator = (await createUser()).id
    await createProjectRecord({ name: 'One', key: 'ONE', executionSiteId: SITE_ROW_ID, createdByUserId: creator })
    await expect(createProjectRecord({ name: 'Two', key: 'one', executionSiteId: SITE_ROW_ID, createdByUserId: creator }))
      .rejects.toMatchObject({ statusCode: 409 })
    await expect(createProjectRecord({ name: 'Three', key: 'X1', executionSiteId: SITE_ROW_ID, createdByUserId: creator }))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

// The row is committed before its files are asked for; if the ask fails and the
// row stayed, the name and key could never be used again.
describe('createProject — when the site cannot provision the files', () => {
  const failure = () => new Error('Execution Site "Box One" is unreachable')

  it('reports the failure, and gives the name and key back by deleting the row it committed', async () => {
    site.seedFilesOnSite.mockRejectedValueOnce(failure())
    const creator = (await createUser()).id

    await expect(createProjectRecord({ name: 'Thing', key: 'THG', executionSiteId: SITE_ROW_ID, createdByUserId: creator }))
      .rejects.toThrow(/unreachable/)
    expect(await prisma.project.count()).toBe(0)

    await expect(createProjectRecord({ name: 'Thing', key: 'THG', executionSiteId: SITE_ROW_ID, createdByUserId: creator }))
      .resolves.toMatchObject({ key: 'THG' })
  })

  it('never lets a failed cleanup mask why the creation failed', async () => {
    site.seedFilesOnSite.mockRejectedValueOnce(failure())
    const cleanup = vi.spyOn(prisma.project, 'delete').mockRejectedValueOnce(new Error('cleanup also failed'))
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(createProjectRecord({ name: 'Thing', key: 'THG', executionSiteId: SITE_ROW_ID, createdByUserId: (await createUser()).id }))
      .rejects.toThrow(/unreachable/)
    cleanup.mockRestore()
  })
})
