/**
 * A person's several personal projects (models from one place, part 4), against the real test DB with the site's
 * calls replaced: anyone makes them, as many as they like; each is private to its owner, with them as its one
 * member, its own storage on the site that holds the person's, and its Task and Epic types; only the owner sees or
 * deletes one, and never the space.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SITE_PROTOCOL_VERSION } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createUser, createUserWithRole, createProject, ensureExecutionSite } from '../../test/factories'

const files = vi.hoisted(() => ({ seedFilesOnSite: vi.fn(), ensureDirOnSite: vi.fn(), removeLocationOnSite: vi.fn() }))
vi.mock('../../storage/locationFileStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../storage/locationFileStore')>()),
  ...files,
}))
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

import { createPersonalProject } from '../personalProjectActions'
import { deleteProject } from '../actions'
import { getProjects, getProjectByKey } from '../queries'
import { ensurePersonalProject } from '../personalProject'
import { projectStanding } from '../membership'
import * as activity from '../../test/fakes/activity'

const as = (user: { id: string } | undefined) => ({ user, entities: { Project: prisma.project } }) as any
let SITE_ROW_ID: string

beforeEach(async () => {
  files.seedFilesOnSite.mockReset().mockResolvedValue({ written: [], skipped: [] })
  files.ensureDirOnSite.mockReset().mockResolvedValue({ created: true })
  files.removeLocationOnSite.mockReset().mockResolvedValue({ removed: true })
  channel.isOnline.mockReset().mockReturnValue(false)
  SITE_ROW_ID = (await ensureExecutionSite({ siteId: 's1', protocolVersion: SITE_PROTOCOL_VERSION })).id
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

describe('making a personal project @SC-1207', () => {
  it('lets a member who is not an organisation admin make as many as they like', async () => {
    const person = await createUserWithRole('MEMBER')
    const a = await createPersonalProject({ name: 'Tax return 2026', description: 'Receipts' }, as(person))
    const b = await createPersonalProject({ name: 'Side research' }, as(person))
    const c = await createPersonalProject({ name: 'Side research' }, as(person))
    expect(new Set([a.key, b.key, c.key]).size).toBe(3)
    expect(await prisma.project.count({ where: { personalOwnerId: person.id } })).toBe(3)
  })

  it('takes the key the person typed, and refuses a malformed one, making nothing', async () => {
    const person = await createUserWithRole('MEMBER')
    const made = await createPersonalProject({ name: 'Tax return 2026', key: 'TAXES' }, as(person))
    expect(made.key).toBe('TAXES')
    await expect(createPersonalProject({ name: 'Other', key: 'x1' }, as(person))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.project.count({ where: { personalOwnerId: person.id, personalSpace: false } })).toBe(1)
  })

  it('makes it private, owned by the person who is its one admin, with its Task and Epic types, no board and no slug, not the space', async () => {
    const person = await createUser()
    const made = await createPersonalProject({ name: 'Tax return 2026', description: 'Receipts' }, as(person))

    const row = await prisma.project.findUniqueOrThrow({ where: { id: made.id }, include: { members: true, boards: true, taskTypes: true } })
    expect(row).toMatchObject({
      name: 'Tax return 2026', description: 'Receipts', accessLevel: 'PRIVATE', personalOwnerId: person.id, personalSpace: false,
      slug: null, productId: null, programId: null, billingProfileId: null,
    })
    expect(row.members).toEqual([expect.objectContaining({ userId: person.id, role: 'ADMIN' })])
    expect(row.boards).toEqual([])
    expect(row.taskTypes.map(t => t.kind).sort()).toEqual(['EPIC', 'TASK'])
  })

  it('puts it on the site that holds the person’s own storage and provisions its files there', async () => {
    const person = await createUser()
    // ensureExecutionSite returns the existing default, so a second site is made directly.
    const other = await prisma.executionSite.create({
      data: { siteId: 's2', label: 'Second site', status: 'ONLINE', credentialHash: 'e'.repeat(64), credentialPrefix: 'smc_test_second', isDefault: false, protocolVersion: SITE_PROTOCOL_VERSION },
    })
    await prisma.userStoragePlacement.create({ data: { userId: person.id, siteId: other.id } })

    const made = await createPersonalProject({ name: 'Elsewhere' }, as(person))

    expect((await prisma.project.findUniqueOrThrow({ where: { id: made.id } })).executionSiteId).toBe(other.id)
    expect(files.ensureDirOnSite).toHaveBeenCalledWith({ ownerType: 'project', ownerId: made.id })
    expect(files.seedFilesOnSite).toHaveBeenCalled()
    expect(SITE_ROW_ID).not.toBe(other.id)
  })

  it('asks for nothing but a name, and says nothing about it in the organisation’s activity', async () => {
    const person = await createUser()
    await expect(createPersonalProject({ name: '   ' }, as(person))).rejects.toMatchObject({ statusCode: 400 })
    await createPersonalProject({ name: 'Private thing' }, as(person))
    expect(JSON.stringify(vi.mocked(activity.recordActivity).mock.calls)).not.toContain('Private thing')
  })

  it('refuses someone signed out, and someone who has left the organisation', async () => {
    await expect(createPersonalProject({ name: 'X' }, as(undefined))).rejects.toMatchObject({ statusCode: 401 })
    const left = await createUser({ deactivatedAt: new Date() })
    await expect(createPersonalProject({ name: 'X' }, as(left))).rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.project.count()).toBe(0)
  })

  it('does not leave a project behind when its files cannot be provisioned', async () => {
    const person = await createUser()
    files.seedFilesOnSite.mockRejectedValueOnce(new Error('site down'))
    await expect(createPersonalProject({ name: 'Doomed' }, as(person))).rejects.toThrow()
    expect(await prisma.project.count({ where: { personalOwnerId: person.id } })).toBe(0)
  })
})

describe('who sees a personal project @SC-1208', () => {
  it('lists it to its owner only, and answers anyone else as if it did not exist, an organisation admin included', async () => {
    const owner = await createUserWithRole('MEMBER')
    const admin = await createUserWithRole('ADMIN')
    const made = await createPersonalProject({ name: 'Tax return 2026' }, as(owner))
    await ensurePersonalProject(owner.id)

    const mine = await getProjects(undefined, as(owner))
    expect(mine.filter(p => p.personalOwnerId).map(p => [p.name, p.personalSpace])).toEqual(
      expect.arrayContaining([['Tax return 2026', false], ['My tasks', true]]),
    )
    expect((await getProjects(undefined, as(admin))).map(p => p.id)).not.toContain(made.id)
    expect((await getProjects(undefined, as(owner))).find(p => p.id === made.id)).toMatchObject({ isMember: true })

    await expect(getProjectByKey({ key: made.key }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
    expect(await getProjectByKey({ key: made.key }, as(owner))).toMatchObject({ id: made.id, personalSpace: false })
    expect(await projectStanding(made.id, admin.id)).toBe('none')
    expect(await projectStanding(made.id, owner.id)).toBe('works')
  })
})

describe('deleting a personal project @SC-1209', () => {
  it('lets its owner delete it with its tasks and files, and tells the site that held it', async () => {
    const owner = await createUserWithRole('MEMBER')
    const made = await createPersonalProject({ name: 'Tax return 2026' }, as(owner))

    await deleteProject({ projectId: made.id }, as(owner))

    expect(await prisma.project.findUnique({ where: { id: made.id } })).toBeNull()
    expect(files.removeLocationOnSite).toHaveBeenCalledWith({ ownerType: 'project', ownerId: made.id }, { wholeOwner: true, logicalSiteId: 's1' })
  })

  it('never deletes the space, not even for its owner who is an organisation admin', async () => {
    const owner = await createUserWithRole('ADMIN')
    const space = await ensurePersonalProject(owner.id)
    await expect(deleteProject({ projectId: space.id }, as(owner))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.project.findUnique({ where: { id: space.id } })).not.toBeNull()
  })

  it('never deletes the space for a member who is not an organisation admin either', async () => {
    const owner = await createUserWithRole('MEMBER')
    const space = await ensurePersonalProject(owner.id)
    await expect(deleteProject({ projectId: space.id }, as(owner))).rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.project.findUnique({ where: { id: space.id } })).not.toBeNull()
  })

  it('does not let an organisation admin, or anyone else, delete another person’s personal project', async () => {
    const owner = await createUserWithRole('MEMBER')
    const admin = await createUserWithRole('ADMIN')
    const stranger = await createUserWithRole('MEMBER')
    const made = await createPersonalProject({ name: 'Tax return 2026' }, as(owner))
    await expect(deleteProject({ projectId: made.id }, as(admin))).rejects.toMatchObject({ statusCode: 404 })
    await expect(deleteProject({ projectId: made.id }, as(stranger))).rejects.toMatchObject({ statusCode: 404 })
    expect(await prisma.project.findUnique({ where: { id: made.id } })).not.toBeNull()
  })

  it('leaves an organisation project to the organisation admin only', async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    const shared = await createProject({ name: 'Website' })
    await expect(deleteProject({ projectId: shared.id }, as(member))).rejects.toMatchObject({ statusCode: 403 })
    await deleteProject({ projectId: shared.id }, as(admin))
    expect(await prisma.project.findUnique({ where: { id: shared.id } })).toBeNull()
  })
})
