/**
 * What a run is given to reach its models, as the site uses it (models from one place, part 1). hq sends a provider
 * descriptor per provider (`RunContextPayload.modelAccess`); an hq before site protocol 1.1 sends the deprecated
 * `credential` and `fallbackCredentials` instead, which are still read until they stop working in 3.0.
 *
 * Each relayed provider is keyed by the relay path a harness addresses it at (`provider`): a vendor's own, and for
 * Agenthix Cloud the vendor API its gateway is spoken to in. A provider id is known only from a descriptor; a run from
 * an older hq has none, and its calls are not reported.
 */
import type { ApiKeyRunCredential, RunContextPayload, RunProviderDescriptor, SubscriptionRunCredential } from '@agenthix/core'
import { isRelayProvider, type RelayProvider } from './relayProviders'

/** An API key the relay adds to a request: an older hq's credential, or a descriptor's key for any relayed provider. */
export type RelayApiKeyCredential = Omit<ApiKeyRunCredential, 'provider'> & { provider: RelayProvider; providerId?: string }

/** A provider whose requests the relay sends on, adding what it presents. */
export type RelayCredential =
  | RelayApiKeyCredential
  | { kind: 'cloud'; providerId: string; provider: Extract<RelayProvider, 'anthropic' | 'openai'>; baseUrl: string }

/** The run's own provider: relayed, or a person's own Claude subscription written as the run's login file. */
export type SiteRunCredential = RelayCredential | (SubscriptionRunCredential & { providerId?: string })

export type RunAccess = {
  credential: SiteRunCredential | null
  /** The run's other providers, relayed only. */
  others: RelayCredential[]
  billingProfileId: string | null
}

/** A descriptor as the site uses it; null for one it cannot (a voice-only vendor, AssemblyAI, is never a run's). */
export function siteCredentialOf(d: RunProviderDescriptor): SiteRunCredential | null {
  switch (d.kind) {
    case 'subscription':
      return { kind: 'subscription', provider: 'anthropic', oauthJson: d.oauthJson, grantId: d.grantId, loginId: d.loginId, providerId: d.providerId }
    case 'cloud':
      return { kind: 'cloud', providerId: d.providerId, provider: d.api, baseUrl: d.baseUrl }
    case 'api_key':
      if (!isRelayProvider(d.vendor)) return null
      return {
        kind: 'apiKey', providerId: d.providerId, provider: d.vendor, apiKey: d.apiKey,
        ...(d.baseUrl ? { baseUrl: d.baseUrl } : {}),
      }
  }
}

export function isRelayed(c: SiteRunCredential | null | undefined): c is RelayCredential {
  return !!c && c.kind !== 'subscription'
}

export function runAccessOf(ctx: Pick<RunContextPayload, 'modelAccess' | 'credential' | 'fallbackCredentials'>): RunAccess {
  const access = ctx.modelAccess
  if (access) {
    return {
      credential: siteCredentialOf(access.provider),
      others: (access.others ?? []).map(siteCredentialOf).filter(isRelayed),
      billingProfileId: access.billingProfileId || null,
    }
  }
  return { credential: ctx.credential ?? null, others: ctx.fallbackCredentials ?? [], billingProfileId: null }
}

/** Every provider a turn's model requests may be relayed to: its own, then the others. */
export function turnRelayCredentials(turn: { credential: SiteRunCredential | null; fallbackCredentials?: RelayCredential[] }): RelayCredential[] {
  return [...(isRelayed(turn.credential) ? [turn.credential] : []), ...(turn.fallbackCredentials ?? [])]
}
