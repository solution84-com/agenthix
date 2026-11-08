/**
 * A run's providers (models from one place, part 1 and part 4): what hq hands a site so a run's model calls reach the
 * provider the resolver chose. hq is the only holder of keys; the site keeps no provider table, and learns about a
 * provider only through the run. The site's model relay adds the key to each request, as it does today, and reports
 * each call's usage and upstream status back (`usage.report`, usageReport.ts).
 *
 * A descriptor is one of:
 * - `api_key`: a provider the organisation holds by API key; the key travels for this run only;
 * - `subscription`: a person's own Claude subscription, the Claude Code OAuth credentials document, written into the
 *   run's own Claude home; not relayed, so its calls are the run's own report;
 * - `cloud`: Agenthix Cloud, whose gateway speaks the vendor's own API; it carries no secret, and the relay asks hq
 *   for hq's Cloud access token (`HQ_CLOUD_AI_TOKEN_PATH`) and keeps it until a minute before it lapses.
 *
 * It replaces `RunCredential` and `fallbackCredentials` (credential.ts), which stay, deprecated, until no hq sends
 * them.
 */
import type { AiProviderVendor } from '../providers/providers.js'

export type RunProviderDescriptor =
  | {
    kind: 'api_key'
    providerId: string
    vendor: Exclude<AiProviderVendor, 'cloud'>
    apiKey: string
    /** For `openai_compatible` only: the endpoint. An endpoint that needs no key carries `apiKey: ''`. */
    baseUrl?: string
  }
  | {
    kind: 'subscription'
    providerId: string
    vendor: 'anthropic'
    oauthJson: string
    /** This one hand-over, to this site for this run, so a token the harness refreshes is reported against it. */
    grantId: string
    /** The stored sign-in the document came from. */
    loginId: string
  }
  | {
    kind: 'cloud'
    providerId: string
    vendor: 'cloud'
    /** Which vendor API the gateway is spoken to in, which follows the runtime: Anthropic's for Claude Code. */
    api: 'anthropic' | 'openai'
    /** The gateway's address for that API (`<Cloud>/ai/v1/anthropic`). */
    baseUrl: string
  }

/**
 * What a run is given to reach its models: the provider of the run's own model, and any other provider a helper of
 * the run may be sent to, each once (hq sends none today: a helper runs on its run's own model). `billingProfileId`
 * is the profile every call of the run is costed to; the relay passes it to Agenthix Cloud with each call while
 * `usageBilling` is on.
 */
export type RunModelAccess = {
  model: { providerId: string; model: string }
  provider: RunProviderDescriptor
  others?: RunProviderDescriptor[]
  billingProfileId: string
}

/**
 * The site asks hq for hq's Agenthix Cloud access token, scoped to AI, for a container's calls through Cloud's gateway:
 * `POST` with the site's machine credential (`Authorization: Bearer` and `X-Site-Id`, as a capability renewal), body
 * `{}`. hq answers `CloudAiTokenForSite`, or `CloudAiTokenRefusal` with 409. hq's private key never leaves hq.
 */
export const HQ_CLOUD_AI_TOKEN_PATH = '/api/v1/cloud/ai-token'

/** The token, and when it lapses in epoch milliseconds; the relay asks again a minute before. */
export type CloudAiTokenForSite = { token: string; expiresAt: number }

/** `not_connected`: hq is not connected to Cloud; `not_available`: Cloud does not offer AI to it yet. */
export type CloudAiTokenRefusal = { error: 'not_connected' | 'not_available' | 'disconnected' }

/** How long before a Cloud token lapses the relay asks for another. */
export const CLOUD_AI_TOKEN_REFRESH_BEFORE_MS = 60_000
