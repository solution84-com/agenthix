/**
 * Workforce template operations (@SC-085, @SC-210) against the real test
 * database: listing the templates, and proposing one — an ADMIN's act, which
 * files a Team proposal in review in the Workforce Assembly project (made the
 * first time it is needed) on behalf of the person behind the run.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../test/db'
import { createUserWithRole, createProject, ensureExecutionSite } from '../../../test/factories'

vi.mock('wasp/server', async () => {
  const { prisma } = await import('../../../test/db')
  const { HttpError } = await vi.importActual<typeof import('wasp/server')>('wasp/server')
  return { prisma, HttpError, Prisma: (await import('@prisma/client')).Prisma }
})
vi.mock('../../dashboard/debouncedPush', () => import('../../../test/fakes/debouncedPush'))
vi.mock('../../dashboard/activity', () => import('../../../test/fakes/activity'))
vi.mock('../../../agents/TaskRunner', () => import('../../../test/fakes/TaskRunner'))
vi.mock('../../siteConfig', () => ({ getSiteClientUrl: () => 'https://site.example.com' }))
// A new project's files are seeded on its site; the site answers as one would.
vi.mock('../../../sites/channel', async () => {
  const { ChannelRequestFailed } = await import('../../../sites/channel/pendingRequests')
  return { siteChannelRegistry: { request: vi.fn(async () => ({})), isOnline: () => true }, ChannelRequestFailed }
})

import * as workforceOps from '../workforceOps'
import { MADE_FROM_WORKFORCE_ASSEMBLY } from '../../../library/systemTemplates'
import { addTeamProposalType, seedAssemblyTemplate, seedTemplate, teamPackage } from '../../../assets/templates/__tests__/templateFixtures'
import { NO_EXECUTION_SITE_MESSAGE } from '../../../shared/noExecutionSite'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { chatCtx, runCtx } from './controlPlaneFixtures'

let adminId: string
let teamId: string
let assemblyVersionId: string
let operatorId: string
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  adminId = (await createUserWithRole('ADMIN')).id
  operatorId = (await createUserWithRole('MEMBER')).id
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Kernel', handle: 'agent-1' } })
  await prisma.agentSession.create({ data: { id: 's1', userId: adminId, agentId: 'agent-1', sessionType: 'chat' } })
  teamId = (await seedTemplate(prisma, 'TEAM', 'dev-team', teamPackage('dev-team', { agents: [{ handle: 'dev' }] }))).assetId
  assemblyVersionId = await seedAssemblyTemplate(prisma)
})

const admin = () => chatCtx(adminId, 'ADMIN')
const propose = (ctx: Parameters<typeof workforceOps.proposeWorkforceTemplateOp>[0], templateId = 'agenthix/dev-team') =>
  workforceOps.proposeWorkforceTemplateOp(ctx, { templateId, reason: 'because' })
async function assemblyProject() {
  const site = await ensureExecutionSite()
  const project = await createProject({ name: 'Workforce Assembly', executionSiteId: site.id, accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: adminId } })
  return { project, ...(await addTeamProposalType(prisma, project.id, assemblyVersionId)) }
}

describe('list_workforce_templates', () => {
  it('returns the available templates by identity, to any caller', async () => {
    expect(await workforceOps.listWorkforceTemplatesOp(runCtx(null), {})).toEqual([{ id: 'agenthix/dev-team', name: 'The dev-team', description: 'dev-team team', tags: ['test'] }])
  })
})

describe('propose_workforce_template role floor (ADMIN)', () => {
  it.each([
    ['an unattended run', () => runCtx(null)],
    ["a Member's chat, whatever role its capability carries", () => chatCtx(operatorId, 'ADMIN')],
    ["an operator's connection", () => connectionCaller({ userId: adminId, role: 'MEMBER' })],
  ])('refuses %s, naming the floor and creating nothing', async (_who, ctx) => {
    const err = await propose(ctx()).catch((e) => e)
    expect(err).toBeInstanceOf(ControlPlaneError)
    expect(err.code).toBe('forbidden')
    expect(await prisma.task.count()).toBe(0)
  })

  it("passes an ADMIN chat and an admin's connection through to the template", async () => {
    await assemblyProject()
    await expect(propose(admin())).resolves.toMatchObject({ success: true })
    await expect(propose(connectionCaller({ userId: adminId, role: 'ADMIN' }))).resolves.toMatchObject({ success: true })
  })
})

describe('propose_workforce_template unknown id @SC-210', () => {
  it("returns { success: false, error: \"Template '…' not found\" } without creating a task", async () => {
    expect(await propose(admin(), 'nope')).toEqual({ success: false, error: "Template 'nope' not found" })
    expect(await prisma.task.count()).toBe(0)
  })
})

describe('propose_workforce_template happy path @SC-085', () => {
  it('creates a Team proposal in review in the Workforce Assembly project, on behalf of the run\'s person, and returns its review URL', async () => {
    const { project, typeId, inReviewColumnId } = await assemblyProject()
    const result = await propose(admin()) as { success: true; taskId: string; reviewUrl: string }

    expect(result.reviewUrl).toBe(`https://site.example.com/workforce-templates/review?taskId=${result.taskId}&templateId=${teamId}`)
    expect(await prisma.task.findUniqueOrThrow({ where: { id: result.taskId } })).toMatchObject({
      typeId, columnId: inReviewColumnId, state: 'IN_PROGRESS', projectId: project.id, onBehalfOfUserId: adminId,
      applicationData: { templateId: teamId }, title: 'Proposed: The dev-team',
    })
  })

  it('creates no task when the run is on behalf of no one who can reach the project (adr-0089)', async () => {
    await assemblyProject()
    await prisma.agentSession.update({ where: { id: 's1' }, data: { sessionType: 'task' } })
    await expect(propose(admin())).rejects.toMatchObject({ code: 'forbidden' })
    expect(await prisma.task.count()).toBe(0)
  })

  it('creates the Workforce Assembly project with its Team proposal type when none exists yet, and reuses them next time', async () => {
    await ensureExecutionSite()
    await propose(admin())
    await propose(admin())
    expect(await prisma.project.findMany({ select: { name: true } })).toEqual([{ name: 'Workforce Assembly' }])
    const types = await prisma.taskType.findMany({ where: MADE_FROM_WORKFORCE_ASSEMBLY, include: { columns: { orderBy: { order: 'asc' } } } })
    expect(types.map(t => [t.name, t.columns.map(c => c.name)])).toEqual([['Team proposal', ['Planned', 'To do', 'In review', 'Done']]])
    expect(await prisma.task.findMany({ select: { columnId: true } })).toEqual([{ columnId: types[0]!.columns[2]!.id }, { columnId: types[0]!.columns[2]!.id }])
  })

  it('with no Execution Site connected, refuses before creating a project or task', async () => {
    await expect(propose(admin())).rejects.toThrow(NO_EXECUTION_SITE_MESSAGE)
    expect([await prisma.project.count(), await prisma.task.count()]).toEqual([0, 0])
  })
})
