/**
 * The providers a run's model credential can belong to (spec §6). The values
 * are the ones hq stores on `ModelCredential.provider`. `openai_compatible` is
 * an endpoint the person runs themselves (Ollama, LM Studio, a self-hosted
 * server), so it alone has a base URL.
 *
 * @deprecated since 1.1; stops working in 3.0. Use `RunProviderDescriptor` instead.
 */
export const CREDENTIAL_PROVIDERS = ['openrouter', 'openai', 'google', 'anthropic', 'openai_compatible'] as const
export type CredentialProvider = (typeof CREDENTIAL_PROVIDERS)[number]

/**
 * The one model credential a run is given (spec §6.3). An API key is passed
 * to the runtime as an environment variable; a subscription login is the
 * Claude Code OAuth credentials document, written into the run's own Claude
 * home by the site. Never both, and never neither-but-empty: a run with no
 * usable credential gets `null` and fails saying so.
 *
 * Every credential names its provider. A subscription is Anthropic's only.
 * `baseUrl` is set for `openai_compatible` and absent for every other
 * provider; an endpoint that needs no key carries `apiKey: ''`.
 *
 * @deprecated since 1.1; stops working in 3.0. Use `RunProviderDescriptor` instead.
 */
export type RunCredential =
  | { kind: 'apiKey'; provider: CredentialProvider; apiKey: string; baseUrl?: string }
  | SubscriptionRunCredential

/**
 * A subscription login handed to a run. hq records each hand-over as a grant
 * and names it here, so a token the harness refreshes during the run can be
 * reported back against that grant (`SubscriptionRefreshedEvent`).
 *
 * - `grantId` names this one hand-over: to this site, for this run.
 * - `loginId` names the stored sign-in the document came from. It is the same
 *   for every run handed that login and changes when someone signs in again,
 *   so the site can tell which harness homes hold copies of one login.
 *
 * @deprecated since 1.1; stops working in 3.0. Use `RunProviderDescriptor` instead.
 */
export type SubscriptionRunCredential = {
  kind: 'subscription'
  provider: 'anthropic'
  oauthJson: string
  grantId: string
  loginId: string
}

/**
 * An API-key credential: the only kind the site's model relay adds to a request (spec §6).
 *
 * @deprecated since 1.1; stops working in 3.0. Use `RunProviderDescriptor` instead.
 */
export type ApiKeyRunCredential = Extract<RunCredential, { kind: 'apiKey' }>
