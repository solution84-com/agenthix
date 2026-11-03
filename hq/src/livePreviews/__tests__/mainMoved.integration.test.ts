/**
 * Live previews and `main`, against the real test database (ADR-0094): `main` moving brings `main`'s live preview and
 * every live preview's own copy on another site to its new tip; a merge first brings back the commits a live preview
 * on another site holds, keeping how far it got when it cannot; a site whose guard has gone quiet starts none; and on
 * an installation with no address for live apps, a start is refused while merging works. The sites' answers are
 * replaced: they leave hq.
 */
import { withFeature } from '../../test/withFeature'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GUARD_REPORT_STALE_MS } from '@agenthix/core'
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
vi.mock('../../storage/repoAttachmentService', () => ({ getAttachment: vi.fn(async () => null) }))
vi.mock('../../sites/channel', () => ({
  siteChannelRegistry: { isOnline: () => true, request: vi.fn() },
  ChannelRequestFailed: class extends Error { constructor(m: string, readonly code: string) { super(m) } },
}))
const address = vi.hoisted(() => ({ has: true }))
vi.mock('../../relays', () => ({
  livePreviewsHaveAnAddress: () => address.has,
  NO_PREVIEW_ADDRESS_MESSAGE: 'Live previews need a domain. Nothing was changed.',
  appAddress: (id: string) => `https://${id}.preview.example`,
  appTickets: { revoke: vi.fn() },
  onAppsCutOff: vi.fn(), onBundleReport: vi.fn(), bundleRelayFor: vi.fn(async () => null), carryBundle: vi.fn(),
  liveAppEntryDeps: vi.fn(), openLiveApp: vi.fn(),
}))
vi.mock('../../branches/workspaceEvents', async () => {
  const actual = await vi.importActual<object>('../../branches/workspaceEvents')
  return { ...actual, emitBranchChange: vi.fn(), emitMainChange: vi.fn() }
})
const workspaceRow = vi.hoisted(() => ({ current: null as null | Record<string, unknown> }))
vi.mock('../../storage/workspaceStore', async () => {
  const actual = await vi.importActual<object>('../../storage/workspaceStore')
  return { ...actual, getWorkspace: vi.fn(async (id: string) => (workspaceRow.current?.id === id ? workspaceRow.current : null)) }
})

const MAIN = 'a'.repeat(40)
const NEW_MAIN = 'f'.repeat(40)
const TIP = 'b'.repeat(40)
const BACK = 'd'.repeat(40)

/** Every call that leaves hq, in order: to a site, and bundles carried between sites. */
const out = vi.hoisted(() => ({
  calls: [] as { kind: string; siteId: string; params: Record<string, unknown> }[],
  carryFails: false,
  mainHead: '',
}))
vi.mock('../../branches/siteCalls', () => ({
  siteCall: vi.fn(async (siteId: string, method: string, params: Record<string, unknown>) => {
    out.calls.push({ kind: method, siteId, params })
    if (method === 'branch.list') {
      return { main: { name: 'main', head: out.mainHead, versions: 2 }, branches: [{ name: 'add-login-page', head: TIP, ahead: 1, behind: 0, lastCommit: null }], overflow: false }
    }
    if (method === 'git.merge') return { merged: true, version: { number: 3, commit: NEW_MAIN }, mergedCommit: BACK }
    throw new Error(`no answer for ${method}`)
  }),
  timeoutOf: () => 1000,
}))
vi.mock('../bundles', async () => {
  const actual = await vi.importActual<typeof import('../bundles')>('../bundles')
  return {
    ...actual,
    carryBundle: vi.fn(async (a: { direction: string; from: { siteId: string }; to: { siteId: string }; source: unknown }) => {
      out.calls.push({ kind: `carry:${a.direction}`, siteId: a.to.siteId, params: { from: a.from.siteId, source: a.source } })
      if (out.carryFails) throw new Error('the relay is down')
      return { carried: true, bundleId: `bundle-${out.calls.length}`, head: a.direction === 'back' ? BACK : NEW_MAIN }
    }),
    dropBundle: vi.fn(),
  }
})
vi.mock('../siteAsk', async () => {
  const actual = await vi.importActual<typeof import('../siteAsk')>('../siteAsk')
  return {
    ...actual,
    askSite: vi.fn(async (siteId: string, method: string, params: Record<string, unknown>) => {
      out.calls.push({ kind: method, siteId, params })
      if (method === 'livePreview.refresh') return { ok: true, head: params.head }
      if (method === 'branch.bringBackBundle') return { brought: true, back: { moved: true, head: BACK } }
      throw new Error(`no answer for ${method}`)
    }),
  }
})

import { mainMoved } from '../branchHooks'
import { startLivePreview } from '../opening'
import { getLivePreviewPlaces } from '../places'
import { mergeBranchAction } from '../../branches/operations'
import { __resetBackForTests } from '../back'

let member: { id: string }
let projectId: string
let workspaceId: string
let branchId: string
let home: { id: string; siteId: string }
let lab: { id: string; siteId: string }
let n = 0

const kinds = () => out.calls.map(c => c.kind)
const callsOf = (kind: string) => out.calls.filter(c => c.kind === kind)

async function preview(over: Record<string, unknown>) {
  return prisma.livePreview.create({
    data: {
      executionSiteId: home.id, projectId, workspaceId, ownerType: 'project', ownerId: projectId, branch: 'main', onMain: true,
      copyKind: 'MAIN', copyId: `copy-${Math.random()}`, userId: member.id, state: 'RUNNING', headCommit: MAIN, ...over,
    },
  })
}

const onLab = () => ({ executionSiteId: lab.id, branchId, branch: 'add-login-page', onMain: false, copyKind: 'BUNDLE' as const, headCommit: TIP })

beforeEach(async () => {
  out.calls.length = 0
  out.carryFails = false
  out.mainHead = NEW_MAIN
  address.has = true
  __resetBackForTests()
  home = await ensureExecutionSite()
  lab = await prisma.executionSite.create({
    data: { siteId: `lab-${Date.now()}-${++n}`, label: 'lab', status: 'ONLINE', isDefault: false, livePreviewsAllowed: true },
  })
  await prisma.executionSite.update({ where: { id: home.id }, data: { livePreviewsAllowed: true, livePreviewLimit: null } })
  for (const s of [home, lab]) {
    await prisma.livePreviewGuardReport.upsert({ where: { executionSiteId: s.id }, create: { executionSiteId: s.id, at: new Date() }, update: { at: new Date() } })
  }
  member = await createUserWithRole('MEMBER')
  const project = await createProject({ name: 'Shop', slug: `shop-main-${++n}` })
  projectId = project.id
  await joinProjectAs(projectId, member.id, 'MEMBER')
  workspaceId = `ws-main-${n}`
  await prisma.workspacePlacement.create({ data: { workspaceId, siteId: home.id } })
  workspaceRow.current = { id: workspaceId, name: 'shop-app', ownerType: 'project', ownerId: projectId, siteId: home.siteId, allowedTools: null }
  const branch = await prisma.workspaceBranch.create({ data: { workspaceId, ownerType: 'project', ownerId: projectId, name: 'add-login-page', userId: member.id } })
  branchId = branch.id
})

withFeature('livePreview', () => {
describe('main moving @SC-1718', () => {
  it("brings main's live preview to main's new tip and keeps it; a branch's on another site gets main sent first", async () => {
    const onMain = await preview({})
    const onBranch = await preview(onLab())
    const stopped = await preview({ state: 'STOPPED' })
    await mainMoved(workspaceId)

    const refreshed = callsOf('livePreview.refresh')
    expect(refreshed.map(c => [c.siteId, c.params.livePreviewId])).toEqual(expect.arrayContaining([
      [home.siteId, onMain.id], [lab.siteId, onBranch.id],
    ]))
    expect(refreshed).toHaveLength(2)
    expect(refreshed.every(c => c.params.head === NEW_MAIN)).toBe(true)
    expect(refreshed.find(c => c.params.livePreviewId === onMain.id)!.params.bundleId).toBeNull()
    const carried = callsOf('carry:toPreview')
    expect(carried).toEqual([{ kind: 'carry:toPreview', siteId: lab.siteId, params: { from: home.siteId, source: expect.objectContaining({ kind: 'main' }) } }])
    // main's bundle lands before the site is told to refresh from it.
    expect(kinds().indexOf('carry:toPreview')).toBeLessThan(out.calls.findIndex(c => c.params.livePreviewId === onBranch.id))

    expect((await prisma.livePreview.findUniqueOrThrow({ where: { id: onMain.id } })).headCommit).toBe(NEW_MAIN)
    expect((await prisma.livePreview.findUniqueOrThrow({ where: { id: onBranch.id } })).headCommit).toBe(TIP)
    expect((await prisma.livePreview.findUniqueOrThrow({ where: { id: stopped.id } })).headCommit).toBe(MAIN)
  })
})
})

withFeature('livePreview', () => {
describe('merging a branch whose live preview runs on another site @SC-1718', () => {
  const merge = () => mergeBranchAction({ branchId, message: 'Add a login page', expectedMain: MAIN }, { user: member })

  it('brings its commits back first, then merges, and keeps nothing pending', async () => {
    const lp = await preview(onLab())
    const result = await merge()
    expect(result).toMatchObject({ outcome: 'merged', versionNumber: 3 })
    const order = kinds()
    expect(order.indexOf('carry:back')).toBeGreaterThanOrEqual(0)
    expect(order.indexOf('branch.bringBackBundle')).toBeGreaterThan(order.indexOf('carry:back'))
    expect(order.indexOf('git.merge')).toBeGreaterThan(order.indexOf('branch.bringBackBundle'))
    expect(callsOf('carry:back')[0]).toMatchObject({ siteId: home.siteId, params: { from: lab.siteId } })
    expect((await prisma.livePreview.findUniqueOrThrow({ where: { id: lp.id } })).pendingBack).toBeNull()
  })

  it("is refused when they cannot come back, merges nothing, and keeps how far it got for the next try", async () => {
    const lp = await preview(onLab())
    out.carryFails = true
    await expect(merge()).rejects.toMatchObject({ statusCode: 503 })
    expect(callsOf('git.merge')).toHaveLength(0)
    const pending = (await prisma.livePreview.findUniqueOrThrow({ where: { id: lp.id } })).pendingBack as Record<string, unknown> | null
    expect(pending).toMatchObject({ step: 'make', detail: 'the relay is down' })
    const branch = await prisma.workspaceBranch.findUniqueOrThrow({ where: { id: branchId } })
    expect(branch.lastMergedCommit).toBeNull()
  })

  it('brings nothing back for a live preview on the workspace\'s own site', async () => {
    await preview({ branchId, branch: 'add-login-page', onMain: false, copyKind: 'BRANCH' })
    await merge()
    expect(callsOf('carry:back')).toHaveLength(0)
    expect(callsOf('git.merge')).toHaveLength(1)
  })
})
})

withFeature('livePreview', () => {
describe("a site whose guard has gone quiet @SC-1748", () => {
  it('starts no live preview there, says why on Live preview, and asks it nothing', async () => {
    const stale = new Date(Date.now() - GUARD_REPORT_STALE_MS - 1_000)
    for (const s of [home, lab]) await prisma.livePreviewGuardReport.update({ where: { executionSiteId: s.id }, data: { at: stale } })
    const places = await getLivePreviewPlaces(member.id, workspaceId, null)
    expect(places.picked).toBeNull()
    expect(places.others.find(o => o.executionSiteId === home.id)?.blocked).toMatch(/guard hasn't reported in the last minute/)
    await expect(startLivePreview(member.id, { workspaceId, branchId: null })).rejects.toMatchObject({ statusCode: 409 })
    expect(callsOf('livePreview.open')).toHaveLength(0)
    expect(await prisma.livePreview.count({ where: { workspaceId } })).toBe(0)
  })
})
})

withFeature('livePreview', () => {
describe('an installation with no address for live apps @SC-1719', () => {
  it('refuses a live preview in words and makes no row, while a merge goes in', async () => {
    address.has = false
    await expect(startLivePreview(member.id, { workspaceId, branchId })).rejects.toMatchObject({ statusCode: 409, message: 'Live previews need a domain. Nothing was changed.' })
    expect(await prisma.livePreview.count({ where: { workspaceId } })).toBe(0)
    expect(await mergeBranchAction({ branchId, message: 'Add a login page', expectedMain: MAIN }, { user: member })).toMatchObject({ outcome: 'merged' })
  })
})
})
