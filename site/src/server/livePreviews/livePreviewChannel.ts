/**
 * The live-preview, app and bundle methods hq calls on the control channel, for `../hq/channelMethods.ts`. Every one is
 * the live preview's (`livePreview` flag, adr-0172) and refused, doing nothing, while it is off for the request's
 * switches; bundles carry only a live preview's own copy. `branch.packageUse` is not one of them: it answers the
 * package card of a branch's copy too, which stays on for everyone.
 */
import {
  BRANCH_BRING_BACK_BUNDLE_METHOD, BRANCH_PACKAGE_USE_METHOD, BUNDLE_METHODS, LIVE_PREVIEW_APP_METHODS, LIVE_PREVIEW_METHODS, SITE_LIVE_PREVIEWS_METHOD,
} from '@agenthix/core'
import { featureMethod } from '../features/siteFeatures'
import { livePreviewAppList, livePreviewAppStart, livePreviewAppStop } from './apps/appMethods'
import { branchBringBackBundle, bundleDrop, bundleMake } from './bundles/bundleMethods'
import { livePreviewAct, livePreviewCommit, livePreviewList, livePreviewRefresh, livePreviewStop, siteLivePreviews } from './livePreviewMethods'
import { livePreviewOpen, livePreviewResume } from './livePreviewOpening'
import { branchPackageUse } from './installs/copyPackages'

const live = <R>(handler: (params: unknown) => Promise<R>) => featureMethod('livePreview', handler)

/** The methods behind the flag, by name. */
export const LIVE_PREVIEW_FLAGGED_METHODS = [
  LIVE_PREVIEW_METHODS.open, LIVE_PREVIEW_METHODS.resume, LIVE_PREVIEW_METHODS.stop, LIVE_PREVIEW_METHODS.list,
  LIVE_PREVIEW_METHODS.act, LIVE_PREVIEW_METHODS.refresh, LIVE_PREVIEW_METHODS.commit,
  LIVE_PREVIEW_APP_METHODS.start, LIVE_PREVIEW_APP_METHODS.stop, LIVE_PREVIEW_APP_METHODS.list,
  SITE_LIVE_PREVIEWS_METHOD, BUNDLE_METHODS.make, BUNDLE_METHODS.drop, BRANCH_BRING_BACK_BUNDLE_METHOD,
] as const

export const livePreviewChannelMethods = {
  [LIVE_PREVIEW_METHODS.open]: live(params => livePreviewOpen(params)),
  [LIVE_PREVIEW_METHODS.resume]: live(params => livePreviewResume(params)),
  [LIVE_PREVIEW_METHODS.stop]: live(params => livePreviewStop(params)),
  [LIVE_PREVIEW_METHODS.list]: live(() => livePreviewList()),
  [LIVE_PREVIEW_METHODS.act]: live(params => livePreviewAct(params)),
  [LIVE_PREVIEW_METHODS.refresh]: live(params => livePreviewRefresh(params)),
  [LIVE_PREVIEW_METHODS.commit]: live(params => livePreviewCommit(params)),
  [LIVE_PREVIEW_APP_METHODS.start]: live(params => livePreviewAppStart(params)),
  [LIVE_PREVIEW_APP_METHODS.stop]: live(params => livePreviewAppStop(params)),
  [LIVE_PREVIEW_APP_METHODS.list]: live(params => livePreviewAppList(params)),
  [SITE_LIVE_PREVIEWS_METHOD]: live(params => siteLivePreviews(params)),
  [BUNDLE_METHODS.make]: live(params => bundleMake(params)),
  [BUNDLE_METHODS.drop]: live(params => bundleDrop(params)),
  [BRANCH_BRING_BACK_BUNDLE_METHOD]: live(params => branchBringBackBundle(params)),
  [BRANCH_PACKAGE_USE_METHOD]: (params: unknown) => branchPackageUse(params),
} as const
