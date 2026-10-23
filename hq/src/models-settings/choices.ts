/**
 * The models settings' choices (models from one place, part 4): a default or an agent's own, each a model via a
 * provider, or a provider with its speech model and voice. Read for the screens in words, and checked on the server
 * before they are saved: a choice a provider cannot serve, or a list rules out, is refused whatever the screen sent.
 */
import { HttpError } from 'wasp/server'
import {
  STT_PRICES_PER_HOUR_MICROS, TTS_PRICES_PER_MILLION_CHARS_MICROS, providerStateWorks, providerTypesOf,
  type ModelViaProvider, type ResolveRequest, type VoiceViaProvider,
} from '@agenthix/core'
import { choiceValue, parseChoiceValue } from '../conversations/access/talkingModel'
import { whyUnusable, type RouteProvider, type Snapshot } from '../routing/decide'
import { modelLabel } from '../routing/modelKeys'
import { LISTENING_MODELS, VOICE_TTS_MODEL } from '../voice/voiceModels'
import type { ChoiceView, ModelInput, VoiceInput, VoiceProviderOption } from './types'

export const VOICE_MAX_CHARS = 100

/** Speech is the one model voice is built on; listening is one of the live models, all priced. */
export function modelsOfVoice(vendor: string, type: 'stt' | 'tts'): string[] {
  if (type === 'tts') return vendor in TTS_PRICES_PER_MILLION_CHARS_MICROS ? [VOICE_TTS_MODEL] : []
  const live: readonly string[] = LISTENING_MODELS.map(m => m.model)
  return Object.keys(STT_PRICES_PER_HOUR_MICROS[vendor] ?? {}).filter(m => live.includes(m))
}

/** What a person reads when a speech model other than the ones voice is built on is sent. */
function onlyModelsWords(type: 'stt' | 'tts', providerName: string): string {
  if (type === 'tts') return 'Voice speaks with Inworld TTS 2 only.'
  const labels = LISTENING_MODELS.map(m => m.label)
  return `${providerName} listens with ${labels.slice(0, -1).join(', ')} or ${labels[labels.length - 1]}.`
}

export function voiceOptions(providers: readonly RouteProvider[], type: 'stt' | 'tts'): VoiceProviderOption[] {
  return providers
    .filter(p => p.ownerUserId === null && providerTypesOf(p.vendor).includes(type))
    .map(p => ({ providerId: p.id, name: p.name, state: p.state, models: modelsOfVoice(p.vendor, type) }))
}

/** A speech model in words: *Inworld TTS 2*, *Universal-3 Pro, 32 languages*; one not known is shown as it is named. */
export function speechModelLabel(model: string): string {
  if (model === VOICE_TTS_MODEL) return 'Inworld TTS 2'
  const listening = LISTENING_MODELS.find(m => m.model === model)
  return listening ? `${listening.label}, ${listening.languages}` : model
}

/** A choice in words: `Claude Sonnet 5 · via Anthropic`, or a speech model with its voice. */
export function viewChoice(choice: (ModelViaProvider & { voice?: string }) | null, snap: Pick<Snapshot, 'providers'>, speech = false): ChoiceView | null {
  if (!choice) return null
  const p = snap.providers.find(x => x.id === choice.providerId)
  if (!p) return null
  const what = speech ? speechModelLabel(choice.model) : modelLabel(p.vendor, choice.model)
  const text = `${what}${choice.voice ? ` · ${choice.voice}` : ''} · via ${p.name}`
  return { ...choice, text, notWorking: !providerStateWorks(p.state) }
}

export const WHY: Record<string, string> = {
  model_not_reached: "That provider doesn't reach that model.",
  provider_not_working: "That provider isn't working, so it can't be chosen now.",
  model_not_allowed: 'A list that applies rules that model out.',
  subscription_outside_own_place: 'A Claude subscription is only for its owner’s own place.',
}

/** A model via a provider a form sent, checked against what the request may run; the choice, or a refusal. */
export function checkModel(value: Exclude<ModelInput, null>, req: ResolveRequest, snap: Snapshot): ModelViaProvider {
  const choice = parseChoiceValue(value)
  if (!choice) throw new HttpError(400, 'Choose a model')
  const why = whyUnusable(choice, req, snap)
  if (why) throw new HttpError(400, WHY[why.code] ?? 'That model cannot be used here')
  return choice
}

/** A speech choice a form sent: a provider of the right type that works, with a model it offers. */
export function checkVoice(input: Exclude<VoiceInput, null>, type: 'stt' | 'tts', req: ResolveRequest, snap: Snapshot): VoiceViaProvider {
  const p = snap.providers.find(x => x.id === input?.providerId)
  if (!p || p.ownerUserId !== null || !providerTypesOf(p.vendor).includes(type)) {
    throw new HttpError(400, `Choose a ${type === 'stt' ? 'speech to text' : 'text to speech'} provider`)
  }
  if (!providerStateWorks(p.state)) throw new HttpError(400, WHY.provider_not_working)
  const known = modelsOfVoice(p.vendor, type)
  const model = typeof input.model === 'string' ? input.model : ''
  if (known.length > 0 && !known.includes(model)) throw new HttpError(400, onlyModelsWords(type, p.name))
  const voice = type === 'tts' && typeof input.voice === 'string' ? input.voice.trim() : ''
  if (voice.length > VOICE_MAX_CHARS) throw new HttpError(400, 'That voice name is too long')
  void req
  return { providerId: p.id, model, ...(voice ? { voice } : {}) }
}

export { choiceValue }
