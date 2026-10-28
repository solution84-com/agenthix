// Over 300 lines on purpose: one file per operation family would repeat the same setup (temp roots, caller helpers).
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs/promises'
import { prisma } from '../../test/db'
import { createUserWithRole, createProject, createTestTask } from '../../test/factories'

// The library's operations called with a real context against the real test DB (ADR-0094): board template
// actions and queries, the workforce and agent template reads, and the apply actions. Agent, board and team
// templates are assets (adr-0157).

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<any>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../server/dashboard/activity', () => import('../../test/fakes/activity'))

import {
  getBoardTemplates, getBoardTemplate, getWorkforceTemplate, getExistingAgentHandles,
  getWorkforceReviewTask, getAgentTemplates,
} from '../queries'
import {
  createBoardTemplate, updateBoardTemplate, deleteBoardTemplate,
  applyWorkforceTemplate, confirmWorkforceTemplate, saveWorkforceDraft, applyAgentTemplate,
} from '../actions'
import { agentPackage, boardPackage, seedTemplate, teamPackage } from '../../assets/templates/__tests__/templateFixtures'

let tmpRoot: string
const prev = { assets: process.env.HQ_ASSETS_ROOT, storage: process.env.HQ_STORAGE_ROOT }

beforeAll(async () => {
  tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'library-ops-'))
  process.env.HQ_ASSETS_ROOT = path.join(tmpRoot, 'assets')
  process.env.HQ_STORAGE_ROOT = path.join(tmpRoot, 'storage')
})
afterAll(async () => {
  for (const [key, value] of [['HQ_ASSETS_ROOT', prev.assets], ['HQ_STORAGE_ROOT', prev.storage]] as const) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  await fs.rm(tmpRoot, { recursive: true, force: true })
})

const anon = { user: undefined } as any
const noSelections = { teams: [], projects: [] } as any
const columns = [
  { name: 'todo', label: 'To Do', status: 'TODO', color: '#6b7280', description: '' },
  { name: 'doing', label: 'Doing', status: 'IN_PROGRESS', color: '#f59e0b', description: '' },
  { name: 'done', label: 'Done', status: 'DONE', color: '#10b981', description: '' },
]

async function caller(role: 'ADMIN' | 'MEMBER') {
  const user = await createUserWithRole(role)
  return { user: { id: user.id } } as any
}

async function seedWorkforceBundle(id: string, handle = 'bundle-dev') {
  return seedTemplate(prisma, 'TEAM', id, teamPackage(id, { agents: [{ handle }] }))
}

function selectionsFor(handle: string) {
  return {
    teams: [{ name: 'Crew', include: true, agents: [{ handle, resolvedHandle: handle, include: true, skills: [] }] }],
    projects: [],
  } as any
}

async function makeProposalTask(applicationData: unknown) {
  const project = await createProject({ name: 'P', key: 'P' + Math.random().toString(36).slice(2, 6) })
  return createTestTask({
    data: { title: 'Proposal', projectId: project.id, number: 1, column: 'in_review', applicationData, onBehalfOfUserId: 'person-1' } as any,
  })
}

describe('board template operations', () => {
  beforeEach(async () => { await prisma.org.create({ data: { name: 'Fernhill' } }) })

  it('createBoardTemplate lets an ADMIN make the organisation its own template, as an asset', async () => {
    const admin = await caller('ADMIN')
    const created = await createBoardTemplate({ name: 'Mine', description: 'desc', columns }, admin)
    expect(created).toMatchObject({ identity: 'fernhill/mine', version: '1.0.0', isSystem: false })
    expect(await prisma.asset.findUnique({ where: { id: created.id } })).toMatchObject({ kind: 'BOARD', publisher: 'fernhill' })
  })

  it('createBoardTemplate maps a template missing a status to 400 and stores nothing', async () => {
    const admin = await caller('ADMIN')
    await expect(createBoardTemplate({ name: 'Bad', columns: columns.slice(0, 2) }, admin))
      .rejects.toMatchObject({ statusCode: 400 })
    expect(await prisma.asset.count()).toBe(0)
  })

  it('updateBoardTemplate lets an ADMIN rename it, as the next version', async () => {
    const admin = await caller('ADMIN')
    const created = await createBoardTemplate({ name: 'Before', columns }, admin)
    const updated = await updateBoardTemplate({ id: created.id, name: 'After' }, admin)
    expect(updated).toMatchObject({ name: 'After', version: '1.1.0' })
  })

  it('updateBoardTemplate maps an invalid edit to 400 and an unknown id to 404', async () => {
    const admin = await caller('ADMIN')
    const created = await createBoardTemplate({ name: 'Keep', columns }, admin)
    await expect(updateBoardTemplate({ id: created.id, columns: columns.slice(0, 1) }, admin))
      .rejects.toMatchObject({ statusCode: 400 })
    await expect(updateBoardTemplate({ id: 'missing', name: 'x' }, admin))
      .rejects.toMatchObject({ statusCode: 404 })
    expect((await getBoardTemplate({ id: created.id }, admin))?.name).toBe('Keep')
  })

  it('deleteBoardTemplate lets an ADMIN remove the organisation\'s own, keeping its history', async () => {
    const admin = await caller('ADMIN')
    const created = await createBoardTemplate({ name: 'Gone', columns }, admin)
    await deleteBoardTemplate({ id: created.id }, admin)
    expect((await prisma.asset.findUnique({ where: { id: created.id } }))?.removedAt).not.toBeNull()
    expect(await getBoardTemplates(undefined, admin)).toEqual([])
  })

  it("deleteBoardTemplate refuses Agenthix's template", async () => {
    const admin = await caller('ADMIN')
    const { assetId } = await seedTemplate(prisma, 'BOARD', 'kanban', boardPackage('kanban'))
    await expect(deleteBoardTemplate({ id: assetId }, admin)).rejects.toMatchObject({ statusCode: 409 })
    expect((await prisma.asset.findUnique({ where: { id: assetId } }))?.removedAt).toBeNull()
  })

  describe.each([
    ['createBoardTemplate', (c: any) => createBoardTemplate({ name: 'T', columns }, c)],
    ['updateBoardTemplate', (c: any, id: string) => updateBoardTemplate({ id, name: 'T' }, c)],
    ['deleteBoardTemplate', (c: any, id: string) => deleteBoardTemplate({ id }, c)],
  ] as const)('%s is the Library policy\'s', (_name, call) => {
    let id: string
    beforeEach(async () => {
      id = (await createBoardTemplate({ name: 'Existing', columns }, await caller('ADMIN'))).id
    })

    it('refuses a MEMBER with 403, and changes nothing', async () => {
      await expect(call(await caller('MEMBER'), id)).rejects.toMatchObject({ statusCode: 403 })
      expect(await prisma.asset.findMany({ select: { name: true, removedAt: true } })).toEqual([{ name: 'existing', removedAt: null }])
      expect(await prisma.assetVersion.count()).toBe(1)
    })

    it('refuses a person with no settings row with 403', async () => {
      const user = await prisma.user.create({ data: {} as any })
      await expect(call({ user: { id: user.id } }, id)).rejects.toMatchObject({ statusCode: 403 })
    })

    it('refuses a caller who is not signed in with 401', async () => {
      await expect(call(anon, id)).rejects.toMatchObject({ statusCode: 401 })
      expect(await prisma.asset.count()).toBe(1)
    })
  })

  it('lets a Library maintainer make and edit one, but not remove it (D28)', async () => {
    const maintainer = await caller('MEMBER')
    await prisma.libraryMaintainer.create({ data: { userId: maintainer.user.id } })
    const created = await createBoardTemplate({ name: 'Kept', columns }, maintainer)
    await expect(updateBoardTemplate({ id: created.id, name: 'Kept too' }, maintainer)).resolves.toMatchObject({ version: '1.1.0' })
    await expect(deleteBoardTemplate({ id: created.id }, maintainer)).rejects.toMatchObject({ statusCode: 403 })
  })

  it('getBoardTemplates lists the templates for a signed-in caller and refuses an anonymous one', async () => {
    const admin = await caller('ADMIN')
    const created = await createBoardTemplate({ name: 'Listed', columns }, admin)
    const list = await getBoardTemplates(undefined, await caller('MEMBER'))
    expect(list.map((t: any) => t.id)).toEqual([created.id])
    await expect(getBoardTemplates(undefined, anon)).rejects.toThrow('Not authenticated')
  })

  it('getBoardTemplate returns the template with its columns, null for an unknown id, and refuses an anonymous caller', async () => {
    const admin = await caller('ADMIN')
    const created = await createBoardTemplate({ name: 'One', columns }, admin)
    const found = await getBoardTemplate({ id: created.id }, await caller('MEMBER'))
    expect(found.name).toBe('One')
    expect(found.columns.map((s: any) => s.name)).toEqual(['todo', 'doing', 'done'])
    expect(await getBoardTemplate({ id: 'missing' }, admin)).toBeNull()
    await expect(getBoardTemplate({ id: created.id }, anon)).rejects.toThrow('Not authenticated')
  })
})

describe('workforce template queries', () => {
  it('getWorkforceTemplate returns the team template asset with its content read from its pinned version', async () => {
    const { assetId } = await seedWorkforceBundle('wft-read')
    const result = await getWorkforceTemplate({ id: 'wft-read' }, await caller('MEMBER'))
    expect(result).toMatchObject({ id: assetId, name: 'The wft-read', description: 'wft-read team', tags: ['test'] })
    expect(result?.content.teams[0]).toMatchObject({ name: 'Crew' })
    expect(result?.content.teams[0].agents.map((a: any) => a.handle)).toEqual(['bundle-dev'])
  })

  it('getWorkforceTemplate returns null for an unknown id and refuses an anonymous caller', async () => {
    expect(await getWorkforceTemplate({ id: 'nope' }, await caller('MEMBER'))).toBeNull()
    await expect(getWorkforceTemplate({ id: 'nope' }, anon)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('getExistingAgentHandles lists every agent handle and refuses an anonymous caller', async () => {
    await prisma.agent.create({ data: { name: 'A', handle: 'alpha' } as any })
    await prisma.agent.create({ data: { name: 'B', handle: 'beta' } as any })
    const handles = await getExistingAgentHandles(undefined, await caller('MEMBER'))
    expect([...handles].sort()).toEqual(['alpha', 'beta'])
    await expect(getExistingAgentHandles(undefined, anon)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('getWorkforceReviewTask returns the proposal task, null for an unknown task, and refuses an anonymous caller', async () => {
    const task = await makeProposalTask({ templateId: 'wft-x' })
    const result = await getWorkforceReviewTask({ taskId: task.id }, await caller('MEMBER'))
    expect(result).toEqual({ id: task.id, title: 'Proposal', applicationData: { templateId: 'wft-x' } })
    expect(await getWorkforceReviewTask({ taskId: 'nope' }, await caller('MEMBER'))).toBeNull()
    await expect(getWorkforceReviewTask({ taskId: task.id }, anon)).rejects.toMatchObject({ statusCode: 401 })
  })

  it('getAgentTemplates lists the agent templates by name and refuses an anonymous caller', async () => {
    for (const slug of ['zed', 'abe']) await seedTemplate(prisma, 'AGENT', slug, agentPackage(slug))
    const list = await getAgentTemplates(undefined, await caller('MEMBER'))
    expect(list.map((t) => t.slug)).toEqual(['abe', 'zed'])
    expect(Object.keys(list[0]).sort()).toEqual(['description', 'handle', 'id', 'identity', 'name', 'publisher', 'slug', 'version'])
    await expect(getAgentTemplates(undefined, anon)).rejects.toMatchObject({ statusCode: 401 })
  })

})

describe('applyWorkforceTemplate', () => {
  it('applies the stored template as an ADMIN, creating its agents and teams', async () => {
    await seedWorkforceBundle('wft-apply', 'applied-dev')
    const result = await applyWorkforceTemplate({ templateId: 'wft-apply', selections: selectionsFor('applied-dev') }, await caller('ADMIN'))
    expect(result).toMatchObject({ agentCount: 1, teamCount: 1 })
    expect(await prisma.agent.findUnique({ where: { handle: 'applied-dev' } })).not.toBeNull()
    expect(await prisma.team.count({ where: { name: 'Crew' } })).toBe(1)
  })

  it('refuses an unknown template with 404', async () => {
    await expect(applyWorkforceTemplate({ templateId: 'nope', selections: noSelections }, await caller('ADMIN')))
      .rejects.toMatchObject({ statusCode: 404 })
  })

  it.each(['MEMBER'] as const)('refuses a %s with 403 and creates nothing', async (role) => {
    await seedWorkforceBundle('wft-apply', 'applied-dev')
    await expect(applyWorkforceTemplate({ templateId: 'wft-apply', selections: selectionsFor('applied-dev') }, await caller(role)))
      .rejects.toMatchObject({ statusCode: 403 })
    expect(await prisma.agent.count()).toBe(0)
    expect(await prisma.team.count()).toBe(0)
  })

  it('refuses a caller who is not signed in with 401', async () => {
    await expect(applyWorkforceTemplate({ templateId: 'wft-apply', selections: noSelections }, anon))
      .rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('confirmWorkforceTemplate and saveWorkforceDraft refusals', () => {
  it('confirm refuses a task that proposes no template with 400, and one already confirmed with 409', async () => {
    const admin = await caller('ADMIN')
    const noTemplate = await makeProposalTask({})
    await expect(confirmWorkforceTemplate({ taskId: noTemplate.id, selections: noSelections }, admin))
      .rejects.toMatchObject({ statusCode: 400 })

    await seedWorkforceBundle('wft-done', 'done-dev')
    const confirmed = await createTestTask({
      data: {
        title: 'Done', projectId: noTemplate.projectId, number: 2, column: 'done',
        applicationData: { templateId: 'wft-done', confirmedSelections: noSelections }, onBehalfOfUserId: 'person-1',
      } as any,
    })
    await expect(confirmWorkforceTemplate({ taskId: confirmed.id, selections: selectionsFor('done-dev') }, admin))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.agent.count()).toBe(0)
  })

  it('confirm and saveWorkforceDraft refuse a caller who is not signed in with 401', async () => {
    const task = await makeProposalTask({ templateId: 'wft-x' })
    await expect(confirmWorkforceTemplate({ taskId: task.id, selections: noSelections }, anon)).rejects.toMatchObject({ statusCode: 401 })
    await expect(saveWorkforceDraft({ taskId: task.id, selections: noSelections }, anon)).rejects.toMatchObject({ statusCode: 401 })
    expect((await prisma.task.findUnique({ where: { id: task.id } }))?.column).toBe('in_review')
  })

  it.each(['MEMBER'] as const)('confirm refuses a %s with 403 naming ADMIN and leaves the task in review', async (role) => {
    await seedWorkforceBundle('wft-done', 'done-dev')
    const task = await makeProposalTask({ templateId: 'wft-done' })
    await expect(confirmWorkforceTemplate({ taskId: task.id, selections: selectionsFor('done-dev') }, await caller(role)))
      .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    expect((await prisma.task.findUnique({ where: { id: task.id } }))?.column).toBe('in_review')
    expect(await prisma.agent.count()).toBe(0)
  })

  it('saveWorkforceDraft refuses a Member and a person with no settings row with 403', async () => {
    const task = await makeProposalTask({ templateId: 'wft-x' })
    for (const role of ['MEMBER'] as const) {
      await expect(saveWorkforceDraft({ taskId: task.id, selections: noSelections }, await caller(role)))
        .rejects.toMatchObject({ statusCode: 403, message: expect.stringContaining('ADMIN') })
    }
    const bare = await prisma.user.create({ data: {} as any })
    await expect(saveWorkforceDraft({ taskId: task.id, selections: noSelections }, { user: { id: bare.id } } as any))
      .rejects.toMatchObject({ statusCode: 403 })
    expect((await prisma.task.findUnique({ where: { id: task.id } }))?.applicationData).toEqual({ templateId: 'wft-x' })
  })
})

describe('applyAgentTemplate action @SC-186', () => {
  async function seedAgentBundle(slug: string, handle: string) {
    await seedTemplate(prisma, 'AGENT', slug, agentPackage(slug, { handle }))
  }

  it('creates the agent as an ADMIN', async () => {
    await seedAgentBundle('bundle-agent', 'bundle')
    const admin = await caller('ADMIN')
    const result = await applyAgentTemplate({ slug: 'bundle-agent', handle: 'my-agent' }, admin)
    expect(result.handle).toBe('my-agent')
    const agent = await prisma.agent.findUnique({ where: { id: result.id } })
    expect(agent).toMatchObject({ name: 'The bundle-agent', handle: 'my-agent' })
  })

  it('maps a handle that already exists to 409 and creates no second agent', async () => {
    await seedAgentBundle('bundle-agent', 'bundle')
    await prisma.agent.create({ data: { name: 'Existing', handle: 'taken' } as any })
    await expect(applyAgentTemplate({ slug: 'bundle-agent', handle: 'taken' }, await caller('ADMIN')))
      .rejects.toMatchObject({ statusCode: 409 })
    expect(await prisma.agent.count()).toBe(1)
  })

  it('refuses a Member with 403 and an anonymous caller with 401, creating nothing', async () => {
    await seedAgentBundle('bundle-agent', 'bundle')
    await expect(applyAgentTemplate({ slug: 'bundle-agent', handle: 'x' }, await caller('MEMBER')))
      .rejects.toMatchObject({ statusCode: 403 })
    await expect(applyAgentTemplate({ slug: 'bundle-agent', handle: 'x' }, anon))
      .rejects.toMatchObject({ statusCode: 401 })
    expect(await prisma.agent.count()).toBe(0)
  })
})
