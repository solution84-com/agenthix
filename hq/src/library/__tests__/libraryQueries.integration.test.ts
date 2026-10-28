import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../test/db'
import { createProject, createTestTask } from '../../test/factories'

// Library + workforce-template DB queries/actions run at the integration level
// against the real test DB (ADR-0035). These modules import `prisma` from
// `wasp/server`, so we replace that module with the real test Prisma client
// plus the real HttpError. Filesystem-backed apply paths are covered in
// applyWorkforceTemplate/applyAgentTemplate; here we cover pure DB paths.
//
// Covers SC-061, SC-068, SC-067 (confirm / save-draft / not-found paths).

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../test/db')
  const { HttpError } = await vi.importActual<any>('wasp/server')
  return { prisma, HttpError }
})

vi.mock('../workforceTemplateService', async () => ({
  ...(await vi.importActual<any>('../workforceTemplateService')),
  readWorkforceContent: vi.fn(async () => ({
    teams: [{ name: 'Eng', purpose: 'Build', agents: [{ handle: 'proposed-dev', name: 'Dev', role: 'Dev', responsibilities: 'Code', skills: [] }] }],
    projects: [],
  })),
}))

import { getWorkforceTemplates } from '../queries'
import { confirmWorkforceTemplate, saveWorkforceDraft } from '../actions'
import { listLibrarySkills } from '../../agents/skillsLibraryService'
import { storeContent } from '../../assets/content'
import { SYSTEM_TEMPLATE_IDS } from '../systemTemplates'

const authed = { user: { id: 'u1' } } as any
const anon = { user: undefined } as any

// Local helpers (factories.ts is shared and off-limits).
async function makeOrg() {
  return prisma.org.create({ data: { name: 'Acme' } as any })
}
async function makeProject(name = 'P') {
  return createProject({ name, key: 'P' + Math.random().toString(36).slice(2, 6) })
}
async function makeBoardTemplate(id: string) {
  return prisma.boardTemplate.upsert({
    where: { id },
    create: { id, name: id, description: '', assetPath: `library/boards/${id}.json`, isSystem: true },
    update: {},
  } as any)
}
async function makeBoard(projectId: string, templateId?: string) {
  if (templateId) await makeBoardTemplate(templateId)
  return prisma.board.create({ data: { name: 'B', projectId, templateId } as any })
}
// confirmWorkforceTemplate requires the ADMIN role (src/library/actions.ts:77,
// added by ee9a54f's shared role-floor policy). `authed` above is a bare
// { id: 'u1' } with no backing User/UserSettings row, so it reads as no role
// (below ADMIN) and the gate — correctly — refuses it. Build a real ADMIN
// caller instead of weakening the gate.
async function makeAdminAuthed() {
  const user = await prisma.user.create({ data: {} as any })
  await prisma.userSettings.create({ data: { userId: user.id, role: 'ADMIN' } as any })
  return { user: { id: user.id } } as any
}

async function makeTask(opts: { projectId: string; boardId?: string; column?: string; applicationData?: any }) {
  // Task.number is unique per project; derive a fresh number.
  const count = await prisma.task.count({ where: { projectId: opts.projectId } })
  return createTestTask({
    data: {
      title: 'T',
      projectId: opts.projectId,
      number: count + 1,
      boardId: opts.boardId,
      column: opts.column,
      applicationData: opts.applicationData,
      onBehalfOfUserId: 'person-1',
    } as any,
  })
}

describe('listLibrarySkills @SC-061', () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists the organisation's skills apart from Agenthix's shelf", async () => {
    await makeOrg()
    const files = [{ path: 'SKILL.md', content: Buffer.from('---\nname: org-skill\ndescription: d\n---\nbody') }]
    const asset = await prisma.asset.create({ data: { kind: 'SKILL', publisher: 'acme', name: 'org-skill' } })
    const version = await prisma.assetVersion.create({ data: { assetId: asset.id, version: '1.0.0', digest: await storeContent(files, prisma), source: 'MADE_HERE' } })
    await prisma.asset.update({ where: { id: asset.id }, data: { currentVersionId: version.id } })

    const orgSkills = await listLibrarySkills('ORG')
    const platformSkills = await listLibrarySkills('PLATFORM')

    expect(orgSkills.map((s) => s.slug)).toEqual(['org-skill'])
    expect(orgSkills[0].content).toBe('body')
    expect(platformSkills.every((s) => s.id.startsWith('agenthix/'))).toBe(true)
  })
})

describe('getWorkforceTemplates @SC-061', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns workforce template summaries for an authenticated user', async () => {
    await prisma.workforceTemplate.create({
      data: { id: 'wft-x', name: 'X', description: 'desc', tags: ['a'], assetPath: 'library/workforce/wft-x' } as any,
    })

    const result = await getWorkforceTemplates(undefined, authed)

    expect(result).toEqual([{ id: 'wft-x', name: 'X', description: 'desc', tags: ['a'] }])
  })

  it('rejects an unauthenticated caller', async () => {
    await expect(getWorkforceTemplates(undefined, anon)).rejects.toMatchObject({ statusCode: 401 })
  })
})

describe('confirmWorkforceTemplate @SC-067', () => {
  beforeEach(() => vi.clearAllMocks())

  it('applies the proposed template, finishes the task with no run queued, and stores the selections', async () => {
    await prisma.workforceTemplate.create({
      data: { id: 'wft-solo-dev', name: 'Solo', assetPath: 'library/workforce/wft-solo-dev' } as any,
    })
    const admin = await makeAdminAuthed()
    const project = await makeProject()
    const board = await makeBoard(project.id, SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY)
    const task = await makeTask({
      projectId: project.id,
      boardId: board.id,
      column: 'in_review',
      applicationData: { templateId: 'wft-solo-dev', draftSelections: { teams: [], projects: [] } },
    })
    const selections = {
      teams: [{ name: 'Eng', include: true, agents: [{ handle: 'proposed-dev', resolvedHandle: 'proposed-dev', include: true, skills: [] }] }],
      projects: [],
    } as any

    const result = await confirmWorkforceTemplate({ taskId: task.id, selections }, admin)

    expect(result).toMatchObject({ agentCount: 1, teamCount: 1 })
    expect(await prisma.agent.findUnique({ where: { handle: 'proposed-dev' } })).not.toBeNull()
    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored?.column).toBe('done')
    expect(stored?.status).toBe('DONE')
    expect(stored?.doneAt).not.toBeNull()
    expect(stored?.runState).not.toBe('RUN_QUEUED')
    expect(stored?.runState).not.toBe('RUN_THROTTLED')
    const data = stored?.applicationData as any
    expect(data.confirmedSelections).toEqual(selections)
    expect(data.draftSelections).toBeNull()
    expect(data.templateId).toBe('wft-solo-dev') // preserved
  })

  it('leaves the task in review when applying fails', async () => {
    await prisma.workforceTemplate.create({
      data: { id: 'wft-solo-dev', name: 'Solo', assetPath: 'library/workforce/wft-solo-dev' } as any,
    })
    await prisma.agent.create({ data: { name: 'Taken', handle: 'proposed-dev' } as any })
    const admin = await makeAdminAuthed()
    const project = await makeProject()
    const task = await makeTask({ projectId: project.id, column: 'in_review', applicationData: { templateId: 'wft-solo-dev' } })
    const selections = {
      teams: [{ name: 'Eng', include: true, agents: [{ handle: 'proposed-dev', resolvedHandle: 'proposed-dev', include: true, skills: [] }] }],
      projects: [],
    } as any

    await expect(confirmWorkforceTemplate({ taskId: task.id, selections }, admin)).rejects.toThrow(/already exists/)

    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect(stored?.column).toBe('in_review')
    expect((stored?.applicationData as any).confirmedSelections).toBeUndefined()
  })

  it('rejects a non-existent task (404)', async () => {
    const admin = await makeAdminAuthed()
    await expect(
      confirmWorkforceTemplate({ taskId: 'nope', selections: { teams: [], projects: [] } as any }, admin),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rejects a caller below the ADMIN role (403)', async () => {
    const project = await makeProject()
    const task = await makeTask({
      projectId: project.id,
      applicationData: { templateId: 'wft-solo-dev' },
    })

    await expect(
      confirmWorkforceTemplate({ taskId: task.id, selections: { teams: [], projects: [] } as any }, authed),
    ).rejects.toMatchObject({ statusCode: 403 })
  })
})

describe('saveWorkforceDraft @SC-067', () => {
  beforeEach(() => vi.clearAllMocks())

  it('stores draft selections without changing stage', async () => {
    const admin = await makeAdminAuthed()
    const project = await makeProject()
    const task = await makeTask({ projectId: project.id, column: 'in_review', applicationData: { templateId: 't' } })
    const draft = { teams: [{ name: 'Eng', include: true, agents: [] }], projects: [] } as any

    await saveWorkforceDraft({ taskId: task.id, selections: draft }, admin)

    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect((stored?.applicationData as any).draftSelections).toEqual(draft)
    expect(stored?.column).toBe('in_review') // unchanged
  })

  it('rejects a non-existent task (404)', async () => {
    const admin = await makeAdminAuthed()
    await expect(
      saveWorkforceDraft({ taskId: 'nope', selections: { teams: [], projects: [] } as any }, admin),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  // R-195: the draft is part of shaping the organisation's workforce.
  it('rejects a caller below the ADMIN role (403) and stores nothing', async () => {
    const project = await makeProject()
    const task = await makeTask({ projectId: project.id, column: 'in_review', applicationData: { templateId: 't' } })

    await expect(
      saveWorkforceDraft({ taskId: task.id, selections: { teams: [], projects: [] } as any }, authed),
    ).rejects.toMatchObject({ statusCode: 403 })

    const stored = await prisma.task.findUnique({ where: { id: task.id } })
    expect((stored?.applicationData as any).draftSelections).toBeUndefined()
  })
})
