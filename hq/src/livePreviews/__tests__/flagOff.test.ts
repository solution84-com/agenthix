/**
 * The live preview while its flag is off, as shipped (live preview spec section 7, *The live preview's flag*): every
 * entry point on hq's server refuses as not available, and hq's background work for live previews does nothing. The
 * database answers only the organisation's switches, and a site answers nothing, so an entry point that read or asked
 * anything else before refusing fails here. Outside `withFeature` on purpose: one test per entry point.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BUNDLE_EVENTS, LIVE_PREVIEW_APP_EVENTS, LIVE_PREVIEW_EVENTS } from '@agenthix/core'

const seen = vi.hoisted(() => ({ reads: [] as string[], asked: [] as string[], handlers: new Map<string, (...a: unknown[]) => Promise<void>>() }))

vi.mock('wasp/server', async () => {
  const actual = await vi.importActual<Record<string, unknown>>('wasp/server')
  const refuse = (model: string) => new Proxy({}, {
    get: (_t, method) => () => { seen.reads.push(`${model}.${String(method)}`); throw new Error(`read ${model} while the flag is off`) },
  })
  const prisma = new Proxy({}, {
    get: (_t, model) => (model === 'org' ? { findFirst: async () => null } : refuse(String(model))),
  })
  return { ...actual, prisma }
})
vi.mock('../../sites/channel/siteEventHandler', () => ({
  onSiteEvent: (event: string, h: (...a: unknown[]) => Promise<void>) => { seen.handlers.set(`event:${event}`, h) },
  onRunStatus: (name: string, h: (...a: unknown[]) => Promise<void>) => { seen.handlers.set(`run:${name}`, h) },
}))
vi.mock('../../sites/channel', () => ({
  siteChannelRegistry: {
    isOnline: () => true,
    request: async (siteId: string, method: string) => { seen.asked.push(`${siteId} ${method}`); throw new Error('no site') },
  },
  ChannelRequestFailed: class extends Error {},
}))
vi.mock('../siteAsk', () => ({
  askSite: async (siteId: string, method: string) => { seen.asked.push(`${siteId} ${method}`); throw new Error('no site') },
  OPEN_TIMEOUT_MS: 1, SiteFailed: class extends Error {}, SiteSilent: class extends Error {},
}))
vi.mock('../../relays/relayTokens', () => ({
  signAppTicket: async () => ({ token: 't', jti: 'ticket-1', expiresAt: Date.now() + 60_000, enterBy: Date.now() + 60_000 }),
  signBundleTicket: async () => ({ token: 't', jti: 'b', expiresAt: Date.now() + 60_000 }),
  signFileTicket: async () => ({ token: 't', expiresAt: Date.now() + 60_000 }),
  signRelayPass: async () => ({ token: 't', expiresAt: Date.now() + 60_000 }),
}))

import * as operations from '../operations'
import { APP_TOOL_OPERATIONS } from '../appTools'
import { setSiteLivePreviews, siteLivePreviewsView, stopFleetLivePreview } from '../fleet'
import { livePreviewForPrompt } from '../runPrompt'
import { onSiteConnected, sweepTick } from '../reconcile'
import { carryBundle } from '../bundles'
import { appTickets } from '../../relays'
import { certificateAskDeps } from '../../relays/previewCertificateAskDeps'
import { startWorkflowRun } from '../../workflows/runs'
import { ControlPlaneError, type CallerContext } from '../../server/controlplane/types'
import { ConsoleRefusal } from '../../fleet/consoleMethods'

const NOT_AVAILABLE = 'Live preview is not available in this organisation. Nothing was changed.'

beforeEach(() => {
  seen.reads.length = 0
  seen.asked.length = 0
})

function nothingTouched() {
  expect(seen.reads).toEqual([])
  expect(seen.asked).toEqual([])
}

describe("the live preview's operations while its flag is off @SC-1771", () => {
  const ops = Object.entries(operations) as Array<[string, (a: unknown, c: unknown) => Promise<unknown>]>

  it('are every operation the workspace view calls', () => {
    expect(ops.map(([name]) => name).sort()).toEqual([
      'answerLivePreviewQuestionAction', 'getLivePreviewPlacesQuery', 'getLivePreviewQuery', 'markLivePreviewInUseAction',
      'openLiveAppAction', 'reloadLivePreviewAction', 'restartLiveAppAction', 'resumeLivePreviewAction',
      'runLivePreviewWorkflowAction', 'setLivePreviewAutoAction', 'startLiveAppAction', 'startLivePreviewAction',
      'stopLiveAppAction', 'stopLivePreviewAction',
    ])
  })

  it.each(ops)('%s answers 404, not available, and reads nothing', async (_name, op) => {
    await expect(op({ workspaceId: 'w1', branchId: null, livePreviewId: 'lp1', appId: 'a1', name: 'web' }, { user: { id: 'u1' } }))
      .rejects.toMatchObject({ statusCode: 404, message: NOT_AVAILABLE })
    nothingTouched()
  })
})

describe("the agent's app tools while the live preview's flag is off @SC-1772", () => {
  const ctx = { kind: 'run', claims: { siteId: 's1', sessionId: 'sess', taskId: null, agentId: 'ag' } } as unknown as CallerContext

  it.each(Object.entries(APP_TOOL_OPERATIONS))('%s is not available, and reads nothing', async (_name, op) => {
    const call = (op as (c: CallerContext, a: unknown) => Promise<unknown>)(ctx, { runId: 'r1', name: 'web', folder: '', command: 'npm run dev', port: 5173, auto: true })
    await expect(call).rejects.toBeInstanceOf(ControlPlaneError)
    await expect(call).rejects.toMatchObject({ code: 'not_found', message: NOT_AVAILABLE })
    nothingTouched()
  })
})

describe("the Fleet Console's live preview methods while the flag is off @SC-1771", () => {
  const calls: Array<[string, () => Promise<unknown>]> = [
    ['sites.livePreviews', () => siteLivePreviewsView('u1', 'es1')],
    ['sites.livePreviews.set', () => setSiteLivePreviews({ byUserId: 'u1', executionSiteId: 'es1', allowed: true, limit: null, idleMinutes: 30 })],
    ['sites.livePreviews.stop', () => stopFleetLivePreview({ byUserId: 'u1', executionSiteId: 'es1', livePreviewId: 'lp1' })],
  ]

  it.each(calls)('%s is refused as not found, and reads nothing', async (_name, call) => {
    const answer = call()
    await expect(answer).rejects.toBeInstanceOf(ConsoleRefusal)
    await expect(answer).rejects.toMatchObject({ code: 'not_found', message: NOT_AVAILABLE })
    nothingTouched()
  })
})

describe("what runs are told and given while the live preview's flag is off @SC-1772", () => {
  it("a run's prompt names no live preview", async () => {
    await expect(livePreviewForPrompt('w1', 'b1', 's1')).resolves.toBeNull()
    nothingTouched()
  })

  it("no run is sent into a live preview's container, its secrets with it", async () => {
    const run = startWorkflowRun({
      place: { type: 'project', id: 'p1' }, workspace: { ownerType: 'project', ownerId: 'p1', workspaceId: 'w1' },
      starter: { kind: 'person', userId: 'u1' }, workflow: { name: 'start-live-preview' }, livePreview: { id: 'lp1', siteId: 's1' },
    } as Parameters<typeof startWorkflowRun>[0])
    await expect(run).rejects.toMatchObject({ statusCode: 404, message: NOT_AVAILABLE })
    nothingTouched()
  })
})

describe("hq's background work for live previews while the flag is off @SC-1771", () => {
  it('registers its site events, each dropped unread', async () => {
    const events = [...Object.values(LIVE_PREVIEW_EVENTS), ...Object.values(LIVE_PREVIEW_APP_EVENTS), BUNDLE_EVENTS.landed].map(e => `event:${e}`)
    for (const key of events) expect(seen.handlers.has(key), key).toBe(true)
    for (const key of events) await seen.handlers.get(key)!('s1', { livePreviewId: 'lp1', livePreview: { livePreviewId: 'lp1' } })
    nothingTouched()
  })

  it("a run starting or ending keeps no live preview in use", async () => {
    await seen.handlers.get('run:livePreviews')!({ sessionId: 'sess', status: 'RUNNING' })
    nothingTouched()
  })

  it("a site's connect sends no setting and reconciles nothing", async () => {
    await onSiteConnected('s1')
    nothingTouched()
  })

  it('the idle stop and bringing commits back do nothing', async () => {
    await sweepTick()
    nothingTouched()
  })

  it('no branch is carried between sites', async () => {
    const ask = {
      source: { kind: 'main' as const, workspace: { ownerType: 'project' as const, ownerId: 'p1', workspaceId: 'w1' } }, prerequisites: [],
      from: { siteId: 'a', executionSiteId: 'A', name: 'a' }, to: { siteId: 'b', executionSiteId: 'B', name: 'b' },
      direction: 'toPreview' as const, personId: 'u1', workspaceId: 'w1', branch: 'main',
    }
    await expect(carryBundle(ask)).rejects.toMatchObject({ statusCode: 404, message: NOT_AVAILABLE })
    nothingTouched()
  })
})

describe("the relays' app doors hq answers while the live preview's flag is off @SC-1771", () => {
  it('no app ticket stands, even one hq signed', async () => {
    const signed = await appTickets.issue({ relay: 'r1', person: 'u1', appId: 'a1', livePreviewId: 'lp1' } as Parameters<typeof appTickets.issue>[0])
    await expect(appTickets.stands('r1', { ticketId: signed.jti, person: 'u1', appId: 'a1', livePreviewId: 'lp1' })).resolves.toBe(false)
    nothingTouched()
  })

  it("no live app's name is given a certificate", async () => {
    await expect(certificateAskDeps.appExists('a1')).resolves.toBe(false)
    nothingTouched()
  })
})
