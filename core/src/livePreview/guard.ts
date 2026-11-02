/**
 * The live preview's guard (live preview spec section 6): in the site, on the machine's side of a live preview's
 * containers, at least every `GUARD_CHECK_EVERY_MS` and on every Docker event. Each signal it can raise has one
 * response, fixed here so the guard, hq's notices and the tests read the same table; it acts within
 * `GUARD_ACT_WITHIN_MS` and tells the people who have the live preview open, and the fleet admins, why.
 */

export const GUARD_CHECK_EVERY_MS = 5 * 1000
export const GUARD_ACT_WITHIN_MS = 2 * 1000
/** How often the guard tells hq it runs (`livePreview.guardReport`). */
export const GUARD_REPORT_EVERY_MS = 15 * 1000
/** A site whose guard has not reported within this starts no live previews. */
export const GUARD_REPORT_STALE_MS = 60 * 1000
/** More blocked attempts than this in a minute, at a private address or the machine's own, pause the live preview. */
export const GUARD_BLOCKED_PER_MINUTE = 3

/**
 * What the guard can find:
 * - offTemplate: a container of the live preview whose image, mounts, capabilities, network or user differ from its
 *   template.
 * - notMadeBySite: a container, `docker exec`, mount or device with a live preview's labels that the site did not make.
 * - unexpectedProcess: a process that is not the current run's, a registered app's or a declared service's.
 * - unexpectedPort: a new listening port that is not a registered app's or a declared service's.
 * - blockedAddresses: more than `GUARD_BLOCKED_PER_MINUTE` blocked attempts at a private or the machine's own address.
 * - privilegeChange: a privilege change attempted. readOnlyWrite: a write to a read-only path.
 * - linkRefused: a link the site refused to follow, such as a services file that points outside the copy.
 * - relayRefusals: the relay refused more of the live preview's apps' requests than its threshold.
 * - unusualUse: CPU, memory or traffic far above the live preview's pattern with no run active.
 * - protectionsDown: the host service's network protections for the live-preview part do not hold.
 * - guardDown: the guard itself could not run (it fails closed).
 */
export const GUARD_SIGNALS = [
  'offTemplate', 'notMadeBySite', 'unexpectedProcess', 'unexpectedPort', 'blockedAddresses', 'privilegeChange',
  'readOnlyWrite', 'linkRefused', 'relayRefusals', 'unusualUse', 'protectionsDown', 'guardDown',
] as const
export type GuardSignal = (typeof GUARD_SIGNALS)[number]

/**
 * What the guard does:
 * - stopPreview: every container of the live preview killed, and the live preview stopped.
 * - killProcessAndPause: that process killed; the live preview paused.
 * - pause: every container of it paused; the people who have it open told.
 * - pauseThenStop: paused; on a repeat in the same live preview, stopPreview.
 * - refuse: the request refused; the people who have it open told.
 * - stopApp: the app stopped and its streams ended; the people who have it open told.
 * - pauseAndAsk: paused, and a person asked whether to resume.
 */
export const GUARD_RESPONSES = [
  'stopPreview', 'killProcessAndPause', 'pause', 'pauseThenStop', 'refuse', 'stopApp', 'pauseAndAsk',
] as const
export type GuardResponse = (typeof GUARD_RESPONSES)[number]

export const GUARD_RESPONSE: Readonly<Record<GuardSignal, GuardResponse>> = {
  offTemplate: 'stopPreview',
  notMadeBySite: 'stopPreview',
  unexpectedProcess: 'killProcessAndPause',
  unexpectedPort: 'pause',
  blockedAddresses: 'pause',
  privilegeChange: 'pauseThenStop',
  readOnlyWrite: 'pauseThenStop',
  linkRefused: 'refuse',
  relayRefusals: 'stopApp',
  unusualUse: 'pauseAndAsk',
  protectionsDown: 'pause',
  guardDown: 'stopPreview',
}

/** What the guard did, as it reports it: each step the response took. */
export const GUARD_STEPS = ['previewStopped', 'processKilled', 'paused', 'refused', 'alerted', 'appStopped', 'asked'] as const
export type GuardStep = (typeof GUARD_STEPS)[number]

export function parseGuardSignal(raw: unknown): GuardSignal | null {
  return GUARD_SIGNALS.find(s => s === raw) ?? null
}
