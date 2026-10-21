/**
 * Workforce template operations (@SC-085, @SC-210) against the real test
 * database: listing the templates, and proposing one — an ADMIN's act, which
 * files an in-review task on the Workforce Assembly board (made the first time
 * it is needed) on behalf of the person behind the run.
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
import { SYSTEM_TEMPLATE_IDS } from '../../../library/systemTemplates'
import { NO_EXECUTION_SITE_MESSAGE } from '../../../shared/noExecutionSite'
import { ControlPlaneError } from '../types'
import { connectionCaller } from '../../../shared/testing/connectionCaller'
import { chatCtx, runCtx } from './controlPlaneFixtures'

let adminId: string
let operatorId: string
beforeEach(async () => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
  adminId = (await createUserWithRole('ADMIN')).id
  operatorId = (await createUserWithRole('MEMBER')).id
  await prisma.agent.create({ data: { id: 'agent-1', name: 'Kernel', handle: 'agent-1' } })
  await prisma.agentSession.create({ data: { id: 's1', userId: adminId, agentId: 'agent-1', sessionType: 'chat' } })
  await prisma.workforceTemplate.create({ data: { id: 'wft-1', name: 'Dev Team', description: 'd', assetPath: 'p' } })
  await prisma.boardTemplate.create({ data: { id: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY, name: 'Workforce Assembly', assetPath: 'x', isSystem: true } })
})

const admin = () => chatCtx(adminId, 'ADMIN')
const propose = (ctx: Parameters<typeof workforceOps.proposeWorkforceTemplateOp>[0], templateId = 'wft-1') =>
  workforceOps.proposeWorkforceTemplateOp(ctx, { templateId, reason: 'because' })
async function assemblyBoard() {
  const site = await ensureExecutionSite()
  const project = await createProject({ name: 'Workforce Assembly', executionSiteId: site.id, accessLevel: 'OPEN' })
  await prisma.projectMember.create({ data: { projectId: project.id, userId: adminId } })
  return prisma.board.create({ data: { name: 'Assembly', projectId: project.id, templateId: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY } })
}

describe('list_workforce_templates', () => {
  it('returns the available templates, to any caller', async () => {
    expect(await workforceOps.listWorkforceTemplatesOp(runCtx(null), {})).toEqual([{ id: 'wft-1', name: 'Dev Team', description: 'd', tags: [] }])
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
    await assemblyBoard()
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
  it('creates an in-review task on the assembly board, on behalf of the run\'s person, and returns its review URL', async () => {
    const board = await assemblyBoard()
    const result = await propose(admin()) as { success: true; taskId: string; reviewUrl: string }

    expect(result.reviewUrl).toBe(`https://site.example.com/workforce-templates/review?taskId=${result.taskId}&templateId=wft-1`)
    expect(await prisma.task.findUniqueOrThrow({ where: { id: result.taskId } })).toMatchObject({
      column: 'in_review', boardId: board.id, projectId: board.projectId, onBehalfOfUserId: adminId,
      applicationData: { templateId: 'wft-1' }, title: 'Proposed: Dev Team',
    })
  })

  it('creates no task when the run is on behalf of no one who can reach the project (adr-0089)', async () => {
    await assemblyBoard()
    await prisma.agentSession.update({ where: { id: 's1' }, data: { sessionType: 'task' } })
    await expect(propose(admin())).rejects.toMatchObject({ code: 'forbidden' })
    expect(await prisma.task.count()).toBe(0)
  })

  it('creates the Workforce Assembly project and board when none exists yet, and reuses them next time', async () => {
    await ensureExecutionSite()
    await propose(admin())
    await propose(admin())
    expect(await prisma.project.findMany({ select: { name: true } })).toEqual([{ name: 'Workforce Assembly' }])
    expect(await prisma.board.count({ where: { templateId: SYSTEM_TEMPLATE_IDS.WORKFORCE_ASSEMBLY } })).toBe(1)
    expect(await prisma.task.count()).toBe(2)
  })

  it('with no Execution Site connected, refuses before creating a project, board or task', async () => {
    await expect(propose(admin())).rejects.toThrow(NO_EXECUTION_SITE_MESSAGE)
    expect([await prisma.project.count(), await prisma.board.count(), await prisma.task.count()]).toEqual([0, 0, 0])
  })
})
