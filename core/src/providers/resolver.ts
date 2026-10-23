/**
 * The resolver's request and answer (part 4): one resolver in hq decides every call — conversation replies, titles and
 * summaries, handed-off work and task runs with their helpers, the voice sample phrase, speech to text and text to
 * speech. It answers the model via its provider, the runtime that runs it, the billing profile and the basis its cost
 * is written on; or one problem naming what is missing and who can add it. Memory search never asks: it always uses
 * hq's built-in embedding model.
 *
 * How it decides, in order:
 * 1. **Which models may run**: every model the providers that work reach, each as a model via a provider, narrowed
 *    by every allow and ban list that applies (the organisation's, the agent's, the project's, the person's). A ban
 *    beats an allow, and no list widens. A person's own Claude subscription is offered only in their own place.
 * 2. **Which one**: for a conversation, the person's pick, else the agent's default conversation model, else the
 *    organisation's; for work, the model the person's or the task's instruction names, else the agent's default
 *    worker model, else the organisation's. Titles and summaries use the conversation's model; the voice sample
 *    phrase the organisation's default conversation model. A choice that stops working falls to the next layer down,
 *    and says so once (`fellBack`).
 * 3. **Voice**: the agent's own STT or TTS provider, else the organisation's default.
 * 4. **The runtime**, for work only: a Claude model on an Anthropic key, a person's own Claude subscription or
 *    Agenthix Cloud runs on Claude Code; anything else on OpenCode.
 */
import type { AgentRuntimeName } from '../models/modelList.js'
import type { CostBasis, UsagePurpose } from '../billing/ledger.js'
import type { AiProviderVendor, ModelViaProvider } from './providers.js'

/**
 * Where a call is made. Only the lists and a person's own Claude subscription depend on it, and the billing profile:
 * a project's own, or the organisation's default for a person's own place and hq's own calls.
 * - `project`: a project shared with others, its task threads included;
 * - `own`: a person's own place, their space or one of their personal projects (`projectId` absent for the space);
 * - `organisation`: hq's own calls that belong to no place, such as the voice sample phrase.
 */
export type ResolvePlace =
  | { kind: 'project'; projectId: string }
  | { kind: 'own'; userId: string; projectId?: string }
  | { kind: 'organisation' }

export type ResolveRequest = {
  purpose: UsagePurpose
  place: ResolvePlace
  /** The agent the call is for; absent for hq's own calls that have none. */
  agentId?: string
  /** The person the call is on behalf of; their list applies. */
  userId?: string
  /** A conversation's call: titles and summaries take its model. */
  conversationId?: string
  /** A choice made for this call: the person's pick in a conversation, or the model an instruction names. */
  pick?: ModelViaProvider
}

/** Which layer the choice came from. */
export type ResolvedFrom = 'pick' | 'conversation' | 'agent' | 'organisation'

export type Resolution = {
  purpose: UsagePurpose
  model: ModelViaProvider
  /** The provider as it is named now, for words and for the ledger row. */
  providerName: string
  vendor: AiProviderVendor
  /** For model calls run by a runtime (work); null for hq's own calls and for voice. */
  runtime: AgentRuntimeName | null
  /** For text to speech: the voice the agent speaks in. */
  voice?: string
  from: ResolvedFrom
  /** The choice that stopped working and what was used instead, said once. */
  fellBack?: { from: ModelViaProvider; reason: ResolveProblemCode }
  /** The basis the call's cost is written on: `AWAITING_ACTUAL` or `ESTIMATED` through Cloud, `INCLUDED` on a subscription. */
  basis: CostBasis
  billingProfileId: string
}

/**
 * What is missing:
 * - `no_provider`: no provider of the type that works (an organisation admin adds one);
 * - `provider_not_working`: the provider of a choice fixed to a conversation does not work (organisation admins were told);
 * - `no_allowed_model`: every model the providers reach is cut by a list (an organisation admin can widen one);
 * - `model_not_allowed`: the pick is cut by a list;
 * - `model_not_reached`: the pick's provider no longer reaches it, or the provider is gone;
 * - `no_default`: nothing chosen at any layer and nothing allowed to fall to;
 * - `subscription_outside_own_place`: a person's own Claude subscription asked for outside their own place;
 * - `cap_reached`: Agenthix Cloud's spending limit for the profile or the organisation (rule 7, a refusal of its own).
 */
export const RESOLVE_PROBLEM_CODES = [
  'no_provider', 'provider_not_working', 'no_allowed_model', 'model_not_allowed', 'model_not_reached', 'no_default',
  'subscription_outside_own_place', 'cap_reached',
] as const
export type ResolveProblemCode = (typeof RESOLVE_PROBLEM_CODES)[number]

/** Who can put it right: an organisation admin, who manages providers, models and lists; or the person asking. */
export type ResolveProblemFixer = 'organisation_admin' | 'person'

export type ResolveProblem = {
  code: ResolveProblemCode
  /**
   * The problem in words, naming what is missing and who adds it: *No model Kernel may use is reached by Fernhill's
   * providers. An organisation admin can widen Kernel's allow list, or add a provider.*
   */
  message: string
  fixedBy: ResolveProblemFixer[]
  /** The provider at fault, when there is one. */
  providerId?: string
  /** For `cap_reached`: when the limit resets, ISO. */
  resetsAt?: string
}

export type ResolveAnswer = { ok: true; resolution: Resolution } | { ok: false; problem: ResolveProblem }
