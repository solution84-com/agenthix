/**
 * The one resolver (models from one place, part 4): every model, speech-to-text and text-to-speech call asks it which
 * model via which provider to use, on which runtime, and on what basis its cost is written — or gets one problem
 * naming what is missing and who adds it. Memory search never asks: it always uses hq's built-in embedding model.
 *
 * `decide.ts` is the rule, `snapshot.ts` what it reads, `reaching.ts` how a resolution is reached.
 */
import type { ModelViaProvider, ResolveAnswer, ResolveRequest } from '@agenthix/core'
import type { ModelErrorKind } from '../conversations/contract'
import { reportOutcome } from '../providers/health'
import { Logger } from '../server/utils/logger'
import { decide, sameModelElsewhere, usableModels, whyUnusable } from './decide'
import { readSnapshot } from './snapshot'

const logger = new Logger('Resolver')

export async function resolve(req: ResolveRequest): Promise<ResolveAnswer> {
  return decide(req, await readSnapshot(req))
}

/**
 * What a conversation fixed to a model that cannot be used now is offered: the same model via another provider, else
 * the conversation default as a new conversation would get it. Null when nothing else may run: the person picks.
 */
export async function conversationOffer(req: ResolveRequest & { conversationId: string }): Promise<ModelViaProvider | null> {
  const snap = await readSnapshot(req)
  if (!snap.conversationModel || !whyUnusable(snap.conversationModel, req, snap)) return null
  const same = sameModelElsewhere(snap.conversationModel, req, snap)
  if (same) return same
  const fresh = decide(req, { ...snap, conversationModel: null })
  return fresh.ok ? fresh.resolution.model : null
}

/** Every model via a provider the request may run on: what a picker offers. */
export async function choicesFor(req: ResolveRequest, typed: ReadonlyMap<string, readonly string[]> = new Map()) {
  const snap = await readSnapshot(req)
  return { snapshot: snap, usable: usableModels(req, snap, typed) }
}

/**
 * What a call to a provider came to, for its health (`providers/health.ts`). A cancel, or a request refused before it
 * was sent, says nothing about the provider;
 * a report that cannot be applied is logged and never fails the call it is about.
 */
export function reportCall(providerId: string, failure: ModelErrorKind | null, detail?: string): void {
  if (failure === 'cancelled' || failure === 'request') return
  const outcome = failure === null ? { ok: true as const } : { ok: false as const, kind: failure, ...(detail ? { detail } : {}) }
  void reportOutcome(providerId, outcome).catch(err => logger.warn(`Could not record a call's outcome: ${err instanceof Error ? err.message : String(err)}`))
}
