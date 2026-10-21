/**
 * The one credential a run may use (spec §6.3, adr-0105). A credential belongs
 * to the org, a person or a project, and is an API key or a subscription login.
 * A run tries, in order:
 *
 *   in a project       → the project's, then its person's own, then the org's
 *   in a person's own  → that person's, then the org's
 *
 * The person is the one the run is on behalf of (adr-0095): whoever started it,
 * or the task's or the routine's person for a run nobody started. The project
 * comes first because an organisation that gives a project its own key has
 * chosen to pay for that project's work.
 *
 * Resolution is per provider (spec §6): the run's model names its provider —
 * always Anthropic on the Claude SDK runtime, the model id's `<provider>/`
 * prefix on OpenCode — and each owner is asked for that provider's credential
 * only. A model naming no provider hq holds keys for resolves to nothing, with
 * a problem saying so.
 *
 * Within one owner the subscription is used while it is usable, else the API
 * key. A subscription is Anthropic's only, supplied only to the Claude SDK
 * runtime — OpenCode takes an API key — and only once its `termsAcceptedAt` is
 * recorded. The org's, and a project's, are usable only while the org has
 * exactly one person: with several they stay stored and are skipped, and the
 * count is read here each time, never stored. In a development build,
 * `HQ_DEV_SHARED_SUBSCRIPTION` lifts that rule (sharedSubscriptionSwitch.ts),
 * so one developer can test several people's task runs on one login. API keys
 * are not subject to that rule. The org's API keys are `Provider` rows, one per provider
 * (providerService.ts), not `ModelCredential`s. An OpenAI-compatible
 * endpoint's credential is its base URL and, if it needs one, a key; stored
 * without a key it resolves to `apiKey: ''`.
 *
 * A person's own login is handed only to a run on their behalf that runs in
 * their own harness home on the site — `runnerPersonId` is them. The site
 * writes a login into the home of the run's runner, and a task's run in a
 * project runs as the project, in a home every task in that project shares
 * (adr-0074, adr-0075), so a person's login there would reach other people's
 * runs. Such a run uses the person's own API key, which never enters a home:
 * the site's model relay adds it to each request. Both ids are checked here,
 * so this function stays safe whatever its caller passes: a wrong or missing
 * id can only narrow what is used, never hand one person's login to another.
 *
 * With nothing usable the result carries `problem`, a sentence saying what to
 * do (and what was skipped and why), which the run's error shows.
 */
import { prisma } from 'wasp/server'
import type { ModelCredentialOwnerType } from '@prisma/client'
import type { CredentialProvider, RunCredential } from '@agenthix/core'
import { BRANDING } from '@agenthix/core'
import { decryptStoredSecret } from '../server/crypto/secretCrypto'
import { CLAUDE_SDK_RUNTIME } from '../agents/models'
import type { OverrideBoundary } from '../agents/overrides/agentOverrideService'
import { CREDENTIAL_PROVIDERS, PROVIDER_LABELS, isCredentialProvider } from '../shared/modelProviders'
import { countOrgPeople } from '../server/identity/orgPeople'
import { sharedSubscriptionAllowedForTesting } from './sharedSubscriptionSwitch'
import { grantSubscription, type GrantTarget, type UngrantedSubscription } from '../sites/subscriptionGrants'
import { readApiKey } from './apiKeys'

/**
 * A subscription is granted only when the caller names where the run goes (`grantTo`); a caller that dispatches
 * nothing is told which one it would be, ungranted.
 */
export type ResolvedCredential = RunCredential | UngrantedSubscription
export type CredentialResolution = { credential: ResolvedCredential | null; problem: string | null }

/** Who a run is for, as the credential order needs it. */
export type RunPerson = {
  /** The person the run is on behalf of (adr-0095), or null for a run on behalf of nobody. */
  personId: string | null
  /** The person whose harness home the run executes in — its runner, when that is a person — or null when it runs as a project. */
  runnerPersonId: string | null
}

/** A run in the person's own home: their own Chat, or their own conversation in a project. */
export const runInOwnHome = (userId: string): RunPerson => ({ personId: userId, runnerPersonId: userId })

/**
 * Which provider's credential a run on this runtime and model needs, or null
 * when the model names none hq holds keys for. OpenCode addresses a model as
 * `<provider>/<model>`, and that prefix is the provider.
 */
export function providerOfModel(runtime: string, model: string): CredentialProvider | null {
  if (runtime === CLAUDE_SDK_RUNTIME) return 'anthropic'
  const slash = model.indexOf('/')
  if (slash <= 0) return null
  const prefix = model.slice(0, slash)
  return isCredentialProvider(prefix) ? prefix : null
}

const SEVERAL_PEOPLE = 'because the organisation has more than one person'
const OWN_LOGIN_NOT_IN_PROJECT_HOME =
  "Your own Claude login is not used for a task's runs in a project: they run as the project, in a place " +
  "everyone's tasks there share. Your own API key is used for them, or your login in a conversation."

const YOUR_LOGINS = 'Settings › Your model logins'
const ORG_ACCESS = 'Organisation › Settings › Model access'
const PROJECT_ORDER =
  "A run in a project uses the project's own model access first, then the person it is for — their own " +
  "Claude login, then their own API key — then the organisation's."

function nothingUsable(provider: CredentialProvider, where: 'user' | 'project' | 'org'): string {
  if (provider === 'anthropic') {
    return {
      user: `Add your own Claude login or API key under ${YOUR_LOGINS}, or ask an admin to set the organisation's API key (${ORG_ACCESS}).`,
      project:
        `${PROJECT_ORDER} Add your own Claude login or API key under ${YOUR_LOGINS}, ask a project admin to set ` +
        `this project's API key on its settings, or an admin the organisation's under ${ORG_ACCESS}.`,
      org: `An admin sets the organisation's API key under ${ORG_ACCESS}.`,
    }[where]
  }
  const what = provider === 'openai_compatible' ? 'OpenAI-compatible endpoint' : `${PROVIDER_LABELS[provider]} API key`
  return {
    user: `Add your own ${what} under ${YOUR_LOGINS}, or ask an admin to set the organisation's (${ORG_ACCESS}).`,
    project:
      `${PROJECT_ORDER} Add your own ${what} under ${YOUR_LOGINS}, ask a project admin to set this project's ` +
      `on its settings, or an admin the organisation's under ${ORG_ACCESS}.`,
    org: `An admin sets the organisation's ${what} under ${ORG_ACCESS}.`,
  }[where]
}

/**
 * `grantTo` names where the run is going. When it is given, a subscription
 * handed out is recorded as a grant to that site (subscriptionGrants.ts), so a
 * token the harness refreshes during the run can come back to hq. Without it
 * nothing is recorded, which is right for a caller that dispatches nothing.
 */
export async function resolveRunCredential(
  boundary: OverrideBoundary | null,
  person: RunPerson | null,
  runtime: string,
  model: string,
  grantTo?: GrantTarget,
): Promise<CredentialResolution> {
  const provider = providerOfModel(runtime, model)
  if (!provider) {
    return {
      credential: null,
      problem:
        `The model '${model}' does not name a provider ${BRANDING.displayName} holds keys for. On OpenCode a model is ` +
        `written <provider>/<model>, the provider one of ${CREDENTIAL_PROVIDERS.join(', ')}; change it in the agent's settings.`,
    }
  }

  const skipped: string[] = []
  let people: Promise<number> | null = null
  const peopleInOrg = () => (people ??= countOrgPeople())

  async function subscriptionOf(ownerType: ModelCredentialOwnerType, ownerId: string): Promise<ResolvedCredential | null> {
    if (runtime !== CLAUDE_SDK_RUNTIME || provider !== 'anthropic') return null
    const row = await prisma.modelCredential.findUnique({
      where: { ownerType_ownerId_provider_kind: { ownerType, ownerId, provider: 'anthropic', kind: 'SUBSCRIPTION' } },
    })
    // No recorded acceptance, no use: the person accepts the provider's terms
    // before their credential is supplied.
    if (!row || !row.termsAcceptedAt) return null
    if (ownerType === 'user' && !(person?.personId === ownerId && person.runnerPersonId === ownerId)) {
      if (boundary?.type === 'project') skipped.push(OWN_LOGIN_NOT_IN_PROJECT_HOME)
      return null
    }
    if (ownerType !== 'user' && !sharedSubscriptionAllowedForTesting() && (await peopleInOrg()) !== 1) {
      skipped.push(`The ${ownerType === 'org' ? 'organisation' : 'project'}'s Claude subscription is not used ${SEVERAL_PEOPLE}.`)
      return null
    }
    const oauthJson = decryptStoredSecret(row.secret, 'model credential')
    if (!oauthJson) return null
    const credential: UngrantedSubscription = { kind: 'subscription', provider: 'anthropic', oauthJson }
    return grantTo
      ? grantSubscription(credential, { credentialId: row.id, signedInAt: row.termsAcceptedAt }, grantTo)
      : credential
  }

  async function apiKeyOf(ownerType: ModelCredentialOwnerType, ownerId: string, p: CredentialProvider): Promise<RunCredential | null> {
    const key = await readApiKey(ownerType, ownerId, p)
    return key ? { kind: 'apiKey', ...key } : null
  }

  const turn = async (ownerType: ModelCredentialOwnerType, ownerId: string) =>
    (await subscriptionOf(ownerType, ownerId)) ?? (await apiKeyOf(ownerType, ownerId, provider))

  // The person whose own login and key the run may use. Only its owner runs in
  // a person's own storage (core's runnerBoundaryMismatch), so a run there is
  // theirs; any other person named there is refused rather than paid for by
  // the storage's owner. A run with no boundary uses only the org's.
  const personId = person?.personId ?? null
  const payingPerson =
    boundary?.type === 'project' ? personId
    : boundary?.type === 'user' && (personId === null || personId === boundary.id) ? boundary.id
    : null

  const ownTurn = async (): Promise<ResolvedCredential | null> =>
    boundary?.type === 'project' ? turn('project', boundary.id) : null
  const personTurn = async (): Promise<ResolvedCredential | null> =>
    payingPerson ? turn('user', payingPerson) : null

  const credential = (await ownTurn()) ?? (await personTurn()) ?? (await turn('org', 'org'))
  if (credential) return { credential, problem: null }

  const action = nothingUsable(provider, boundary?.type ?? 'org')
  return { credential: null, problem: [...skipped, action].join(' ') }
}
