/**
 * Who may read or change what in the Models screens (models from one place, part 4): the organisation's and an agent's
 * models are organisation admins'; a list is its owner's; a personal project has none; a project's model picker is for
 * whoever works in it. Against stubbed membership and database, so the rules are what is tested.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  agent: { findUnique: vi.fn() },
  org: { findFirst: vi.fn(), update: vi.fn() },
  agentModelChoices: { upsert: vi.fn() },
}))
vi.mock('wasp/server', () => ({
  prisma: db,
  HttpError: class HttpError extends Error { constructor(public statusCode: number, message: string) { super(message) } },
}))
const membership = vi.hoisted(() => ({ isOrgAdmin: vi.fn(), projectRole: vi.fn(), mayWorkInProject: vi.fn() }))
vi.mock('../../projects/membership', () => membership)
vi.mock('../../routing/snapshot', () => ({}))
vi.mock('../../routing/place', () => ({}))
vi.mock('../offered', () => ({}))

import { requireMayEditList, parseRef } from '../modelLists'
import { requireOrgAdminUser, getModelsSettings, getAgentModels, getModelList } from '../settingsReads'
import { setModelDefaults, setAgentModels, setModelList } from '../settingsActions'
import { mayPickFor } from '../pickerAccess'

const status = async (p: Promise<unknown>) => ((await p.then(() => null, e => e)) as { statusCode?: number } | null)?.statusCode ?? null

beforeEach(() => {
  vi.clearAllMocks()
  membership.isOrgAdmin.mockResolvedValue(false)
  membership.projectRole.mockResolvedValue(null)
  membership.mayWorkInProject.mockResolvedValue(false)
})

describe('the organisation-admin gate', () => {
  it('refuses a caller who is not signed in (401) and one who is not an organisation admin (403)', async () => {
    expect(await status(requireOrgAdminUser({}))).toBe(401)
    expect(await status(requireOrgAdminUser({ user: { id: 'u1' } }))).toBe(403)
    membership.isOrgAdmin.mockResolvedValue(true)
    await expect(requireOrgAdminUser({ user: { id: 'u1' } })).resolves.toBe('u1')
  })

  it('stands in front of every read and write of the organisation’s and an agent’s models, before any data is touched', async () => {
    const member = { user: { id: 'u1' } }
    const calls = [
      getModelsSettings(undefined, member), getAgentModels({ agentId: 'a1' }, member),
      setModelDefaults({ conversation: 'x' }, member), setAgentModels({ agentId: 'a1', conversation: 'x' }, member),
    ]
    expect(await Promise.all(calls.map(status))).toEqual([403, 403, 403, 403])
    expect(db.org.findFirst).not.toHaveBeenCalled()
    expect(db.agent.findUnique).not.toHaveBeenCalled()
    expect(db.org.update).not.toHaveBeenCalled()
    expect(db.agentModelChoices.upsert).not.toHaveBeenCalled()
  })

  it('a list is read or written only by a signed-in person who may edit it', async () => {
    const ref = { owner: 'person', ownerId: 'u2' }
    expect(await status(setModelList(ref, {}))).toBe(401)
    expect(await status(getModelList(ref, {}))).toBe(401)
    expect(await status(setModelList(ref, { user: { id: 'u1' } }))).toBe(403)
    expect(await status(getModelList(ref, { user: { id: 'u1' } }))).toBe(403)
  })
})

describe('who may change a list', () => {
  it('a person changes their own list and no one else’s', async () => {
    await expect(requireMayEditList({ owner: 'person', ownerId: 'u1' }, 'u1')).resolves.toBeUndefined()
    expect(await status(requireMayEditList({ owner: 'person', ownerId: 'u2' }, 'u1'))).toBe(403)
    membership.isOrgAdmin.mockResolvedValue(true)
    expect(await status(requireMayEditList({ owner: 'person', ownerId: 'u2' }, 'u1'))).toBe(403)
  })

  it('a shared project’s admins change its list; its other members and outsiders do not', async () => {
    db.project.findUnique.mockResolvedValue({ personalOwnerId: null })
    membership.projectRole.mockResolvedValue('ADMIN')
    await expect(requireMayEditList({ owner: 'project', ownerId: 'p1' }, 'u1')).resolves.toBeUndefined()
    for (const role of ['MEMBER', 'VIEWER', null]) {
      membership.projectRole.mockResolvedValue(role)
      expect(await status(requireMayEditList({ owner: 'project', ownerId: 'p1' }, 'u1'))).toBe(403)
    }
  })

  it('a personal project has no list of its own (409), and a project that is gone is 404', async () => {
    db.project.findUnique.mockResolvedValue({ personalOwnerId: 'u1' })
    membership.projectRole.mockResolvedValue('ADMIN')
    expect(await status(requireMayEditList({ owner: 'project', ownerId: 'pp' }, 'u1'))).toBe(409)
    db.project.findUnique.mockResolvedValue(null)
    expect(await status(requireMayEditList({ owner: 'project', ownerId: 'gone' }, 'u1'))).toBe(404)
  })

  it('the organisation’s and an agent’s lists are organisation admins’ alone, even a project admin’s not', async () => {
    membership.projectRole.mockResolvedValue('ADMIN')
    expect(await status(requireMayEditList({ owner: 'organisation', ownerId: 'o1' }, 'u1'))).toBe(403)
    expect(await status(requireMayEditList({ owner: 'agent', ownerId: 'a1' }, 'u1'))).toBe(403)

    membership.isOrgAdmin.mockResolvedValue(true)
    db.org.findFirst.mockResolvedValue({ id: 'o1' })
    db.agent.findUnique.mockResolvedValue({ id: 'a1' })
    await expect(requireMayEditList({ owner: 'organisation', ownerId: 'o1' }, 'u1')).resolves.toBeUndefined()
    await expect(requireMayEditList({ owner: 'agent', ownerId: 'a1' }, 'u1')).resolves.toBeUndefined()
    expect(await status(requireMayEditList({ owner: 'organisation', ownerId: 'other' }, 'u1'))).toBe(404)
    db.agent.findUnique.mockResolvedValue(null)
    expect(await status(requireMayEditList({ owner: 'agent', ownerId: 'gone' }, 'u1'))).toBe(404)
  })

  it('names the owner of a list or refuses with 400', () => {
    expect(parseRef({ owner: 'project', ownerId: 'p1' })).toEqual({ owner: 'project', ownerId: 'p1' })
    for (const bad of [undefined, {}, { owner: 'nobody', ownerId: 'x' }, { owner: 'person' }, { owner: 'person', ownerId: '' }]) {
      expect(() => parseRef(bad)).toThrow(expect.objectContaining({ statusCode: 400 }))
    }
  })
})

describe('who sees a project’s model picker', () => {
  it('whoever works in a shared project, and nobody else', async () => {
    db.project.findUnique.mockResolvedValue({ personalOwnerId: null })
    membership.mayWorkInProject.mockResolvedValue(true)
    await expect(mayPickFor('p1', 'u1')).resolves.toBeUndefined()
    membership.mayWorkInProject.mockResolvedValue(false)
    expect(await status(mayPickFor('p1', 'u1'))).toBe(403)
  })

  it('only the person a personal project belongs to, whatever else they hold', async () => {
    db.project.findUnique.mockResolvedValue({ personalOwnerId: 'u1' })
    membership.mayWorkInProject.mockResolvedValue(true)
    await expect(mayPickFor('pp', 'u1')).resolves.toBeUndefined()
    expect(await status(mayPickFor('pp', 'u2'))).toBe(403)
  })

  it('names the project (400) and finds it (404)', async () => {
    expect(await status(mayPickFor(undefined, 'u1'))).toBe(400)
    expect(await status(mayPickFor('', 'u1'))).toBe(400)
    db.project.findUnique.mockResolvedValue(null)
    expect(await status(mayPickFor('gone', 'u1'))).toBe(404)
  })
})
