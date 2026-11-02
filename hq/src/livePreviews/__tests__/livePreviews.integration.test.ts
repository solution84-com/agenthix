/**
 * Live previews against the real test database (ADR-0094): who may open one, one per branch, the site picked, a full
 * site, two opens at once, a stop racing a start, a site going silent mid-start, who may stop one, the idle stop, and
 * the Fleet Console turning live previews off on a site. The site's answers are replaced: they leave hq.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { LivePreviewSummary } from '@agenthix/core'
import { prisma } from '../../test/db'
import { createProject, createUserWithRole, ensureExecutionSite, joinProjectAs } from '../../test/factories'

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
vi.mock('../../branches/siteCalls', () => ({
  siteCall: vi.fn(async (_s: string, method: string) => {
    if (method === 'branch.list') return { main: { name: 'main', head: 'a'.repeat(40), versions: 1 }, branches: [], overflow: false }
    throw new Error(`no answer for ${method}`)
  }),
  timeoutOf: () => 1000,
}))
const site = vi.hoisted(() => ({
  calls: [] as { siteId: string; method: string; params: Record<string, unknown> }[],
  gate: null as null | Promise<void>,
  silent: false,
  failedOpen: false,
}))
vi.mock('../siteAsk', async () => {
  const actual = await vi.importActual<typeof import('../siteAsk')>('../siteAsk')
  return {
    ...actual,
    askSite: vi.fn(async (siteId: string, method: string, params: Record<string, unknown>) => {
      site.calls.push({ siteId, method, params })
      if (method === 'livePreview.open') {
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
import { sweepOnce } from '../reconcile'
import { setSiteLivePreviews } from '../fleet'
import { getLivePreviewPlaces } from '../places'
import { workspaceRemoved } from '../branchHooks'

let member: { id: string }
let other: { id: string }
let admin: { id: string }
let viewer: { id: string }
let projectId: string
let workspaceId: string
let branchId: string
let executionSiteId: string
let n = 0

const callsOf = (method: string) => site.calls.filter(c => c.method === method)

beforeEach(async () => {
  site.calls.length = 0
  site.gate = null
  site.silent = false
  site.failedOpen = false
  const s = await ensureExecutionSite()
  executionSiteId = s.id
  await prisma.executionSite.update({ where: { id: s.id }, data: { livePreviewsAllowed: true, livePreviewLimit: null } })
  await prisma.livePreviewGuardReport.upsert({ where: { executionSiteId: s.id }, create: { executionSiteId: s.id, at: new Date() }, update: { at: new Date() } })
  ;[member, other, admin, viewer] = await Promise.all([1, 2, 3, 4].map(() => createUserWithRole('MEMBER')))
  const project = await createProject({ name: 'Shop', slug: `shop-${++n}` })
  projectId = project.id
  await joinProjectAs(projectId, member.id, 'MEMBER')
  await joinProjectAs(projectId, other.id, 'MEMBER')
  await joinProjectAs(projectId, admin.id, 'ADMIN')
  await joinProjectAs(projectId, viewer.id, 'VIEWER')
  workspaceId = `ws-${n}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: s.id } })
  workspaceRow.current = { id: workspaceId, name: 'shop-app', ownerType: 'project', ownerId: projectId, siteId: s.siteId, allowedTools: null }
  const branch = await prisma.workspaceBranch.create({ data: { workspaceId, ownerType: 'project', ownerId: projectId, name: 'add-login-page', userId: member.id } })
  branchId = branch.id
  await prisma.branchCopy.create({ data: { branchId, siteId: s.id, folderId: `copy-${n}`, state: 'READY' } })
})

describe('opening a live preview @SC-1694', () => {
  it('opens one on the branch, binding its own copy, on the workspace\'s site', async () => {
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    expect(view).toMatchObject({ state: 'running', branch: 'add-login-page', yours: true, mayStop: true })
    expect(callsOf('livePreview.open')[0]!.params.copy).toEqual({ kind: 'branch', copyId: `copy-${n}` })
    expect(await prisma.livePreview.findFirstOrThrow({ where: { branchId } })).toMatchObject({ state: 'RUNNING', copyKind: 'BRANCH', executionSiteId })
  })

  it('refuses a Viewer, and starts nothing', async () => {
    await expect(startLivePreview(viewer.id, { workspaceId, branchId })).rejects.toMatchObject({ statusCode: 403 })
    expect(callsOf('livePreview.open')).toHaveLength(0)
  })

  it('answers a second person with the same live preview', async () => {
    const first = await startLivePreview(member.id, { workspaceId, branchId })
    const second = await startLivePreview(other.id, { workspaceId, branchId })
    expect(second.livePreviewId).toBe(first.livePreviewId)
    expect(second.yours).toBe(false)
    expect(callsOf('livePreview.open')).toHaveLength(1)
  })

  it('makes one live preview of two opens at once', async () => {
    let release!: () => void
    site.gate = new Promise(r => { release = r })
    const both = Promise.all([startLivePreview(member.id, { workspaceId, branchId }), startLivePreview(other.id, { workspaceId, branchId })])
    await new Promise(r => setTimeout(r, 50))
    release()
    const [a, b] = await both
    expect(a.livePreviewId).toBe(b.livePreviewId)
    expect(await prisma.livePreview.count({ where: { branchId } })).toBe(1)
    expect(callsOf('livePreview.open')).toHaveLength(1)
  })

  it('refuses on a full site, and names the limit', async () => {
    await prisma.executionSite.update({ where: { id: executionSiteId }, data: { livePreviewLimit: 1 } })
    await startLivePreview(member.id, { workspaceId, branchId: null })
    await expect(startLivePreview(member.id, { workspaceId, branchId })).rejects.toMatchObject({ statusCode: 409, data: { code: 'full' } })
  })

  it('leaves nothing running when the site goes silent mid-start', async () => {
    site.silent = true
    await expect(startLivePreview(member.id, { workspaceId, branchId })).rejects.toMatchObject({ statusCode: 503 })
    expect(await prisma.livePreview.findFirstOrThrow({ where: { branchId } })).toMatchObject({ state: 'STOPPED', reason: 'failed' })
    // A fresh start is possible at once.
    site.silent = false
    expect((await startLivePreview(member.id, { workspaceId, branchId })).state).toBe('running')
  })

  it('fails a start the site answered as stopped, in HQ\'s words, and keeps why for the start panel', async () => {
    site.failedOpen = true
    const err = await startLivePreview(member.id, { workspaceId, branchId }).catch(e => e)
    expect(err).toMatchObject({ statusCode: 502 })
    expect(String(err.message)).not.toContain('docker said')
    const row = await prisma.livePreview.findFirstOrThrow({ where: { branchId } })
    expect(row).toMatchObject({ state: 'STOPPED', reason: 'failed' })
    expect(row.detail).not.toContain('docker said')
    const places = await getLivePreviewPlaces(member.id, workspaceId, branchId)
    expect(places.current).toBeNull()
    expect(places.lastStopped).toMatchObject({ reason: 'failed', detail: row.detail })
  })

  it('stops on the site too when a stop lands while the site is still opening it', async () => {
    let release!: () => void
    site.gate = new Promise(r => { release = r })
    const opening = startLivePreview(member.id, { workspaceId, branchId })
    await new Promise(r => setTimeout(r, 50))
    const row = await prisma.livePreview.findFirstOrThrow({ where: { branchId } })
    expect(await stopLivePreview(member.id, row.id)).toEqual({ stopped: true })
    release()
    await opening
    expect((await prisma.livePreview.findUniqueOrThrow({ where: { id: row.id } })).state).toBe('STOPPED')
    expect(callsOf('livePreview.stop').length).toBeGreaterThanOrEqual(2)
  })
})

describe('stopping a live preview', () => {
  it('lets its starter and a project Admin stop it, and nobody else @SC-1698', async () => {
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    await expect(stopLivePreview(other.id, view.livePreviewId)).rejects.toMatchObject({ statusCode: 403 })
    expect(await stopLivePreview(admin.id, view.livePreviewId)).toEqual({ stopped: true })
    expect(await prisma.livePreview.findUniqueOrThrow({ where: { id: view.livePreviewId } })).toMatchObject({ state: 'STOPPED', reason: 'projectAdmin' })
  })

  it('stops one unused for the site\'s idle time @SC-1699', async () => {
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    await prisma.livePreview.update({ where: { id: view.livePreviewId }, data: { lastUsedAt: new Date(Date.now() - 3 * 60 * 60_000) } })
    expect(await sweepOnce()).toBe(1)
    expect(await prisma.livePreview.findUniqueOrThrow({ where: { id: view.livePreviewId } })).toMatchObject({ state: 'STOPPED', reason: 'idle' })
  })

  it('stops every live preview on a site a fleet admin turns them off on @SC-1714', async () => {
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    await prisma.user.update({ where: { id: admin.id }, data: { fleetAdmin: true } })
    const done = await setSiteLivePreviews({ byUserId: admin.id, executionSiteId, allowed: false, limit: null, idleMinutes: 120 })
    expect(done.stopped).toEqual([view.livePreviewId])
    expect(done.view.allowed).toBe(false)
    await expect(startLivePreview(member.id, { workspaceId, branchId })).rejects.toMatchObject({ statusCode: 409, data: { code: 'noSite' } })
  })
})

describe('removing a workspace @SC-1714', () => {
  it('tells every other site that ran one of its live previews, and not its own site', async () => {
    const away = await prisma.executionSite.create({
      data: { siteId: `away-${n}`, label: 'preview-box', status: 'ONLINE', credentialHash: 'e'.repeat(64), credentialPrefix: 'smc_away', isDefault: false },
    })
    const row = { projectId, workspaceId, ownerType: 'project' as const, ownerId: projectId, branchId, branch: 'add-login-page', copyKind: 'BUNDLE' as const, userId: member.id, state: 'STOPPED' as const }
    await prisma.livePreview.create({ data: { ...row, executionSiteId: away.id, copyId: 'c-away' } })
    await prisma.livePreview.create({ data: { ...row, executionSiteId: away.id, copyId: 'c-away-2' } })
    await prisma.livePreview.create({ data: { ...row, executionSiteId, copyId: 'c-home', copyKind: 'BRANCH' } })
    const told: string[] = []
    await workspaceRemoved(workspaceId, { deleteAt: async (siteId: string) => { told.push(siteId) } })
    expect(told).toEqual([`away-${n}`])
  })
})
