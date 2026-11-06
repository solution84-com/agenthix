/**
 * start_work naming a workspace, against the real test database (owner decision, area 7): any conversation's lead
 * may start work in a workspace its place holds, on a worker of its own there, so the work runs on the conversation's
 * own branch; one worker per workspace, the same brief to it while pending is that one, and a workspace of another
 * place, or one the person may only read, is refused in words.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { prisma } from '../../../../test/db'
import { createProject, ensureExecutionSite } from '../../../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../../../agents/dispatchService', () => import('../../../../test/fakes/dispatchService'))
vi.mock('../../../../sessions/siteRuntimeStore', () => import('../../../../test/fakes/siteRuntimeStore'))
vi.mock('../../../coordinator/mailbox', async () => {
  const { spyMailbox } = await import('./workerFixtures')
  const { createSettleOperation } = await import('../../settle')
  const mailbox = spyMailbox()
  return { mailbox, settleOperation: createSettleOperation(() => mailbox) }
})
const workspaces = vi.hoisted(() => new Map<string, { id: string; name: string; ownerType: 'project' | 'user'; ownerId: string }>())
vi.mock('../../../../storage/workspaceStore', async () => {
  const actual = await vi.importActual<object>('../../../../storage/workspaceStore')
  return { ...actual, getWorkspace: vi.fn(async (id: string) => workspaces.get(id) ?? null) }
})

import { createStartWorkTool } from '../startWork'
import { NEVER_ABORTED, world, type World } from './workerFixtures'

let w: World
const tool = createStartWorkTool({ moveOn: () => {} })

async function placeWorkspace(id: string, name: string, ownerId: string): Promise<void> {
  const site = await ensureExecutionSite()
  workspaces.set(id, { id, name, ownerType: 'project', ownerId })
  await prisma.workspacePlacement.create({ data: { workspaceId: id, siteId: site.id } })
}

beforeEach(async () => {
  workspaces.clear()
  w = await world()
  await placeWorkspace('w-shop', 'shop-app', w.project.id)
})

const brief = (over: Record<string, unknown> = {}) =>
  tool.run(w.capability, { boundary: w.project.key, title: 'Build the login page', brief: 'Add a login page.', ...over }, NEVER_ABORTED)

async function workerOf(operationId: string) {
  const op = await prisma.operation.findUniqueOrThrow({ where: { id: operationId }, select: { workerSessionId: true } })
  return prisma.agentSession.findUniqueOrThrow({ where: { id: op.workerSessionId! } })
}

describe('start_work naming a workspace', () => {
  it("queues the brief on the conversation's worker in that workspace, apart from the place's files", async () => {
    const inWorkspace = await brief({ workspace: 'w-shop' })
    const inFiles = await brief({ brief: 'Tidy the notes.' })
    if (inWorkspace.status !== 'accepted' || inFiles.status !== 'accepted') throw new Error('not accepted')
    const [code, files] = [await workerOf(inWorkspace.operationId), await workerOf(inFiles.operationId)]
    expect(code.primaryWorkspaceId).toBe('w-shop')
    expect(code.conversationId).toBe(w.conversation.id)
    expect(files.primaryWorkspaceId).toBeNull()
    expect(code.id).not.toBe(files.id)
  })

  it('is one brief while pending, and the same brief to the place\'s files is another', async () => {
    const first = await brief({ workspace: 'w-shop' })
    const again = await brief({ workspace: 'w-shop' })
    const files = await brief()
    expect(again).toEqual(first)
    expect(files).not.toEqual(first)
  })

  it("refuses a workspace of another place, starting nothing", async () => {
    const other = await createProject({ name: 'Finance' })
    await placeWorkspace('w-finance', 'ledger', other.id)
    expect(await brief({ workspace: 'w-finance' })).toEqual({
      status: 'refused', reason: expect.stringContaining('there is no workspace with the id "w-finance" in Shop'),
    })
    expect(await prisma.operation.count()).toBe(0)
  })

  it('refuses a person who may only read the project, starting nothing', async () => {
    await prisma.projectMember.updateMany({ where: { projectId: w.project.id, userId: w.person.id }, data: { role: 'VIEWER' } })
    expect(await brief({ workspace: 'w-shop' })).toMatchObject({ status: 'refused' })
    expect(await prisma.agentSession.count({ where: { primaryWorkspaceId: 'w-shop' } })).toBe(0)
  })
})
