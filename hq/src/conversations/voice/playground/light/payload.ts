/**
 * What the playground's page sends about the light model, checked as hq's voice handlers check a `listen`
 * (voice/handlers.ts `listenPayloadOf`, which this mirrors: that module loads hq's whole voice service, which the
 * playground does not run) and the light model's settings as the page has them.
 */
import { MESSAGE_MAX_CHARS } from '../../../../shared/conversations/protocol'
import type { PlaygroundLead } from '../../../../shared/voicePlayground'
import type { PlaygroundLightConfig } from '../../../../shared/voicePlaygroundLight'
import type { ListenerSettingsChange } from '../../listener/settings'
import type { ListenPayload } from '../../listening/listen'
import { isHumTone, type HumTone, type SteeringChanges } from '../../../voiceClient/backchannel/kinds'

const MOMENTS: ReadonlySet<unknown> = new Set(['quietAfterWords', 'soundsFinished', 'quiet', 'working'])
const MAX_MS = 3_600_000
const MODEL_MAX_CHARS = 300
const STEERING_MAX_CHARS = 200

export function field(payload: unknown, name: string): unknown {
  return payload && typeof payload === 'object' ? (payload as Record<string, unknown>)[name] : undefined
}

function ms(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.min(value, MAX_MS) : null
}

export function listenPayloadFrom(payload: unknown): ListenPayload | null {
  const seq = field(payload, 'seq')
  const moment = field(payload, 'moment')
  const text = field(payload, 'text') ?? ''
  const quietMs = ms(field(payload, 'quietMs') ?? 0)
  if (typeof seq !== 'number' || !Number.isSafeInteger(seq) || !MOMENTS.has(moment)) return null
  if (typeof text !== 'string' || text.length > MESSAGE_MAX_CHARS || quietMs === null) return null
  const workingMs = ms(field(payload, 'workingMs'))
  return {
    seq, moment: moment as ListenPayload['moment'], text, quietMs,
    ...(workingMs !== null ? { workingMs } : {}), ...(field(payload, 'keptOpen') === true ? { keptOpen: true } : {}),
  }
}

export const LIGHT_OFF: PlaygroundLightConfig = {
  on: false, model: null, settings: {}, lead: { kind: 'fake', delayMs: 1_500 }, adaptiveVoice: true, lineDirection: 'plain',
  humModel: null, humSteering: {},
}

function leadOf(value: unknown): PlaygroundLead | null {
  if (field(value, 'kind') === 'fake') {
    const delayMs = field(value, 'delayMs')
    return { kind: 'fake', delayMs: typeof delayMs === 'number' && Number.isFinite(delayMs) ? delayMs : 1_500 }
  }
  const model = field(value, 'model')
  return field(value, 'kind') === 'model' && typeof model === 'string' && model.length <= MODEL_MAX_CHARS ? { kind: 'model', model } : null
}

/** The tones' steering the page changed: each a known tone, to a short bracketed direction. */
export function steeringFrom(value: unknown): SteeringChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((e): e is [HumTone, string] => isHumTone(e[0]) && typeof e[1] === 'string' && /^\[[^\]]+\]$/.test(e[1].trim()) && e[1].length <= STEERING_MAX_CHARS)
    .map(([tone, steering]) => [tone, steering.trim()]))
}

/** The page's light model settings, made safe; the numbers are held within their limits where they are used. */
export function lightConfigFrom(payload: unknown): PlaygroundLightConfig {
  const model = field(payload, 'model')
  const humModel = field(payload, 'humModel')
  const settings = field(payload, 'settings')
  return {
    on: field(payload, 'on') === true,
    model: typeof model === 'string' && model && model.length <= MODEL_MAX_CHARS ? model : null,
    settings: settings && typeof settings === 'object' && !Array.isArray(settings) ? settings as ListenerSettingsChange : {},
    lead: leadOf(field(payload, 'lead')) ?? LIGHT_OFF.lead,
    adaptiveVoice: field(payload, 'adaptiveVoice') !== false,
    lineDirection: field(payload, 'lineDirection') === 'stored' ? 'stored' : 'plain',
    humModel: typeof humModel === 'string' && humModel && humModel.length <= MODEL_MAX_CHARS ? humModel : null,
    humSteering: steeringFrom(field(payload, 'humSteering')),
  }
}
