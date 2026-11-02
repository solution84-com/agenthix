/**
 * The live preview's other entry points behind its flag (adr-0172), each refused while it is off and nothing read or
 * done: the relay's doors (`app.serve`, `bundle.read`, `bundle.write`, by the latest switches hq sent, not those of
 * the request that opened the line), a run in a live preview's own copy (by the run's switches), and
 * `update_from_main` in a live preview's own copy (by the request's).
 */
import { Duplex } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import {
  createAppResponseHeadReader, createBundleReadHeadReader, createBundleWriteHeadReader, encodeBundleReadHead,
  type RunCodeWork,
} from '@agenthix/core'
import type { ContentStream } from '../../hq/content/contentStream'

const store = vi.hoisted(() => ({ row: null as null | Record<string, unknown> }))
vi.mock('#db', () => ({ prisma: { livePreview: { findFirst: async () => (store.row ? { id: 'lp-1' } : null) } } }))
vi.mock('../../hq/hqConnection', () => ({ hqConnectionManager: { sendEvent: () => {} } }))
vi.mock('../livePreviewStore', async importOriginal => ({
  ...(await importOriginal<typeof import('../livePreviewStore')>()),
  livePreviewRow: async () => store.row,
}))

const { createAppServe } = await import('../apps/appServe')
const { createBundleRead, createBundleWrite } = await import('../bundles/bundleStreams')
const { resolveLivePreviewCopy } = await import('../livePreviewRuns')
const { updateOwnCopyFromMain } = await import('../livePreviewUpdate')
const { FeatureNotAvailableError, resetSiteFeaturesForTests, withRequestSwitches } = await import('../../features/siteFeatures')

afterEach(() => {
  vi.unstubAllEnvs()
  resetSiteFeaturesForTests()
  store.row = null
})

const REQUEST = { method: 'GET', target: '/', headers: [] }
const keys = () => ({ get: vi.fn(async () => ({ keys: [] })), refresh: vi.fn(async () => false) })

function stream(sent: Buffer[] = []): { stream: ContentStream; answered: () => Uint8Array } {
  const out: Buffer[] = []
  const d = new Duplex({ read() {}, write(chunk, _e, cb) { out.push(Buffer.from(chunk)); cb() }, final(cb) { cb() } })
  setTimeout(() => { for (const b of sent) d.push(b); d.push(null) }, 0)
  return { stream: d as unknown as ContentStream, answered: () => new Uint8Array(Buffer.concat(out)) }
}

const head = (reader: { push(c: Uint8Array): { state: string } }, bytes: Uint8Array): unknown => {
  const read = reader.push(bytes)
  return 'head' in read ? read.head : undefined
}

async function serveApp(k = keys()): Promise<{ refusal?: string; keysAsked: boolean }> {
  const s = stream()
  await createAppServe({ siteId: 'site-1', relayId: 'relay-1', keys: k })(s.stream, { ticket: 'a ticket', request: REQUEST })
  const h = head(createAppResponseHeadReader(), s.answered()) as { refusal?: string } | undefined
  return { refusal: h?.refusal, keysAsked: k.get.mock.calls.length > 0 }
}

describe("the relay's doors while the live preview is off", () => {
  it('app.serve answers that no live preview runs, and verifies nothing', async () => {
    expect(await serveApp()).toEqual({ refusal: 'preview-not-running', keysAsked: false })
  })

  it('bundle.read and bundle.write refuse the ticket, and verify nothing', async () => {
    const k = keys()
    const r = stream()
    await createBundleRead({ siteId: 'site-a', relayId: 'relay-1', keys: k })(r.stream, { ticket: 'a ticket' })
    expect(head(createBundleReadHeadReader(), r.answered())).toEqual({ ok: false, refusal: 'ticket-invalid' })
    const told = vi.fn()
    const w = stream([Buffer.from(encodeBundleReadHead({ ok: true, size: 3 })), Buffer.from('abc')])
    await createBundleWrite({ siteId: 'site-b', relayId: 'relay-1', keys: k, tell: told })(w.stream, { ticket: 'a ticket' })
    expect(head(createBundleWriteHeadReader(), w.answered())).toEqual({ ok: false, refusal: 'ticket-invalid' })
    expect(k.get).not.toHaveBeenCalled()
    expect(told).not.toHaveBeenCalled()
  })

  it('follow the latest switches hq sent, not those of the request that opened the line', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    // A stream that comes in on work a request with the switch on started (a line opened on `relay.assign`)...
    const later = withRequestSwitches({ livePreview: true }, () => new Promise<void>(r => setTimeout(r, 20)).then(() => serveApp()))
    // ...after a later request said it is off.
    withRequestSwitches({}, () => null)
    expect((await later).refusal).toBe('preview-not-running')
    withRequestSwitches({ livePreview: true }, () => null)
    expect((await serveApp()).keysAsked).toBe(true)
  })
})

const codeWork = { livePreviewId: 'lp-1', branch: 'login-page', copyId: 'c1', workspace: { workspaceId: 'w1', ownerType: 'project', ownerId: 'p1' } } as unknown as RunCodeWork
const boundary = { ownerType: 'project', ownerId: 'p1' }

describe("a live preview's own copy while the live preview is off", () => {
  it("refuses a run in it, by the run's switches", async () => {
    await expect(resolveLivePreviewCopy('run-1', codeWork, boundary, {})).rejects.toThrow(/Live previews are not available.*Nothing was changed\.$/)
    vi.stubEnv('NODE_ENV', 'production')
    await expect(resolveLivePreviewCopy('run-1', codeWork, boundary, { livePreview: true })).rejects.toThrow(/not available/)
  })

  it('refuses update_from_main in it, doing nothing', async () => {
    store.row = { id: 'lp-1', state: { state: 'running' }, workspaceId: 'w1', ownerType: 'project', ownerId: 'p1', branch: 'login-page' }
    const q = { copyId: 'c1', branch: 'login-page', workspace: codeWork.workspace } as Parameters<typeof updateOwnCopyFromMain>[0]
    await expect(updateOwnCopyFromMain(q, 'Merge main')).rejects.toBeInstanceOf(FeatureNotAvailableError)
  })

  it('leaves a copy that is no live preview\'s to the branch\'s own path', async () => {
    const q = { copyId: 'c1', branch: 'login-page', workspace: codeWork.workspace } as Parameters<typeof updateOwnCopyFromMain>[0]
    expect(await updateOwnCopyFromMain(q, 'Merge main')).toBeNull()
  })
})

withFeature('livePreview', () => {
  describe("the live preview's doors and copies on", () => {
    it('app.serve reads the ticket', async () => {
      expect(await serveApp()).toMatchObject({ keysAsked: true })
    })

    it('a run in a live preview\'s own copy goes on to the site\'s own record', async () => {
      await expect(resolveLivePreviewCopy('run-1', codeWork, boundary, {})).rejects.toThrow(/is not on this site/)
    })
  })
})
