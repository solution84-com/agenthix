/**
 * The obligation an operation carries when the person authorised a sequence (conversation layer spec, Authorised
 * automatic continuation): the next step in the lead's words, the person and turn that authorised it, and its
 * depth. Every operation-returning tool takes an optional `then` and stores what this returns on the Operation.
 */
import { CONTINUATION_MAX_DEPTH, type ContinuationObligation } from '../../shared/conversations/protocol'
import type { TurnCapability } from '../contract'

/** Null when there is no next step, no person authorised it (a report turn), or the sequence is already at its depth. */
export function continuationFor(capability: TurnCapability, then: string | undefined | null): ContinuationObligation | null {
  const nextStep = then?.trim()
  if (!nextStep || !capability.actingUserId) return null
  const depth = (capability.continuationDepth ?? 0) + 1
  if (depth > CONTINUATION_MAX_DEPTH) return null
  return { authorisedById: capability.actingUserId, authorisingTurnId: capability.turnId, nextStep, depth }
}

/** The optional argument every operation-returning tool takes, described once. */
export const THEN_DESCRIPTION =
  'Only when the person has asked for a sequence ("check it, then fix it"): the next step to take when this work comes back. Leave out otherwise.'
