/**
 * Which access pays for a conversation's turn, and on which model it talks (model access and policy spec).
 *
 * With no talking model fixed yet, it is chosen from the effective policy: its talking model, the same model
 * through another access, then the other models it allows, the first whose provider the home's payers hold a
 * key for. When that is another model than the preferred one, `notice` says so once, for the record. With a
 * talking model fixed, only its provider is tried: the recorded owner's key, then the home's order. When no key
 * for it is usable, `access` is null, `problem` says what is missing and where to add it, and `offer` is the next
 * usable access — the switch is the person's to make (talkingModelSwitch.ts).
 */
import type { AccessOwner, ConversationHomeRef, EffectiveModelPolicy, ModelProvider, ResolveConversationAccess, ResolvedAccess } from '../contract'
import { resolveModelPolicy } from '../../model-policy/modelPolicyService'
import { policyModelLabel, providerOfPolicyModel } from '../../model-policy/policyModels'
import { PROVIDER_LABELS } from '../../shared/modelProviders'
import { sameModelKey, talkingRoutes } from './modelRoutes'
import {
  homeAccess, isRefused, missingAccess, payerAccess, payerLabel, payingAccess, type HomeAccess, type RefusedAccess,
} from './homeAccess'
import { storedRefusals } from './refusedAccess'

type Choice = { access: ResolvedAccess | null; preferred: string }

/**
 * The first talking route whose provider the home's payers hold a key for: the policy's talking model, the same
 * model through another access, then the next model the policy allows (modelRoutes.ts, talkingRoutes).
 */
async function chooseTalking(home: HomeAccess, policy: EffectiveModelPolicy, refused: readonly RefusedAccess[]): Promise<Choice> {
  const reached = new Map<ModelProvider, ResolvedAccess | null>()
  for (const route of talkingRoutes(policy)) {
    if (!reached.has(route.provider)) reached.set(route.provider, await payingAccess(home.payers, route.provider, route.value, refused))
    const access = reached.get(route.provider)
    if (access) return { access: { ...access, model: route.value }, preferred: policy.talking }
  }
  return { access: null, preferred: policy.talking }
}

function fallbackNotice(preferred: string, access: ResolvedAccess): string {
  return `${policyModelLabel(preferred)} isn't available with the model access here, so this conversation talks on ` +
    `${policyModelLabel(access.model)}, on ${payerLabel(access.owner)} ${PROVIDER_LABELS[access.provider]} key.`
}

function payerChangeNotice(fixed: { provider: ModelProvider; owner: AccessOwner }, access: ResolvedAccess): string {
  const label = PROVIDER_LABELS[fixed.provider]
  const was = payerLabel(fixed.owner)
  return `${was.charAt(0).toUpperCase()}${was.slice(1)} ${label} key this conversation talked on is no longer available, ` +
    `so it now talks on ${payerLabel(access.owner)} ${PROVIDER_LABELS[access.provider]} key.`
}

/**
 * `refused`, when the provider refused the key the conversation talks on (its last turn failed with `auth`):
 * that key is treated as gone, even though it is still stored, and is never the offer. Keys refused before, and
 * switched away from, are stored on the conversation and never used again (refusedAccess.ts).
 *
 * With a talking model fixed, the turn pays with the recorded owner's key while it is usable; only when that key
 * is gone does it fall back in the home's order, with `notice` saying so once.
 */
export async function resolveConversationAccess(
  conversation: ConversationHomeRef,
  fixed: { model: string; provider: ModelProvider; owner?: AccessOwner } | null,
  refused: RefusedAccess | null = null,
): ReturnType<ResolveConversationAccess> {
  const [home, stored] = await Promise.all([homeAccess(conversation), storedRefusals(conversation.id)])
  const policy = await resolveModelPolicy(home.policyBoundary, home.agent)
  const excluded = refused ? [...stored, refused] : stored

  if (!fixed) {
    const { access, preferred } = await chooseTalking(home, policy, excluded)
    if (!access) {
      return { access: null, problem: missingAccess(home.home, providerOfPolicyModel(preferred) ?? 'anthropic'), offer: null }
    }
    // The same model through another access is no fallback: nothing to say.
    const notice = sameModelKey(access.model) === sameModelKey(preferred) ? undefined : fallbackNotice(preferred, access)
    return { access, problem: null, offer: null, notice }
  }

  if (!refused) {
    const recorded = fixed.owner ? home.payers.find(p => p.type === fixed.owner) : undefined
    if (recorded && !isRefused(excluded, recorded.type, fixed.provider)) {
      const access = await payerAccess(recorded, fixed.provider, fixed.model)
      if (access) return { access, problem: null, offer: null }
    }
    const access = await payingAccess(home.payers, fixed.provider, fixed.model, excluded)
    if (access) {
      const notice = fixed.owner && access.owner !== fixed.owner
        ? payerChangeNotice({ provider: fixed.provider, owner: fixed.owner }, access)
        : undefined
      return { access, problem: null, offer: null, notice }
    }
  }
  const label = PROVIDER_LABELS[fixed.provider]
  const gone = refused
    ? `${label} refused ${payerLabel(refused.owner)} ${label} key this conversation talks on.`
    : `The ${label} key this conversation talks on is no longer available.`
  // The same model on another payer's key first, so a refused key changes who pays rather than the model.
  const sameModel = refused ? await payingAccess(home.payers, fixed.provider, fixed.model, excluded) : null
  const offer = sameModel ?? (await chooseTalking(home, policy, excluded)).access
  return { access: null, problem: `${gone} ${missingAccess(home.home, fixed.provider)}`, offer }
}
