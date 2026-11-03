/**
 * The live preview's methods on the control channel behind its flag (adr-0172): while it is off each is refused before
 * its handler runs, whatever hq's switch says on a production site; inside the feature's own group each is answered.
 * `branch.packageUse` is not behind it: the package card of a branch's copy stays on for everyone.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withFeature } from '@agenthix/core/testing'
import { BRANCH_PACKAGE_USE_METHOD, SITE_PROTOCOL_VERSION, type HQConnectionMessage } from '@agenthix/core'

const handlers = vi.hoisted(() => {
  const answer = () => vi.fn(async () => ({ ok: true }))
  return {
    livePreviewAct: answer(), livePreviewCommit: answer(), livePreviewList: answer(), livePreviewRefresh: answer(),
    livePreviewStop: answer(), siteLivePreviews: answer(), livePreviewOpen: answer(), livePreviewResume: answer(),
    livePreviewAppStart: answer(), livePreviewAppStop: answer(), livePreviewAppList: answer(),
    bundleMake: answer(), bundleDrop: answer(), branchBringBackBundle: answer(), branchPackageUse: answer(),
  }
})
vi.mock('../livePreviewMethods', () => ({
  livePreviewAct: handlers.livePreviewAct, livePreviewCommit: handlers.livePreviewCommit, livePreviewList: handlers.livePreviewList,
  livePreviewRefresh: handlers.livePreviewRefresh, livePreviewStop: handlers.livePreviewStop, siteLivePreviews: handlers.siteLivePreviews,
}))
vi.mock('../livePreviewOpening', () => ({ livePreviewOpen: handlers.livePreviewOpen, livePreviewResume: handlers.livePreviewResume }))
vi.mock('../apps/appMethods', () => ({
  livePreviewAppStart: handlers.livePreviewAppStart, livePreviewAppStop: handlers.livePreviewAppStop, livePreviewAppList: handlers.livePreviewAppList,
}))
vi.mock('../bundles/bundleMethods', () => ({
  bundleMake: handlers.bundleMake, bundleDrop: handlers.bundleDrop, branchBringBackBundle: handlers.branchBringBackBundle,
}))
vi.mock('../installs/copyPackages', () => ({ branchPackageUse: handlers.branchPackageUse }))
vi.mock('../../hq/channelMethods', () => ({ channelMethods: {} }))

const { LIVE_PREVIEW_FLAGGED_METHODS, livePreviewChannelMethods } = await import('../livePreviewChannel')
const { answerChannelRequest } = await import('../../hq/channelAnswer')
const { resetSiteFeaturesForTests } = await import('../../features/siteFeatures')

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
  resetSiteFeaturesForTests()
})

/** Asks one method as hq does, with the organisation's switches hq sends, and returns the site's reply. */
async function ask(method: string, features?: Record<string, boolean>): Promise<HQConnectionMessage> {
  const replies: HQConnectionMessage[] = []
  await answerChannelRequest(
    { version: SITE_PROTOCOL_VERSION, type: 'channel.request', siteId: 'site-1', requestId: 'r1', payload: { method, params: { any: 'params' }, features } },
    'site-1', reply => replies.push(reply), livePreviewChannelMethods,
  )
  expect(replies).toHaveLength(1)
  return replies[0]!
}

const called = () => Object.values(handlers).filter(h => h.mock.calls.length > 0).length

describe('the live preview off: every method of it refused, nothing done @SC-1776', () => {
  it('names every live-preview method the channel answers, and only branch.packageUse beside them', () => {
    expect(Object.keys(livePreviewChannelMethods).sort()).toEqual([...LIVE_PREVIEW_FLAGGED_METHODS, BRANCH_PACKAGE_USE_METHOD].sort())
  })

  it.each([...LIVE_PREVIEW_FLAGGED_METHODS])('refuses %s as shipped, before its handler', async method => {
    const reply = await ask(method)
    expect(reply.type).toBe('channel.error')
    expect(reply.payload).toMatchObject({ code: 'handler_failed', message: expect.stringMatching(/\(livePreview\) is not available.*Nothing was changed\.$/) })
    expect(called()).toBe(0)
  })

  it.each([...LIVE_PREVIEW_FLAGGED_METHODS])('refuses %s on a production site even with hq saying it is on', async method => {
    vi.stubEnv('NODE_ENV', 'production')
    expect((await ask(method, { livePreview: true })).type).toBe('channel.error')
    expect(called()).toBe(0)
  })

  it("answers branch.packageUse: a branch's package card does not depend on the live preview", async () => {
    expect((await ask(BRANCH_PACKAGE_USE_METHOD)).type).toBe('channel.response')
    expect(handlers.branchPackageUse).toHaveBeenCalledTimes(1)
  })

  it("answers on a development site when hq's switch for the organisation is on", async () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect((await ask(LIVE_PREVIEW_FLAGGED_METHODS[0], { livePreview: true })).type).toBe('channel.response')
    expect((await ask(LIVE_PREVIEW_FLAGGED_METHODS[0], {})).type).toBe('channel.error')
    expect(handlers.livePreviewOpen).toHaveBeenCalledTimes(1)
  })
})

withFeature('livePreview', () => {
  describe('the live preview on', () => {
    it.each([...LIVE_PREVIEW_FLAGGED_METHODS])('answers %s through its handler', async method => {
      expect(await ask(method)).toMatchObject({ type: 'channel.response', payload: { ok: true } })
      expect(called()).toBe(1)
    })
  })
})
