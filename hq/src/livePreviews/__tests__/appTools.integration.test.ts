/**
 * The live preview an app tool acts on, against the real test database (ADR-0094; live preview phase 2's proof, Q9):
 * the one of the branch the run's session works on, on the run's site, read at the call; a run whose capability was
 * signed before the live preview started still reaches it, and a branch with none, or with one on another site, is
 * refused in words that say what to do. The site's answers are replaced: they leave hq.
 */
import { withFeature } from '../../test/withFeature'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '../../test/db'
import { createAgent, createProject, createSession, createTestTask, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../test/factories'

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<object>('wasp/server')
  const { prisma } = await import('../../test/db')
  return { ...actual, prisma }
})
vi.mock('../../sessions/siteRuntimeStore', () => import('../../test/fakes/siteRuntimeStore'))
vi.mock('../../agents/TaskRunner', () => import('../../test/fakes/TaskRunner'))
vi.mock('../../server/dashboard/debouncedPush', () => import('../../test/fakes/debouncedPush'))
vi.mock('../../conversations/coordinator/events', () => ({ conversationEvents: { message: vi.fn(), operation: vi.fn(), operationLines: vi.fn() } }))
vi.mock('../../sites/channel', () => ({
  siteChannelRegistry: { isOnline: () => true, request: vi.fn() },
  ChannelRequestFailed: class extends Error { constructor(m: string, readonly code: string) { super(m) } },
}))
const reloads = vi.hoisted(() => [] as string[])
vi.mock('../socket', () => ({
  emitLivePreviewReload: (row: { id: string }) => { reloads.push(row.id) },
  emitLivePreviewAuto: vi.fn(), emitLivePreviewChange: vi.fn(),
}))
vi.mock('../../relays', () => ({
  livePreviewsHaveAnAddress: () => true,
  NO_PREVIEW_ADDRESS_MESSAGE: 'Live previews need a domain. Nothing was changed.',
  appAddress: (id: string) => `https://p-${id}.preview.example`,
  appTickets: { revoke: vi.fn() },
  onAppsCutOff: vi.fn(), onBundleReport: vi.fn(), bundleRelayFor: vi.fn(async () => null), carryBundle: vi.fn(),
  liveAppEntryDeps: vi.fn(), openLiveApp: vi.fn(),
}))
const workspaceRow = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))
vi.mock('../../storage/workspaceStore', async () => {
  const actual = await vi.importActual<object>('../../storage/workspaceStore')
  return { ...actual, getWorkspace: vi.fn(async (id: string) => (workspaceRow.current?.id === id ? workspaceRow.current : null)) }
})
vi.mock('../../branches/siteCalls', () => ({
  siteCall: vi.fn(async (_s: string, method: string) => {
    if (method === 'branch.list') return { main: { name: 'main', head: 'a'.repeat(40), versions: 1 }, branches: [], overflow: false }
    throw new Error(`no answer for ${method}`)
  }),
  timeoutOf: () => 1000,
}))
const asked = vi.hoisted(() => [] as { siteId: string; method: string; params: Record<string, unknown> }[])
vi.mock('../siteAsk', async () => {
  const actual = await vi.importActual<typeof import('../siteAsk')>('../siteAsk')
  return {
    ...actual,
    askSite: vi.fn(async (siteId: string, method: string, params: Record<string, unknown>) => {
      asked.push({ siteId, method, params })
      const now = new Date().toISOString()
      if (method === 'livePreview.open') {
        return {
          ok: true,
          livePreview: {
            livePreviewId: params.livePreviewId, projectId: params.projectId, personId: params.personId,
            workspaceId: (params.workspace as { workspaceId: string }).workspaceId, branch: params.branch, onMain: params.onMain,
            copy: params.copy, head: null, openedAt: now, state: { state: 'running', since: now },
          },
        }
      }
      if (method === 'livePreview.appStart') {
        const app = params.app as { appId: string; name: string; folder: string; command: string; port: number }
        return { ok: true, result: { app: { ...app, livePreviewId: params.livePreviewId, state: 'starting', since: now, lastLines: [], detail: null } } }
      }
      throw new Error(`no answer for ${method}`)
    }),
  }
})

import { addRun, reset } from '../../test/fakes/siteRuntimeStore'
import { reloadViewOp, startAppOp } from '../appTools'

let n = 0
let siteId: string
let executionSiteId: string
let sessionId: string
let taskId: string
let personId: string
let projectId: string
let row: Record<string, unknown>

beforeEach(async () => {
  reset()
  reloads.length = 0
  asked.length = 0
  const site = await ensureExecutionSite()
  siteId = site.siteId
  executionSiteId = site.id
  await prisma.executionSite.update({ where: { id: site.id }, data: { livePreviewsAllowed: true, livePreviewLimit: null } })
  await prisma.livePreviewGuardReport.upsert({ where: { executionSiteId: site.id }, create: { executionSiteId: site.id, at: new Date() }, update: { at: new Date() } })
  const person = await createUserWithRole('MEMBER')
  personId = person.id
  const agent = await createAgent()
  const project = await createProject({ name: 'Shop', slug: `shop-${++n}` })
  projectId = project.id
  await joinProjectAs(projectId, personId, 'MEMBER')
  const task = await createTestTask({
    data: { projectId, title: 'Add a banner', number: n, assignedAgentId: agent.id, status: 'DONE', onBehalfOfUserId: personId },
  })
  taskId = task.id
  const workspaceId = `ws-${n}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: site.id } })
  workspaceRow.current = { id: workspaceId, name: 'shop-app', ownerType: 'project', ownerId: projectId, siteId, allowedTools: null }
  const branch = await prisma.workspaceBranch.create({
    data: { workspaceId, ownerType: 'project', ownerId: projectId, name: 'add-banner', userId: personId, taskId },
  })
  await prisma.branchCopy.create({ data: { branchId: branch.id, siteId: site.id, folderId: `copy-${n}`, state: 'READY' } })
  const session = await createSession({ userId: personId, agentId: agent.id, taskId })
  sessionId = session.id
  addRun(siteId, { id: 'run-1', sessionId, taskId, status: 'RUNNING' })
  row = {
    executionSiteId, projectId, workspaceId, ownerType: 'project', ownerId: projectId, branchId: branch.id,
    branch: 'add-banner', copyKind: 'BRANCH', copyId: `copy-${n}`, userId: personId, state: 'RUNNING',
  }
})

function ctx(livePreview?: unknown, startedBy = 'person') {
  return { kind: 'run' as const, claims: { sessionId, taskId, siteId, agentId: 'agent-x', startedBy, ...(livePreview ? { livePreview } : {}) } } as never
}

withFeature('livePreview', () => {
describe('the live preview an app tool acts on @SC-1701', () => {
  it('is the branch\'s live preview on the run\'s site, though the run\'s capability names none', async () => {
    const lp = await prisma.livePreview.create({ data: row as never })
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).resolves.toMatchObject({ reloaded: true })
    expect(reloads).toEqual([lp.id])
  })

  it('is the one running now, when the capability names one that has stopped', async () => {
    const old = await prisma.livePreview.create({ data: { ...row, copyId: 'old', state: 'STOPPED' } as never })
    const now = await prisma.livePreview.create({ data: row as never })
    await reloadViewOp(ctx({ livePreviewId: old.id, workspaceId: row.workspaceId, branch: 'add-banner' }), { runId: 'run-1' })
    expect(reloads).toEqual([now.id])
  })

  it('is none when the branch has none open: the run is told to have the person open it', async () => {
    await prisma.livePreview.create({ data: { ...row, state: 'STOPPED' } as never })
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).rejects.toThrow(/Ask the person to start one from Live preview/)
    expect(reloads).toEqual([])
  })

  it('is none when it runs on another site than the run', async () => {
    const away = await prisma.executionSite.create({ data: { siteId: `away-${n}`, label: 'preview-box', status: 'ONLINE' } as never })
    await prisma.livePreview.create({ data: { ...row, executionSiteId: away.id, copyKind: 'BUNDLE' } as never })
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).rejects.toThrow(/runs on another site/)
  })
})
})

withFeature('livePreview', () => {
describe('start_app on a branch with no live preview open @SC-1702', () => {
  const START = { name: 'web', folder: '', command: 'npm start', port: '3000', runId: 'run-1' }
  const opened = () => asked.filter(a => a.method === 'livePreview.open')
  const started = () => asked.filter(a => a.method === 'livePreview.appStart')

  it('opens it as the run\'s person on the run\'s site, then starts the app in it', async () => {
    await expect(startAppOp(ctx(), START)).resolves.toMatchObject({ app: { name: 'web' } })
    const live = await prisma.livePreview.findFirst({ where: { workspaceId: row.workspaceId as string, state: 'RUNNING' } })
    expect(live).toMatchObject({ userId: personId, executionSiteId, branch: 'add-banner', copyKind: 'BRANCH' })
    expect(opened()).toHaveLength(1)
    expect(started()).toEqual([expect.objectContaining({ params: expect.objectContaining({ livePreviewId: live!.id }) })])
  })

  it('refuses a Viewer\'s run, and opens and starts nothing', async () => {
    const viewer = await createUserWithRole('MEMBER')
    await joinProjectAs(projectId, viewer.id, 'VIEWER')
    await prisma.task.update({ where: { id: taskId }, data: { onBehalfOfUserId: viewer.id } })
    await expect(startAppOp(ctx(), START)).rejects.toThrow(/can only view this project.*Nothing was started\./)
    expect(asked).toEqual([])
    expect(await prisma.livePreview.count()).toBe(0)
    expect(await prisma.liveApp.count()).toBe(0)
  })

  it('refuses on a full site, in hq\'s words, and opens and starts nothing', async () => {
    await prisma.executionSite.update({ where: { id: executionSiteId }, data: { livePreviewLimit: 1 } })
    await prisma.livePreview.create({ data: { ...row, workspaceId: 'ws-other', branchId: null, branch: 'main', onMain: true, copyKind: 'MAIN', copyId: 'other' } as never })
    await expect(startAppOp(ctx(), START)).rejects.toThrow(/1 of 1 live previews open.*Nothing was started\./)
    expect(asked).toEqual([])
    expect(await prisma.livePreview.count({ where: { workspaceId: row.workspaceId as string } })).toBe(0)
    expect(await prisma.liveApp.count()).toBe(0)
  })

  it('refuses a run no person started, and opens and starts nothing', async () => {
    await expect(startAppOp(ctx(undefined, 'pulse'), START)).rejects.toThrow(/No person started this run.*Nothing was started\./)
    expect(asked).toEqual([])
    expect(await prisma.livePreview.count()).toBe(0)
  })

  it('refuses when live previews are off on the run\'s site', async () => {
    await prisma.executionSite.update({ where: { id: executionSiteId }, data: { livePreviewsAllowed: false } })
    await expect(startAppOp(ctx(), START)).rejects.toThrow(/Nothing was started\./)
    expect(asked).toEqual([])
  })
})
})

