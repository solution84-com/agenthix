/**
 * Speech to text and text to speech, resolved like a model (models from one place, part 4): the agent's own choice,
 * else the organisation's default, else the other provider of the type when that one is not working. The key comes
 * from the provider store and goes no further than the call that needs it. What each call came to is reported to the
 * provider's health.
 */
import { providerTypesOf, type ResolvePlace } from '@agenthix/core'
import type { ModelErrorKind } from '../conversations/contract'
import { providerStore } from '../providers/store'
import { resolve } from '../routing/resolver'
import { costingOf } from '../billing/costing'
import type { CallCosting } from '../billing/types'
import { HEARING_VENDORS } from './voiceModels'

export type SpeechKind = 'stt' | 'tts'

const WORDS: Record<SpeechKind, string> = { stt: 'speech to text', tts: 'text to speech' }
/** The vendors hq reaches for each kind: listening through Inworld or AssemblyAI, speech through Inworld. */
const VENDORS: Record<SpeechKind, readonly string[]> = { stt: HEARING_VENDORS, tts: ['inworld'] }

/** What a person sees when no provider of the type works: an outage, and who has been told. */
export function voiceDownText(kind: SpeechKind): string {
  return `Voice is down: ${WORDS[kind]} isn't working. An organisation admin has been told.`
}

/** What a person sees when no provider of the type was ever added: nothing broke, it was left for later (ADR-0160). */
export function voiceNotSetUpText(kind: SpeechKind): string {
  return `Voice isn't set up: no ${WORDS[kind]} provider has been added. An organisation admin can add one.`
}

/** Down when a provider of the type was added and none works; not set up when none was ever added. */
export async function noSpeech(kind: SpeechKind): Promise<{ ok: false; reason: string }> {
  const added = (await providerStore().list()).some(p => providerTypesOf(p.vendor).includes(kind))
  return { ok: false, reason: added ? voiceDownText(kind) : voiceNotSetUpText(kind) }
}

export interface SpeechAccess {
  providerId: string
  providerName: string
  vendor: string
  model: string
  /** For text to speech: the voice the agent or the organisation chose. */
  voice: string | null
  apiKey: string
  /** What its calls are costed to (billing/). */
  costing: CallCosting
}

export type SpeechAnswer = { ok: true; access: SpeechAccess } | { ok: false; reason: string }

/** Whose call it is and where: a conversation's place costs its project's billing profile; none costs the organisation's. */
export type SpeechScope = {
  place?: ResolvePlace; userId?: string | null; conversationId?: string | null
  /** A provider named by the caller, used as it is or not at all: a voice list or a preview for the provider on screen. */
  pick?: { providerId: string; model: string }
}

/** The provider to use for speech to text or text to speech now; `reason` is what a person reads when there is none. */
export async function speechAccess(kind: SpeechKind, agentId?: string | null, scope: SpeechScope = {}): Promise<SpeechAnswer> {
  const req = {
    purpose: kind, place: scope.place ?? { kind: 'organisation' as const },
    ...(agentId ? { agentId } : {}),
    ...(scope.userId ? { userId: scope.userId } : {}),
    ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
    ...(scope.pick ? { pick: scope.pick } : {}),
  }
  const answer = await resolve(req)
  if (!answer.ok) return noSpeech(kind)
  const r = answer.resolution
  if (!VENDORS[kind].includes(r.vendor)) return noSpeech(kind)
  const credential = await providerStore().credentialOf(r.model.providerId)
  const apiKey = credential?.key?.trim() ?? ''
  if (!apiKey) return noSpeech(kind)
  return {
    ok: true,
    access: { providerId: r.model.providerId, providerName: r.providerName, vendor: r.vendor, model: r.model.model, voice: r.voice ?? null, apiKey, costing: costingOf(r, req) },
  }
}

/** The kind of failure a vendor's HTTP status or error message stands for. */
export function failureKind(status: number | null, message = ''): ModelErrorKind {
  const code = status ?? Number(/\b(401|402|403|429)\b/.exec(message)?.[1] ?? 0)
  if (code === 401 || code === 403) return 'auth'
  if (code === 402) return 'quota'
  if (code === 429) return 'rate-limit'
  return 'unavailable'
}
