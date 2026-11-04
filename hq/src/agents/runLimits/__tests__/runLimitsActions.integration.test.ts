/**
 * Integration tests (ADR-0094 — real test DB) for the run-limit operations: the organisation's defaults
 * (an admin sets them, anyone signed in reads them) and a project's own, tighter choice (its admin's).
 */
import { describe, it, expect, vi } from 'vitest'
import { prisma } from '../../../test/db'
import { createProject, createUser, createUserWithRole } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../../test/db')
  return { ...actual, prisma }
})

import {
  getOrgRunLimitsQuery, updateOrgRunLimits, getProjectRunLimitsQuery, setProjectRunLimits,
} from '../runLimitsActions'

const ctxFor = (user: { id: string } | null | undefined) => ({ user })
const orgDefaults = { timeLimitMinutes: 60, turnLimit: 100 }

async function projectAdmin(project?: { id: string }) {
  const user = await createUser()
  const p = project ?? (await createProject())
  await prisma.projectMember.create({ data: { projectId: p.id, userId: user.id, role: 'ADMIN' } })
  return { user, project: p }
}

describe('getOrgRunLimitsQuery', () => {
  it('gives the defaults while the organisation has not set any', async () => {
    expect(await getOrgRunLimitsQuery(undefined, ctxFor(await createUser()))).toEqual(orgDefaults)
  })

  it('gives what the organisation set', async () => {
    await prisma.org.create({ data: { name: 'Acme', runTimeLimitMinutes: 45, runTurnLimit: 80 } })
    expect(await getOrgRunLimitsQuery(undefined, ctxFor(await createUser()))).toEqual({ timeLimitMinutes: 45, turnLimit: 80 })
  })

  it('answers 401 when nobody is signed in', async () => {
    await expect(getOrgRunLimitsQuery(undefined, ctxFor(null))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('updateOrgRunLimits', () => {
  it('stores the new defaults on the organisation', async () => {
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    const admin = await createUserWithRole('ADMIN')

    expect(await updateOrgRunLimits({ timeLimitMinutes: 30, turnLimit: 50 }, ctxFor(admin))).toEqual({ timeLimitMinutes: 30, turnLimit: 50 })

    expect(await prisma.org.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ runTimeLimitMinutes: 30, runTurnLimit: 50 })
    expect(await prisma.org.count()).toBe(1)
  })

  it('creates the organisation row when there is none yet', async () => {
    const admin = await createUserWithRole('ADMIN')

    await updateOrgRunLimits({ timeLimitMinutes: 30, turnLimit: 50 }, ctxFor(admin))

    expect(await prisma.org.findFirstOrThrow()).toMatchObject({ name: 'My Organisation', runTimeLimitMinutes: 30, runTurnLimit: 50 })
  })

  it.each([
    [{ timeLimitMinutes: 0, turnLimit: 50 }],
    [{ timeLimitMinutes: 1441, turnLimit: 50 }],
    [{ timeLimitMinutes: 30.5, turnLimit: 50 }],
    [{ timeLimitMinutes: 30, turnLimit: 1001 }],
    [{ timeLimitMinutes: 30 }],
    [{ timeLimitMinutes: '30', turnLimit: 50 }],
  ])('answers 400 for %j and changes nothing', async (values) => {
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    const admin = await createUserWithRole('ADMIN')

    await expect(updateOrgRunLimits(values as any, ctxFor(admin))).rejects.toMatchObject({ statusCode: 400 })

    expect(await prisma.org.findUniqueOrThrow({ where: { id: org.id } })).toMatchObject({ runTimeLimitMinutes: 60, runTurnLimit: 100 })
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 and writes nothing', async (role) => {
    const org = await prisma.org.create({ data: { name: 'Acme' } })
    const caller = await createUserWithRole(role)
    await expect(updateOrgRunLimits({ timeLimitMinutes: 30, turnLimit: 50 }, ctxFor(caller)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect((await prisma.org.findUniqueOrThrow({ where: { id: org.id } })).runTimeLimitMinutes).toBe(60)
  })

  it('refuses a person with no role and a signed-out caller', async () => {
    await expect(updateOrgRunLimits({ timeLimitMinutes: 30, turnLimit: 50 }, ctxFor(await createUser()))).rejects.toMatchObject({ statusCode: 403 })
    await expect(updateOrgRunLimits({ timeLimitMinutes: 30, turnLimit: 50 }, ctxFor(null))).rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.org.count()).toBe(0)
  })
})

describe('getProjectRunLimitsQuery', () => {
  it('gives the organisation\'s limits beside the project\'s own choice', async () => {
    await prisma.org.create({ data: { name: 'Acme', runTimeLimitMinutes: 90, runTurnLimit: 200 } })
    const project = await createProject({ runTimeLimitMinutes: 10 })

    const { user } = await projectAdmin(project)
    expect(await getProjectRunLimitsQuery({ projectId: project.id }, ctxFor(user))).toEqual({
      org: { timeLimitMinutes: 90, turnLimit: 200 },
      own: { timeLimitMinutes: 10, turnLimit: null },
    })
  })

  it('shows no choice for a project that has none', async () => {
    const { user, project } = await projectAdmin()
    expect(await getProjectRunLimitsQuery({ projectId: project.id }, ctxFor(user))).toEqual({
      org: orgDefaults, own: { timeLimitMinutes: null, turnLimit: null },
    })
  })

  it('refuses someone who is not a member of the project (403), and a project that does not exist', async () => {
    const project = await createProject({ runTimeLimitMinutes: 10 })
    const outsider = ctxFor(await createUser())
    await expect(getProjectRunLimitsQuery({ projectId: project.id }, outsider)).rejects.toMatchObject({ statusCode: 403 })
    await expect(getProjectRunLimitsQuery({ projectId: 'ghost' }, outsider)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('answers 401 when nobody is signed in', async () => {
    const project = await createProject()
    await expect(getProjectRunLimitsQuery({ projectId: project.id }, ctxFor(null))).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('setProjectRunLimits', () => {
  it('lets the project\'s admin store a tighter choice, and returns it with the organisation\'s', async () => {
    await prisma.org.create({ data: { name: 'Acme' } })
    const { user, project } = await projectAdmin()

    const result = await setProjectRunLimits({ projectId: project.id, timeLimitMinutes: 10, turnLimit: null }, ctxFor(user))

    expect(result).toEqual({ org: orgDefaults, own: { timeLimitMinutes: 10, turnLimit: null } })
    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ runTimeLimitMinutes: 10, runTurnLimit: null })
  })

  it('clears a choice that was made before', async () => {
    const { user, project } = await projectAdmin(await createProject({ runTimeLimitMinutes: 10, runTurnLimit: 20 }))

    await setProjectRunLimits({ projectId: project.id, timeLimitMinutes: null, turnLimit: null }, ctxFor(user))

    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ runTimeLimitMinutes: null, runTurnLimit: null })
  })

  it('accepts exactly the organisation\'s limit', async () => {
    const { user, project } = await projectAdmin()
    const result = await setProjectRunLimits({ projectId: project.id, timeLimitMinutes: 60, turnLimit: 100 }, ctxFor(user))
    expect(result.own).toEqual(orgDefaults)
  })

  it.each([
    ['looser than the organisation\'s time limit', { timeLimitMinutes: 120, turnLimit: null }, /can only be tightened/],
    ['looser than the organisation\'s turn limit', { timeLimitMinutes: null, turnLimit: 101 }, /can only be tightened/],
    ['outside the bounds', { timeLimitMinutes: 0, turnLimit: null }, /whole number/],
    ['not a whole number', { timeLimitMinutes: 10.5, turnLimit: null }, /whole number/],
  ])('answers 400 for a choice %s, and stores nothing', async (_name, values, message) => {
    const { user, project } = await projectAdmin()

    await expect(setProjectRunLimits({ projectId: project.id, ...values }, ctxFor(user)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringMatching(message) })

    expect(await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).toMatchObject({ runTimeLimitMinutes: null, runTurnLimit: null })
  })

  it('refuses a project member who is not its admin, even an organisation admin, with 403', async () => {
    const project = await createProject()
    const member = await createUserWithRole('ADMIN')
    await prisma.projectMember.create({ data: { projectId: project.id, userId: member.id, role: 'MEMBER' } })

    await expect(setProjectRunLimits({ projectId: project.id, timeLimitMinutes: 10, turnLimit: null }, ctxFor(member)))
      .rejects.toMatchObject({ statusCode: 403 })

    expect((await prisma.project.findUniqueOrThrow({ where: { id: project.id } })).runTimeLimitMinutes).toBeNull()
  })

  it('refuses a project that does not exist with 403, and a signed-out caller with 401', async () => {
    const user = await createUser()
    await expect(setProjectRunLimits({ projectId: 'ghost', timeLimitMinutes: 10, turnLimit: null }, ctxFor(user))).rejects.toMatchObject({ statusCode: 403 })
    const project = await createProject()
    await expect(setProjectRunLimits({ projectId: project.id, timeLimitMinutes: 10, turnLimit: null }, ctxFor(null))).rejects.toMatchObject({ statusCode: 401 })
  })
})
