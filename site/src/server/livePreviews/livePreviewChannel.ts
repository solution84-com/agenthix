/** The live-preview, app and bundle methods hq calls on the control channel, for `../hq/channelMethods.ts`. */
import {
  BRANCH_BRING_BACK_BUNDLE_METHOD, BRANCH_PACKAGE_USE_METHOD, BUNDLE_METHODS, LIVE_PREVIEW_APP_METHODS, LIVE_PREVIEW_METHODS, SITE_LIVE_PREVIEWS_METHOD,
} from '@agenthix/core'
import { livePreviewAppList, livePreviewAppStart, livePreviewAppStop } from './apps/appMethods'
import { branchBringBackBundle, bundleDrop, bundleMake } from './bundles/bundleMethods'
import { livePreviewAct, livePreviewCommit, livePreviewList, livePreviewRefresh, livePreviewStop, siteLivePreviews } from './livePreviewMethods'
import { livePreviewOpen, livePreviewResume } from './livePreviewOpening'
import { branchPackageUse } from './installs/copyPackages'

export const livePreviewChannelMethods = {
  [LIVE_PREVIEW_METHODS.open]: (params: unknown) => livePreviewOpen(params),
  [LIVE_PREVIEW_METHODS.resume]: (params: unknown) => livePreviewResume(params),
  [LIVE_PREVIEW_METHODS.stop]: (params: unknown) => livePreviewStop(params),
  [LIVE_PREVIEW_METHODS.list]: () => livePreviewList(),
  [LIVE_PREVIEW_METHODS.act]: (params: unknown) => livePreviewAct(params),
  [LIVE_PREVIEW_METHODS.refresh]: (params: unknown) => livePreviewRefresh(params),
  [LIVE_PREVIEW_METHODS.commit]: (params: unknown) => livePreviewCommit(params),
  [LIVE_PREVIEW_APP_METHODS.start]: (params: unknown) => livePreviewAppStart(params),
  [LIVE_PREVIEW_APP_METHODS.stop]: (params: unknown) => livePreviewAppStop(params),
  [LIVE_PREVIEW_APP_METHODS.list]: (params: unknown) => livePreviewAppList(params),
  [SITE_LIVE_PREVIEWS_METHOD]: (params: unknown) => siteLivePreviews(params),
  [BUNDLE_METHODS.make]: (params: unknown) => bundleMake(params),
  [BUNDLE_METHODS.drop]: (params: unknown) => bundleDrop(params),
  [BRANCH_BRING_BACK_BUNDLE_METHOD]: (params: unknown) => branchBringBackBundle(params),
  [BRANCH_PACKAGE_USE_METHOD]: (params: unknown) => branchPackageUse(params),
} as const
