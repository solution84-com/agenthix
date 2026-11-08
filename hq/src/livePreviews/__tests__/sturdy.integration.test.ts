/**
 * What a storm of reads may not do, and a done task's branch with a live preview (live preview phase 2's proof, Q2 to
 * Q4), against the real test database (ADR-0094). The site's answers are replaced: they leave hq.
 *
 * - *Live preview*'s reads answer from hq's own rows, and ask the site nothing they can answer without it.
 * - Telling HQ a live preview is in use counts at most once per person and live preview in 30 seconds.
 * - Starting a live preview on a branch whose copy was removed makes one, as a run would.
 * - A done task's copy stays while a live preview runs from it, and goes once it stops.
 */
import { withFeature } from '../../test/withFeature'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePreviewSummary } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createTestTask, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../test/factories'

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
vi.mock('../../relays', () => ({
  livePreviewsHaveAnAddress: () => true,
  NO_PREVIEW_ADDRESS_MESSAGE: 'Live previews need a domain. Nothing was changed.',
  appAddress: (id: string) => `https://${id}.preview.example`,
  appTickets: { revoke: vi.fn() },
  onAppsCutOff: vi.fn(), onBundleReport: vi.fn(), bundleRelayFor: vi.fn(async () => null), carryBundle: vi.fn(),
  liveAppEntryDeps: vi.fn(), openLiveApp: vi.fn(),
}))
const workspaceRow = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))
vi.mock('../../storage/workspaceStore', async () => {
  const actual = await vi.importActual<object>('../../storage/workspaceStore')
  return { ...actual, getWorkspace: vi.fn(async (id: string) => (workspaceRow.current?.id === id ? workspaceRow.current : null)) }
})
const branchCalls = vi.hoisted(() => ({ list: [] as string[] }))
vi.mock('../../branches/siteCalls', () => ({
  siteCall: vi.fn(async (_s: string, method: string) => {
    branchCalls.list.push(method)
    if (method === 'branch.list') {
      await new Promise(r => setTimeout(r, 20))
      return { main: { name: 'main', head: 'a'.repeat(40), versions: 1 }, branches: [], overflow: false }
    }
    if (method === 'branch.copy') return { head: 'b'.repeat(40) }
    if (method === 'branch.removeCopy') return { removed: true }
    throw new Error(`no answer for ${method}`)
  }),
  timeoutOf: () => 1000,
}))
const site = vi.hoisted(() => ({
  calls: [] as { siteId: string; method: string; params: Record<string, unknown> }[],
  gate: null as null | Promise<void>,
  silent: false,
  failedOpen: false,
  refuse: null as null | string,
}))
vi.mock('../siteAsk', async () => {
  const actual = await vi.importActual<typeof import('../siteAsk')>('../siteAsk')
  return {
    ...actual,
    askSite: vi.fn(async (siteId: string, method: string, params: Record<string, unknown>) => {
      site.calls.push({ siteId, method, params })
      if (method === 'livePreview.open') {
        if (site.refuse) return { ok: false, refusal: { code: site.refuse } }
        if (site.gate) await site.gate
        if (site.silent) throw new actual.SiteSilent(siteId, true)
        const summary: LivePreviewSummary = {
          livePreviewId: params.livePreviewId as string, projectId: params.projectId as string | null, personId: params.personId as string,
          workspaceId: (params.workspace as { workspaceId: string }).workspaceId, branch: params.branch as string, onMain: params.onMain as boolean,
          copy: params.copy as LivePreviewSummary['copy'], head: null, openedAt: new Date().toISOString(),
          state: site.failedOpen
            ? { state: 'stopped', since: new Date().toISOString(), reason: 'failed', signal: null, detail: 'docker said: no such image' }
            : { state: 'running', since: new Date().toISOString() },
        }
        return { ok: true, livePreview: summary }
      }
      if (method === 'livePreview.stop') return { ok: true, stopped: true, pendingBack: false }
      if (method === 'site.livePreviews') return { ok: true }
      throw new Error(`no answer for ${method}`)
    }),
  }
})

import { startLivePreview } from '../opening'
import { stopLivePreview } from '../stopping'
import { __resetGitOnForTests, getLivePreviewPlaces } from '../places'
import { __resetInUseForTests, markLivePreviewInUse } from '../personActions'
import { getWorkspace } from '../../storage/workspaceStore'
import { removeCopiesOfFinishedWork } from '../../branches/copies'

let member: { id: string }
let projectId: string
let workspaceId: string
let branchId: string
let taskId: string
let executionSiteId: string
let n = 0

const callsOf = (method: string) => site.calls.filter(c => c.method === method)
const branchCallsOf = (method: string) => branchCalls.list.filter(m => m === method)

beforeEach(async () => {
  site.calls.length = 0
  branchCalls.list.length = 0
  site.gate = null
  site.silent = false
  site.failedOpen = false
  site.refuse = null
  __resetGitOnForTests()
  __resetInUseForTests()
  const s = await ensureExecutionSite()
  executionSiteId = s.id
  await prisma.executionSite.update({ where: { id: s.id }, data: { livePreviewsAllowed: true, livePreviewLimit: null } })
  await prisma.livePreviewGuardReport.upsert({ where: { executionSiteId: s.id }, create: { executionSiteId: s.id, at: new Date() }, update: { at: new Date() } })
  member = await createUserWithRole('MEMBER')
  const project = await createProject({ name: 'Shop', slug: `shop-sturdy-${++n}` })
  projectId = project.id
  await joinProjectAs(projectId, member.id, 'MEMBER')
  workspaceId = `ws-sturdy-${n}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: s.id } })
  workspaceRow.current = { id: workspaceId, name: 'shop-app', ownerType: 'project', ownerId: projectId, siteId: s.siteId, allowedTools: null }
  const task = await createTestTask({ data: { projectId, title: 'Add a free delivery banner', number: n, state: 'DONE', onBehalfOfUserId: member.id } })
  taskId = task.id
  const branch = await prisma.workspaceBranch.create({
    data: { workspaceId, ownerType: 'project', ownerId: projectId, name: 'add-free-delivery-banner', userId: member.id, taskId },
  })
  branchId = branch.id
})

const readyCopy = () => prisma.branchCopy.create({ data: { branchId, siteId: executionSiteId, folderId: `copy-sturdy-${n}`, state: 'READY' } })

withFeature('livePreview', () => {
describe("Live preview's reads @SC-1700", () => {
  it("a branch's reads ask the site nothing, however many come at once", async () => {
    await readyCopy()
    await Promise.all(Array.from({ length: 50 }, () => getLivePreviewPlaces(member.id, workspaceId, branchId)))
    expect(branchCalls.list).toEqual([])
  })

  it("main's reads ask the site nothing once hq holds a branch of the workspace", async () => {
    const places = await getLivePreviewPlaces(member.id, workspaceId, null)
    expect(places.needsGit).toBe(false)
    expect(branchCalls.list).toEqual([])
  })

  it("main's reads of a workspace hq holds nothing of share one question to the site", async () => {
    await prisma.workspaceBranch.deleteMany({ where: { workspaceId } })
    await Promise.all(Array.from({ length: 50 }, () => getLivePreviewPlaces(member.id, workspaceId, null)))
    expect(branchCallsOf('branch.list')).toHaveLength(1)
  })
})
})

withFeature('livePreview', () => {
describe('telling HQ a live preview is in use @SC-1699', () => {
  it('counts once per person in 30 seconds, and reads nothing for the repeats', async () => {
    await readyCopy()
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    vi.mocked(getWorkspace).mockClear()
    const t0 = Date.now()
    await markLivePreviewInUse(member.id, view.livePreviewId, t0)
    const checks = vi.mocked(getWorkspace).mock.calls.length
    expect(checks).toBeGreaterThan(0)
    for (let i = 1; i < 100; i++) await markLivePreviewInUse(member.id, view.livePreviewId, t0 + i)
    expect(vi.mocked(getWorkspace)).toHaveBeenCalledTimes(checks)
    await markLivePreviewInUse(member.id, view.livePreviewId, t0 + 30_000)
    expect(vi.mocked(getWorkspace)).toHaveBeenCalledTimes(checks * 2)
    expect((await prisma.livePreview.findUniqueOrThrow({ where: { id: view.livePreviewId } })).lastUsedAt.getTime()).toBe(t0 + 30_000)
  })
})
})

withFeature('livePreview', () => {
describe("a done task's branch @SC-1695", () => {
  it('with no copy gets one when its live preview starts, made as a run makes one', async () => {
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    expect(view.state).toBe('running')
    expect(branchCallsOf('branch.copy')).toHaveLength(1)
    const copy = await prisma.branchCopy.findFirstOrThrow({ where: { branchId, state: 'READY' } })
    expect(callsOf('livePreview.open')[0]!.params.copy).toEqual({ kind: 'branch', copyId: copy.folderId })
  })

  it('keeps its copy while the live preview runs, and loses it once the live preview stops', async () => {
    await readyCopy()
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    await removeCopiesOfFinishedWork(branchId)
    expect(await prisma.branchCopy.count({ where: { branchId, state: 'READY' } })).toBe(1)
    await stopLivePreview(member.id, view.livePreviewId)
    expect(await prisma.branchCopy.count({ where: { branchId, state: 'READY' } })).toBe(0)
    expect(branchCallsOf('branch.removeCopy')).toHaveLength(1)
  })

  it('of a task not done keeps its copy after its live preview stops', async () => {
    await prisma.task.update({ where: { id: taskId }, data: { state: 'IN_PROGRESS' } })
    await readyCopy()
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    await stopLivePreview(member.id, view.livePreviewId)
    expect(await prisma.branchCopy.count({ where: { branchId, state: 'READY' } })).toBe(1)
  })

  it("whose copy its site no longer holds lets hq's row of it go, so starting again makes a fresh one", async () => {
    await readyCopy()
    site.refuse = 'noCopy'
    await expect(startLivePreview(member.id, { workspaceId, branchId })).rejects.toThrow('Start the live preview again')
    site.refuse = null
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    expect(view.state).toBe('running')
    expect(branchCallsOf('branch.copy')).toHaveLength(1)
  })
})
})
