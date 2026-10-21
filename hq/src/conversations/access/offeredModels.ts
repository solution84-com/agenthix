/**
 * The models a conversation's talking model may be picked from (model access and policy spec, *The person keeps
 * one knob*): every model a key in the home's paying order reaches, within the effective policy's allow-list and
 * ceiling, so nothing offered fails when chosen. Each provider is reached by the first payer holding its key and
 * not refused in this conversation (refusedAccess.ts); a pick records that payer, and the turns pay with it. A
 * model policy's form is offered models the same way, bounded by the layer above it.
 */
import { CREDENTIAL_PROVIDERS, isTypedModel, type CredentialProvider } from '@agenthix/core'
import type { AccessOwner, ConversationHomeRef, EffectiveModelPolicy } from '../contract'
import { ORG_POLICY_OWNER, readModelPolicy, resolveModelPolicy } from '../../model-policy/modelPolicyService'
import { homeAccess, payingAccess, type HomeAccess, type Payer, type RefusedAccess } from './homeAccess'
import { storedRefusals } from './refusedAccess'
import {
  catalogueFor, isWithinPolicyOnAnyRoute, routedModel, talkingRoutes, typedModelsNamedBy, type RoutedModel,
} from './modelRoutes'

export type OfferedModel = RoutedModel & { owner: AccessOwner }

/** Which payer reaches each provider: the first in the home's order holding a usable key for it. */
async function reachedProviders(home: Pick<HomeAccess, 'payers'>, refused: readonly RefusedAccess[]): Promise<Map<CredentialProvider, AccessOwner>> {
  const reached = await Promise.all(
    CREDENTIAL_PROVIDERS.map(async p => [p, (await payingAccess(home.payers, p, '', refused))?.owner ?? null] as const),
  )
  return new Map(reached.filter((r): r is readonly [CredentialProvider, AccessOwner] => r[1] !== null))
}

/** `typed`: the models an OpenAI-compatible endpoint reaches, being typed rather than catalogued. */
function modelsOn(provider: CredentialProvider, typed: string[]): RoutedModel[] {
  if (provider === 'openai_compatible') {
    return typed.map(routedModel).filter((m): m is RoutedModel => m !== null)
  }
  return catalogueFor(provider).map(m => ({ value: m.value, label: m.label, provider, costRank: m.costRank }))
}

type Bound = Pick<EffectiveModelPolicy, 'allowed' | 'ceiling'>

async function reachableWithin(home: Pick<HomeAccess, 'payers'>, bound: Bound, typed: string[], refused: readonly RefusedAccess[]): Promise<OfferedModel[]> {
  const reached = await reachedProviders(home, refused)
  const models: OfferedModel[] = []
  for (const [provider, owner] of reached) {
    for (const m of modelsOn(provider, typed)) {
      if (isWithinPolicyOnAnyRoute(m.value, bound)) models.push({ ...m, owner })
    }
  }
  return models
}

export type Offer = {
  models: OfferedModel[]
  /** What the conversation talks on when nothing is picked: the first talking route offered; null when none is. */
  preferred: string | null
}

export async function offeredModels(
  conversation: ConversationHomeRef,
  refused: RefusedAccess | null = null,
): Promise<Offer> {
  const [home, stored] = await Promise.all([homeAccess(conversation), storedRefusals(conversation.id)])
  const policy = await resolveModelPolicy(home.policyBoundary, home.agent)
  const models = await reachableWithin(home, policy, typedModelsNamedBy(policy), refused ? [...stored, refused] : stored)
  const offered = new Set(models.map(m => m.value))
  const preferred = talkingRoutes(policy).find(r => offered.has(r.value))?.value ?? null
  return { models, preferred }
}

/**
 * The models a model policy's form may name: those its boundary's keys reach, bounded only by the layer above —
 * the organisation's allow-list and ceiling for a person's or a project's, nothing for the organisation's own —
 * since the policy being edited is what sets the rest. The organisation's form reaches through the organisation's
 * keys alone, never the admin's own.
 */
export type PolicyFormScope = { type: 'org' } | { type: 'user'; userId: string } | { type: 'project'; projectId: string; userId: string }

export async function policyFormModels(scope: PolicyFormScope): Promise<OfferedModel[]> {
  const org = await readModelPolicy(ORG_POLICY_OWNER)
  const own = scope.type === 'org'
    ? org
    : await readModelPolicy(scope.type === 'user' ? { type: 'user', id: scope.userId } : { type: 'project', id: scope.projectId })
  const typed = [...new Set([org, own].flatMap(p => (p ? [p.talking, p.lightWork, p.heavyWork, ...(p.allowed ?? [])] : [])))]
    .filter((m): m is string => m !== null && isTypedModel(m))
  const payers: Payer[] = scope.type === 'org'
    ? [{ type: 'org', id: 'org' }]
    : scope.type === 'user'
      ? [{ type: 'user', id: scope.userId }, { type: 'org', id: 'org' }]
      : [{ type: 'project', id: scope.projectId }, { type: 'user', id: scope.userId }, { type: 'org', id: 'org' }]
  const bound: Bound = scope.type === 'org' || !org ? { allowed: null, ceiling: null } : { allowed: org.allowed, ceiling: org.ceiling }
  return reachableWithin({ payers }, bound, typed, [])
}
