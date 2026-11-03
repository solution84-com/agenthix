/**
 * The frames on the hq↔site control channel: what every message carries, the
 * request and answer payloads, and the one-way site events.
 *
 * Split out of `connection.ts` when that file passed the repository's
 * file-size limit; the protocol version and its negotiation stay there.
 */
import type { SiteMethodName, SiteMethodParams } from './siteMethods.js'
import type {
  CredentialHealthEvent, RunStatusEvent, RunStreamEvent, RunWaitingEvent, SessionPatchEvent, SubscriptionRefreshedEvent,
} from './runtimeEvents.js'
import type { SiteHealth } from './siteHealth.js'
import type { ScheduledChangeNotice } from '../host/scheduledChange.js'
import type { WorkflowRunResult, WorkflowStepEvent } from './workflowRuns.js'
import type { BranchBackEvent } from './branchWork.js'
import type {
  LivePreviewBranchMovedEvent, LivePreviewGuardEvent, LivePreviewGuardReportEvent, LivePreviewStateEvent,
} from './livePreviews.js'
import type { LivePreviewAppStateEvent, LivePreviewPackageBlockedEvent, LivePreviewServicesEvent } from './livePreviewApps.js'
import type { BundleLandedEvent } from './branchBundles.js'
import type { BranchPackageBlockedEvent } from './branchPackages.js'

export type HQConnectionMessageType =
  | 'ping'
  | 'pong'
  | 'site.detach'
  | 'revoke'
  | 'channel.request'
  | 'channel.response'
  | 'channel.error'
  | 'site.event'

export interface HQConnectionMessage<T = unknown> {
  /** `major.minor`, e.g. "7.0". */
  version: string
  type: HQConnectionMessageType
  siteId: string
  payload: T
  /**
   * Set only on a message that expects an answer. Unique per connection, not
   * globally — each socket owns its own sequence, so a late reply from a
   * previous connection cannot be matched to a request on this one.
   */
  requestId?: string
  /**
   * Set only on an answer, carrying the `requestId` it answers. Deliberately a
   * second field rather than reusing `requestId`: one field would force the
   * reader to consult `type` to know which role it is in, which is exactly how
   * a response gets matched to the wrong request.
   */
  replyTo?: string
}

export type SiteDetachPayload = Record<string, never>
export type RevokePayload = Record<string, never>
export type SiteDetachMessage = HQConnectionMessage<SiteDetachPayload>
export type RevokeMessage = HQConnectionMessage<RevokePayload>

/**
 * Since 1.12: the organisation's feature switches (adr-0172), as hq holds them on the organisation's record: a flag's
 * name and whether it is switched on. Open-ended on the wire, so a flag added or removed in core's list changes no
 * message; a site reads them with `parseFeatureSwitches`, which drops any name it does not list and any value that is
 * not a boolean.
 */
export type FeatureSwitchesOnWire = { readonly [flag: string]: boolean }

/**
 * A request on the control channel: one of `SiteMethods`, with that method's params.
 *
 * `features`, since 1.12: hq sends the organisation's switches with every request, and a site decides each flagged
 * feature from them with `isFeatureOn` and its own build, so in production hq's word can turn on a beta and nothing
 * else. Absent (from an hq before 1.12), the site has no switches.
 */
export type ChannelRequestPayload = {
  [M in SiteMethodName]: { method: M; params: SiteMethodParams<M>; features?: FeatureSwitchesOnWire }
}[SiteMethodName]

export interface ChannelErrorPayload {
  message: string
  /** Machine-readable: 'unknown_method' | 'handler_failed' | 'offline' | 'timeout' | 'disconnected'. */
  code: string
}

export type ChannelRequestMessage = HQConnectionMessage<ChannelRequestPayload>
/** An answer's payload is its method's result (`SiteMethodResult`); the method is known from `replyTo`. */
export type ChannelResponseMessage<R> = HQConnectionMessage<R>
export type ChannelErrorMessage = HQConnectionMessage<ChannelErrorPayload>

/** site → hq: each event a site sends, with its data. */
export type SiteEvents = {
  'run.status': RunStatusEvent
  'run.stream': RunStreamEvent
  'site.credentialHealth': CredentialHealthEvent
  'site.subscriptionRefreshed': SubscriptionRefreshedEvent
  'session.patch': SessionPatchEvent
  'run.waiting': RunWaitingEvent
  'site.health': SiteHealth
  'site.scheduledChange': ScheduledChangeNotice
  'workflow.step': WorkflowStepEvent
  'workflow.result': WorkflowRunResult
  /** Since 1.12: the site brought a branch back on its own (`branchWork.ts`). */
  'branch.back': BranchBackEvent
  /** Since 1.12: live previews (`livePreviews.ts`, `livePreviewApps.ts`) and bundles (`branchBundles.ts`). */
  'livePreview.state': LivePreviewStateEvent
  'livePreview.guard': LivePreviewGuardEvent
  'livePreview.guardReport': LivePreviewGuardReportEvent
  'livePreview.branchMoved': LivePreviewBranchMovedEvent
  'livePreview.appState': LivePreviewAppStateEvent
  'livePreview.services': LivePreviewServicesEvent
  'livePreview.packageBlocked': LivePreviewPackageBlockedEvent
  'bundle.landed': BundleLandedEvent
  /** Since 1.12: a package asked about in a branch's copy with no live preview open (`branchPackages.ts`). */
  'branch.packageBlocked': BranchPackageBlockedEvent
}

export type SiteEventName = keyof SiteEvents

/** One-way site → hq event frame — no requestId, no reply (plan 5d-2 D4). */
export type SiteEventPayload = {
  [E in SiteEventName]: { event: E; data: SiteEvents[E] }
}[SiteEventName]

/** The one-way frame, enforced at type level: no requestId, no replyTo. */
export type SiteEventMessage = HQConnectionMessage<SiteEventPayload> & {
  requestId?: never
  replyTo?: never
}

/**
 * What `site.describe` answers with — one of the methods this channel serves
 * (`SiteMethods`, siteMethods.ts, is the full map).
 *
 * A type alias rather than an interface on purpose: Wasp operations return
 * superjson `Payload`, which requires an implicit index signature, and an
 * interface does not have one. As an interface this fails the SDK build, not
 * `tsc --noEmit` on the source.
 */
export type SiteDescribeResult = {
  siteId: string
  name: string
  protocolVersion: string
  startedAt: string
}
