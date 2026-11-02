/**
 * A person's hand on a live preview's apps, against the real test database (ADR-0094): a person's start opens with the
 * branch's app, *Start* offers the branch's own apps (on `main`, each name once), and *Stop* and *Restart* act on one
 * app of the live preview as the person, for a Member or Admin only. The site's answers are replaced: they leave hq.
 */
import { withFeature } from '../../test/withFeature'
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
      const now = new Date().toISOString()
      if (method === 'livePreview.appStart') {
        const app = params.app as { appId: string; name: string; folder: string; command: string; port: number }
        return { ok: true, result: { app: { ...app, livePreviewId: params.livePreviewId, state: 'starting', since: now, lastLines: [], detail: null } } }
      }
      if (method === 'livePreview.appStop') {
        return { ok: true, result: { app: { appId: params.appId, livePreviewId: params.livePreviewId, state: 'stopped', since: now, lastLines: [], detail: null } } }
      }
      if (method === 'site.livePreviews') return { ok: true }
      throw new Error(`no answer for ${method}`)
    }),
  }
})

import { startLivePreview } from '../opening'
import { restartLiveApp, stopLiveApp } from '../personApps'
import { startableApps } from '../knownApps'

let member: { id: string }
let viewer: { id: string }
let projectId: string
let workspaceId: string
let branchId: string
let n = 0

const callsOf = (method: string) => site.calls.filter(c => c.method === method)

async function knownApp(branch: string, name: string, startedAt: Date, over: Record<string, unknown> = {}) {
  const app = await prisma.liveApp.create({ data: { id: `app-${name}-${branch}-${n}`, workspaceId, branch, name, folder: 'web', command: 'npm run dev', port: 3000, ...over } })
  await prisma.liveAppRun.create({ data: { appId: app.id, livePreviewId: 'an-earlier-one', userId: member.id, startedAt } })
  return app
}

beforeEach(async () => {
  site.calls.length = 0
  site.gate = null
  site.silent = false
  site.failedOpen = false
  const s = await ensureExecutionSite()
  await prisma.executionSite.update({ where: { id: s.id }, data: { livePreviewsAllowed: true, livePreviewLimit: null } })
  await prisma.livePreviewGuardReport.upsert({ where: { executionSiteId: s.id }, create: { executionSiteId: s.id, at: new Date() }, update: { at: new Date() } })
  ;[member, viewer] = await Promise.all([1, 2].map(() => createUserWithRole('MEMBER')))
  const project = await createProject({ name: 'Shop', slug: `shop-apps-${++n}` })
  projectId = project.id
  await joinProjectAs(projectId, member.id, 'MEMBER')
  await joinProjectAs(projectId, viewer.id, 'VIEWER')
  workspaceId = `ws-apps-${n}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: s.id } })
  workspaceRow.current = { id: workspaceId, name: 'shop-app', ownerType: 'project', ownerId: projectId, siteId: s.siteId, allowedTools: null }
  const branch = await prisma.workspaceBranch.create({ data: { workspaceId, ownerType: 'project', ownerId: projectId, name: 'free-delivery', userId: member.id } })
  branchId = branch.id
  await prisma.branchCopy.create({ data: { branchId, siteId: s.id, folderId: `copy-apps-${n}`, state: 'READY' } })
})

withFeature('livePreview', () => {
describe("a person's start opens with the branch's app @SC-1703", () => {
  it('starts the app started last on the branch, as the person, so it shows', async () => {
    await knownApp('free-delivery', 'shop', new Date('2026-11-02T07:00:00Z'))
    await knownApp('other-branch', 'admin', new Date('2026-11-02T08:00:00Z'), { port: 4000 })
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    expect(callsOf('livePreview.appStart')).toEqual([expect.objectContaining({
      params: expect.objectContaining({ livePreviewId: view.livePreviewId, personId: member.id, startedBy: null, app: expect.objectContaining({ name: 'shop', folder: 'web', command: 'npm run dev', port: 3000 }) }),
    })])
    expect(view.apps.find(a => a.name === 'shop')?.state).toBe('starting')
  })

  it('starts nothing on a branch where no app ran', async () => {
    await knownApp('other-branch', 'shop', new Date('2026-11-02T08:00:00Z'))
    await startLivePreview(member.id, { workspaceId, branchId })
    expect(callsOf('livePreview.appStart')).toEqual([])
  })
})
})

withFeature('livePreview', () => {
describe('the apps Start offers @SC-1703', () => {
  it("on a branch only its own; on main each name once, the latest, with no second name for one app", async () => {
    await knownApp('free-delivery', 'shop', new Date('2026-11-02T07:00:00Z'))
    await knownApp('other-branch', 'web', new Date('2026-11-01T07:00:00Z'))
    await knownApp('other-branch', 'shop', new Date('2026-11-02T09:00:00Z'), { command: 'npm start' })
    const branchRow = { id: 'lp-x', workspaceId, branch: 'free-delivery', onMain: false }
    expect((await startableApps(branchRow)).map(a => a.name)).toEqual(['shop'])
    const mainRow = { id: 'lp-m', workspaceId, branch: 'main', onMain: true }
    expect(await startableApps(mainRow)).toEqual([{ name: 'shop', folder: 'web', command: 'npm start', port: 3000, fromBranch: 'other-branch' }])
  })
})
})

withFeature('livePreview', () => {
describe('Stop and Restart from the strip @SC-1703', () => {
  it('stops and restarts an app of this live preview as the person, keeping the live preview', async () => {
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    const app = await knownApp('free-delivery', 'shop', new Date())
    await stopLiveApp(member.id, view.livePreviewId, app.id)
    expect(callsOf('livePreview.appStop')).toEqual([expect.objectContaining({ params: { livePreviewId: view.livePreviewId, personId: member.id, appId: app.id } })])
    expect(await prisma.liveApp.findUniqueOrThrow({ where: { id: app.id } })).toMatchObject({ state: 'stopped' })
    expect(await restartLiveApp(member.id, view.livePreviewId, app.id)).toEqual({ appId: app.id })
    expect(await prisma.liveApp.findUniqueOrThrow({ where: { id: app.id } })).toMatchObject({ state: 'starting', livePreviewId: view.livePreviewId })
    expect(await prisma.livePreview.findUniqueOrThrow({ where: { id: view.livePreviewId } })).toMatchObject({ state: 'RUNNING' })
  })

  it("refuses a Viewer, and an app of another branch, asking the site nothing", async () => {
    const view = await startLivePreview(member.id, { workspaceId, branchId })
    const mine = await knownApp('free-delivery', 'shop', new Date())
    const theirs = await knownApp('other-branch', 'api', new Date(), { port: 4000 })
    site.calls.length = 0
    await expect(stopLiveApp(viewer.id, view.livePreviewId, mine.id)).rejects.toMatchObject({ statusCode: 403 })
    await expect(restartLiveApp(member.id, view.livePreviewId, theirs.id)).rejects.toMatchObject({ statusCode: 404 })
    expect(site.calls).toEqual([])
  })
})
})
