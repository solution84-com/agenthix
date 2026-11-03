/**
 * Opening a live preview (live preview spec section 4, *Opening one*): the site's own checks after hq's, its copy
 * checked against the site's own record, one per branch, its limit, and a failed start leaving nothing behind.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'

const db = vi.hoisted(() => ({
  previews: new Map<string, Record<string, unknown>>(),
  copies: new Map<string, Record<string, unknown>>(),
  workspaces: [{ id: 'w1', ownerType: 'project', ownerId: 'pr1' }],
}))
const life = vi.hoisted(() => ({ started: [] as string[], fail: false, stopped: [] as string[] }))

vi.mock('#db', () => ({
  prisma: {
    livePreview: {
      findUnique: async ({ where }: { where: { id: string } }) => db.previews.get(where.id) ?? null,
      findMany: async ({ where }: { where: { live?: boolean } }) => [...db.previews.values()].filter(r => where.live === undefined || r.live === where.live),
      upsert: async ({ where, create, update }: { where: { id: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        db.previews.set(where.id, { ...(db.previews.get(where.id) ?? create), ...update, id: where.id })
      },
    },
    branchCopy: { findUnique: async ({ where }: { where: { id: string } }) => db.copies.get(where.id) ?? null },
    workspace: { findFirst: async ({ where }: { where: { id: string; ownerType: string; ownerId: string } }) =>
      db.workspaces.find(w => w.id === where.id && w.ownerType === where.ownerType && w.ownerId === where.ownerId) ?? null },
  },
}))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: () => {}, onOpen: () => {} } }))
vi.mock('../../host/hostFigures', () => ({ hostFigures: { livePreviewProtectionsProblem: async () => null } }))
vi.mock('../livePreviewRuntime', () => ({ guardHealthy: () => true, apps: { previewChanged: () => {} }, currentGuard: () => null }))
vi.mock('../livePreviewLife', () => ({
  startContainers: async (row: { id: string }) => { if (life.fail) throw new Error('no docker'); life.started.push(row.id) },
  stopPreview: async (id: string, reason: string, detail: string) => {
    life.stopped.push(id)
    const r = db.previews.get(id)!
    db.previews.set(id, { ...r, live: false, state: { state: 'stopped', since: new Date().toISOString(), reason, signal: null, detail } })
    return { stopped: true, pendingBack: false }
  },
  resumePreview: async () => null,
}))
vi.mock('node:fs/promises', async importOriginal => {
  const real = await importOriginal<typeof import('node:fs/promises')>()
  return { ...real, default: { ...real, lstat: async () => ({ isDirectory: () => true }) } }
})

process.env.AGENT_CONTAINER_ISOLATION = 'true'
process.env.SITE_ROOT = '/site'
process.env.AGENT_NETWORK_RANGE = '10.213.0.0/20'

const { livePreviewOpen } = await import('../livePreviewOpening')
const { setLivePreviewSettings } = await import('../livePreviewSettings')

const COPY = '44444444-4444-4444-8444-444444444444'
const open = (over: Record<string, unknown> = {}) => livePreviewOpen({
  livePreviewId: `lp-${Math.random().toString(36).slice(2, 8)}`, projectId: 'pr1', personId: 'p1',
  workspace: { ownerType: 'project', ownerId: 'pr1', workspaceId: 'w1' }, branch: 'login-page', onMain: false,
  copy: { kind: 'branch', copyId: COPY }, ...over,
})

beforeEach(() => {
  db.previews.clear()
  db.copies.clear()
  db.copies.set(COPY, { id: COPY, ownerType: 'project', ownerId: 'pr1', workspaceId: 'w1', branch: 'login-page' })
  life.started = []
  life.stopped = []
  life.fail = false
  setLivePreviewSettings({ allowed: true, limit: null, idleMinutes: 120 })
})

withFeature('livePreview', () => {
  describe('opening a live preview on this site @SC-1733', () => {
    it('starts one on the branch\'s own copy, as the site\'s record holds it', async () => {
      const answer = await open()
      expect(answer).toMatchObject({ ok: true, livePreview: { branch: 'login-page', copy: { kind: 'branch', copyId: COPY }, state: { state: 'running' } } })
      expect(life.started).toHaveLength(1)
    })

    it('refuses a copy its own record does not hold for that branch, whatever hq names', async () => {
      db.copies.set(COPY, { id: COPY, ownerType: 'project', ownerId: 'pr1', workspaceId: 'w1', branch: 'other-branch' })
      expect(await open()).toMatchObject({ ok: false, refusal: { code: 'noCopy' } })
      expect(life.started).toEqual([])
    })

    it('refuses while live previews are off here, and malformed params', async () => {
      setLivePreviewSettings({ allowed: false, limit: null, idleMinutes: 120 })
      expect(await open()).toMatchObject({ ok: false, refusal: { code: 'turnedOff' } })
      expect(await open({ extra: true })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
      expect(await open({ onMain: true })).toMatchObject({ ok: false, refusal: { code: 'malformed' } })
    })

    it('keeps one per branch, and the site\'s limit', async () => {
      await open()
      expect(await open()).toMatchObject({ ok: false, refusal: { code: 'branchOpen' } })
      setLivePreviewSettings({ allowed: true, limit: 1, idleMinutes: 120 })
      expect(await open({ branch: 'other' , copy: { kind: 'branch', copyId: COPY } })).toMatchObject({ ok: false, refusal: { code: 'atLimit' } })
    })

    it('stops one whose container could not start, saying why', async () => {
      life.fail = true
      const answer = await open()
      expect(answer).toMatchObject({ ok: true, livePreview: { state: { state: 'stopped', reason: 'failed' } } })
      expect(life.stopped).toHaveLength(1)
    })
  })
})
