/**
 * Which live preview a run's app tool acts on (live preview phase 2's proof, Q9): hq reads it from its own rows at the
 * call, so a run whose live preview started after its capability was signed has its app tools, and a run without one
 * is told to have the person open it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({
  livePreview: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  executionSite: { findUnique: vi.fn() },
  agent: { findUnique: vi.fn() },
  liveApp: {} as Record<string, unknown>,
}))
vi.mock('wasp/server', () => ({ prisma: db, HttpError: class extends Error { constructor(readonly statusCode: number, m?: string) { super(m) } } }))
const mocks = vi.hoisted(() => ({ getRun: vi.fn(), branchOfSession: vi.fn(), emitReload: vi.fn() }))
vi.mock('../../sessions/siteRuntimeStore', () => ({ getRun: mocks.getRun }))
vi.mock('../../branches/branchRows', () => ({ branchOfSession: mocks.branchOfSession }))
vi.mock('../../server/controlplane/runOnBehalfOf', () => ({ personOfRun: vi.fn(async () => 'person-1') }))
vi.mock('../socket', () => ({ emitLivePreviewReload: mocks.emitReload, emitLivePreviewAuto: vi.fn(), emitLivePreviewChange: vi.fn() }))
vi.mock('../../relays', () => ({ appAddress: (id: string) => `https://p-${id}.preview.test` }))
const site = vi.hoisted(() => ({ askSite: vi.fn(), open: vi.fn() }))
vi.mock('../siteAsk', () => ({ askSite: site.askSite, SiteFailed: class extends Error {}, SiteSilent: class extends Error {} }))
vi.mock('../questions', () => ({ servicesOf: () => [] }))
vi.mock('../runOpening', () => ({ openLivePreviewForRun: site.open }))
vi.mock('../appStore', () => ({
  APPS_PER_BRANCH: 50,
  recordApp: vi.fn(async (_w: string, _b: string, spec: Record<string, unknown>) => ({ app: { id: 'app-1', ...spec, state: 'starting', since: new Date(0), lastLines: [], detail: null, livePreviewId: null }, created: true })),
  appNamed: vi.fn(), keepAppSeen: vi.fn(), readAppSeen: vi.fn(() => null), recordRunStart: vi.fn(),
}))

import { reloadViewOp, startAppOp } from '../appTools'
import { ControlPlaneError } from '../../server/controlplane/types'

const SITE = { id: 'es-1', siteId: 'site-1', label: 'box', status: 'ONLINE' }
const OTHER = { id: 'es-2', siteId: 'site-2', label: 'preview-box', status: 'ONLINE' }
const ROW = { id: 'lp-1', workspaceId: 'ws-1', branchId: 'b-1', branch: 'add-banner', executionSiteId: SITE.id, state: 'RUNNING', copyKind: 'BRANCH' }

function ctx(livePreview?: unknown) {
  return {
    kind: 'run' as const,
    claims: { sessionId: 'session-1', taskId: 'task-1', siteId: SITE.siteId, agentId: 'agent-1', ...(livePreview ? { livePreview } : {}) },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getRun.mockResolvedValue({ sessionId: 'session-1', taskId: 'task-1', status: 'RUNNING' })
  mocks.branchOfSession.mockResolvedValue({ id: 'b-1', workspaceId: 'ws-1' })
  db.livePreview.findFirst.mockResolvedValue(ROW)
  db.livePreview.updateMany.mockResolvedValue({ count: 1 })
  db.executionSite.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => (where.id === SITE.id ? SITE : where.id === OTHER.id ? OTHER : null))
  db.agent.findUnique.mockResolvedValue({ name: 'Kernel' })
  db.liveApp = { update: vi.fn(async ({ data }: { data: object }) => ({ id: 'app-1', name: 'web', state: 'starting', since: new Date(0), lastLines: [], detail: null, livePreviewId: null, ...data })), delete: vi.fn(async () => ({})) }
  site.askSite.mockResolvedValue({ ok: true, result: { app: null } })
})

describe('the live preview an app tool acts on @SC-1701', () => {
  it('is the run\'s branch\'s live preview on its site, even when the capability was signed before it started', async () => {
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).resolves.toMatchObject({ reloaded: true })
    expect(mocks.emitReload).toHaveBeenCalledWith(expect.objectContaining({ id: 'lp-1' }), 'Kernel')
  })

  it('is the one running now when the capability names one that has since stopped', async () => {
    db.livePreview.findFirst.mockResolvedValue({ ...ROW, id: 'lp-2' })
    await reloadViewOp(ctx({ livePreviewId: 'lp-1', workspaceId: 'ws-1', branch: 'add-banner' }), { runId: 'run-1' })
    expect(mocks.emitReload).toHaveBeenCalledWith(expect.objectContaining({ id: 'lp-2' }), 'Kernel')
  })

  it('is none when the branch has no live preview open: the refusal says to have the person open it', async () => {
    db.livePreview.findFirst.mockResolvedValue(null)
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).rejects.toThrow(/Ask the person to start one from Live preview.*Nothing was changed\./)
    expect(mocks.emitReload).not.toHaveBeenCalled()
  })

  it('is none when the run works on no branch', async () => {
    mocks.branchOfSession.mockResolvedValue(null)
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).rejects.toThrow(/no live preview open/)
  })

  it('is none when the branch\'s live preview runs on another site than the run, and says so', async () => {
    db.livePreview.findFirst.mockResolvedValue({ ...ROW, executionSiteId: OTHER.id, copyKind: 'BUNDLE' })
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).rejects.toThrow(/runs on another site.*Nothing was changed\./)
    expect(mocks.emitReload).not.toHaveBeenCalled()
  })

  it('is refused for a run that is not this one, before any live preview is read', async () => {
    mocks.getRun.mockResolvedValue({ sessionId: 'someone-else', taskId: 'task-1', status: 'RUNNING' })
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).rejects.toThrow(/not this one/)
    expect(db.livePreview.findFirst).not.toHaveBeenCalled()
  })
})

describe('start_app on a branch with no live preview open @SC-1702', () => {
  const START = { name: 'web', folder: '', command: 'npm start', port: '3000', runId: 'run-1' }

  it('opens the live preview first, then starts the app in it', async () => {
    db.livePreview.findFirst.mockResolvedValueOnce(null).mockResolvedValue(ROW)
    site.open.mockResolvedValue(undefined)
    await expect(startAppOp(ctx(), START)).resolves.toMatchObject({ address: 'https://p-app-1.preview.test' })
    expect(site.open).toHaveBeenCalledWith(expect.objectContaining({ sessionId: 'session-1', siteId: SITE.siteId }))
    expect(site.askSite).toHaveBeenCalledWith(SITE.siteId, expect.any(String), expect.objectContaining({ livePreviewId: 'lp-1' }))
  })

  it('starts nothing when the opening is refused, and gives the agent hq\'s words', async () => {
    db.livePreview.findFirst.mockResolvedValue(null)
    site.open.mockRejectedValue(new ControlPlaneError('conflict', 'box has 2 of 2 live previews open. Nothing was started.'))
    await expect(startAppOp(ctx(), START)).rejects.toThrow('box has 2 of 2 live previews open. Nothing was started.')
    expect(site.askSite).not.toHaveBeenCalled()
  })

  it('does not open one on the run\'s site when the branch has one on another site', async () => {
    db.livePreview.findFirst.mockResolvedValue({ ...ROW, executionSiteId: OTHER.id, copyKind: 'BUNDLE' })
    await expect(startAppOp(ctx(), START)).rejects.toThrow(/runs on another site/)
    expect(site.open).not.toHaveBeenCalled()
  })

  it('is the only app tool that opens one: reload_view on a branch with none is refused', async () => {
    db.livePreview.findFirst.mockResolvedValue(null)
    await expect(reloadViewOp(ctx(), { runId: 'run-1' })).rejects.toThrow(/no live preview open/)
    expect(site.open).not.toHaveBeenCalled()
  })
})
