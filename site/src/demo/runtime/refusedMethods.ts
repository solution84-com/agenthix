import {
  BRANCH_BRING_BACK_BUNDLE_METHOD, BRANCH_WORK_METHODS, BUNDLE_METHODS, CLAUDE_LOGIN_METHODS, LIVE_PREVIEW_APP_METHODS,
  LIVE_PREVIEW_METHODS, MAIN_WORK_METHODS,
} from '@agenthix/core'

/**
 * The channel methods that start a container on this site (the login's, a live preview's, an app's, a bundle's and
 * the commit helper's), refused in the demo before their handler runs. A second line beside each spawn site's own
 * refusal (`refuseContainerInDemo`).
 */
export const DEMO_REFUSED_METHODS: ReadonlySet<string> = new Set<string>([
  ...Object.values(CLAUDE_LOGIN_METHODS),
  LIVE_PREVIEW_METHODS.open, LIVE_PREVIEW_METHODS.resume, LIVE_PREVIEW_METHODS.act, LIVE_PREVIEW_METHODS.refresh,
  LIVE_PREVIEW_METHODS.commit, LIVE_PREVIEW_APP_METHODS.start,
  BUNDLE_METHODS.make, BUNDLE_METHODS.drop, BRANCH_BRING_BACK_BUNDLE_METHOD,
  ...Object.values(BRANCH_WORK_METHODS),
  ...Object.values(MAIN_WORK_METHODS),
])
