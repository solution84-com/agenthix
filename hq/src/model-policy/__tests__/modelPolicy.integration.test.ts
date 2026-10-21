/**
 * The model policy against the real test database: its layers, and who may read and set it for a person's own
 * space, a project and the organisation.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prisma } from '../../test/db'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError }
})

import { resolveModelPolicy } from '../modelPolicyService'
import { getModelPolicy, setModelPolicy } from '../modelPolicyOperations'
import { createProject, createUser, createUserWithRole, joinProjectAs } from '../../test/factories'

const SONNET = 'claude-sonnet-5'
const HAIKU = 'claude-haiku-4-5'
const OPUS = 'claude-opus-5'
const AGENT = { defaultModel: SONNET, runtime: 'claude-sdk' }
const as = (userId: string) => ({ user: { id: userId }, entities: {} }) as never

afterEach(() => { vi.unstubAllEnvs() })

describe('resolving the policy @SC-954', () => {
  it("takes the boundary's, then the organisation's, then the agent's default", async () => {
    const project = await createProject()
    await prisma.modelPolicy.create({ data: { ownerType: 'org', ownerId: 'org', talking: HAIKU, heavyWork: OPUS, ceiling: OPUS } })
    await prisma.modelPolicy.create({ data: { ownerType: 'project', ownerId: project.id, talking: SONNET } })

    await expect(resolveModelPolicy({ type: 'project', id: project.id }, AGENT)).resolves.toEqual({
      talking: SONNET, lightWork: SONNET, heavyWork: OPUS, allowed: null, ceiling: OPUS,
    })
    await expect(resolveModelPolicy({ type: 'user', id: 'someone' }, AGENT)).resolves.toMatchObject({ talking: HAIKU })
  })
})

describe("a person's own policy @SC-954", () => {
  it('is theirs to read and set, and a policy that sets nothing is removed', async () => {
    const person = await createUser()
    await expect(setModelPolicy({ scope: 'user', talking: HAIKU }, as(person.id))).resolves.toMatchObject({ talking: HAIKU })
    await expect(getModelPolicy({ scope: 'user' }, as(person.id))).resolves.toEqual({
      policy: { talking: HAIKU, lightWork: null, heavyWork: null, allowed: null, ceiling: null },
      organisation: null,
    })
    await expect(setModelPolicy({ scope: 'user', talking: null }, as(person.id))).resolves.toBeNull()
    expect(await prisma.modelPolicy.count()).toBe(0)
  })

  it('refuses a model outside its own ceiling', async () => {
    const person = await createUser()
    await expect(setModelPolicy({ scope: 'user', talking: OPUS, ceiling: SONNET }, as(person.id)))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

describe("within the organisation's bound @SC-954", () => {
  it("refuses a person's ceiling above the organisation's, and a model outside its allow-list, saying why", async () => {
    const admin = await createUserWithRole('ADMIN')
    const person = await createUser()
    await setModelPolicy({ scope: 'org', allowed: [SONNET, HAIKU], ceiling: SONNET }, as(admin.id))

    await expect(setModelPolicy({ scope: 'user', ceiling: OPUS }, as(person.id)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("above the organisation's ceiling") })
    await expect(setModelPolicy({ scope: 'user', allowed: [OPUS] }, as(person.id)))
      .rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining("not among the organisation's allowed models") })
    await expect(setModelPolicy({ scope: 'user', ceiling: HAIKU, talking: HAIKU }, as(person.id))).resolves.toMatchObject({ ceiling: HAIKU })
  })

  it("keeps a stored policy within the organisation's, when the organisation narrows later", async () => {
    const admin = await createUserWithRole('ADMIN')
    const person = await createUser()
    await setModelPolicy({ scope: 'user', talking: OPUS, ceiling: OPUS }, as(person.id))
    await setModelPolicy({ scope: 'org', ceiling: SONNET }, as(admin.id))
    await expect(resolveModelPolicy({ type: 'user', id: person.id }, AGENT)).resolves.toMatchObject({ talking: SONNET, ceiling: SONNET })
  })
})

describe("a project's policy @SC-954", () => {
  let projectId: string
  beforeEach(async () => { projectId = (await createProject()).id })

  it("is its admins' to set and its members' to read", async () => {
    const admin = await createUser()
    const member = await createUser()
    await joinProjectAs(projectId, admin.id, 'ADMIN')
    await joinProjectAs(projectId, member.id, 'MEMBER')

    await expect(setModelPolicy({ scope: 'project', projectId, talking: HAIKU }, as(member.id))).rejects.toMatchObject({ statusCode: 403 })
    await setModelPolicy({ scope: 'project', projectId, talking: HAIKU }, as(admin.id))
    await expect(getModelPolicy({ scope: 'project', projectId }, as(member.id))).resolves.toMatchObject({ policy: { talking: HAIKU } })
  })

  it('is not readable by someone outside the project', async () => {
    const outsider = await createUser()
    await expect(getModelPolicy({ scope: 'project', projectId }, as(outsider.id))).rejects.toMatchObject({ statusCode: 403 })
  })

  it('cannot be set on a personal project', async () => {
    const person = await createUser()
    const personal = await createProject({ personalOwnerId: person.id })
    await joinProjectAs(personal.id, person.id, 'ADMIN')
    await expect(setModelPolicy({ scope: 'project', projectId: personal.id, talking: HAIKU }, as(person.id)))
      .rejects.toMatchObject({ statusCode: 400 })
  })
})

describe("the organisation's policy @SC-954", () => {
  it("is its admins' to set and everyone's to read", async () => {
    const admin = await createUserWithRole('ADMIN')
    const member = await createUserWithRole('MEMBER')
    await expect(setModelPolicy({ scope: 'org', ceiling: SONNET }, as(member.id))).rejects.toMatchObject({ statusCode: 403 })
    await setModelPolicy({ scope: 'org', ceiling: SONNET }, as(admin.id))
    await expect(getModelPolicy({ scope: 'user' }, as(member.id))).resolves.toMatchObject({
      policy: null, organisation: { ceiling: SONNET },
    })
  })
})
