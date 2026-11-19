/**
 * The playground's own settings: who answers in Live, the person's Adaptive voice as the playground has it (the switch
 * is the page's own, not the person's setting), and the listening family's numbers, to tune them live. Kept for this browser between visits when it can be; fine when not.
 *
 * The listening numbers are also kept in one object (`listening()`) that the voice session runs on: a slider moved
 * while voice is on changes it in place, and the listening component reads it at its next step.
 *
 * The light model (adaptive voice listening, plan tasks 5.1 and 5.2): Adaptive voice is the light model, as in the
 * product, so it has no switch of its own (an older kept `lightModel` is ignored); its model (none chosen: DeepSeek
 * Flash when offered, else hq's own choice), hq's caps and first values and the browser's timing.
 * The browser's timing is one object too (`listenerTiming()`), changed in place, so a change applies to the next check.
 * Its lines are spoken plainly, as hq speaks them, unless the stored phrases' direction is chosen to compare. The
 * backchannel's rules are one object too (`backchannel()`), changed in place, and so are adaptive pacing's (`pacing()`)
 * and barge-in's (`bargeIn()`).
 * Only these settings are kept: what pacing learns and the style asked for live in the page's memory, never here.
 */
import type { PlaygroundLead } from '../../../shared/voicePlayground'
import type { LineDirection } from '../../../shared/voicePlaygroundLight'
import { VOICE_SETTINGS, type VoiceSettings } from '../settings'
import type { ListenerSettings } from '../../voice/listener/settings'
import type { ListenerTiming } from '../listener/settings'
import { BACKCHANNEL_SETTINGS, readBackchannel, type BackchannelSettings } from '../backchannel/settings'
import { isHumTone, type SteeringChanges } from '../backchannel/kinds'
import { PACING_SETTINGS, readPacing, type PacingSettings } from '../pacing/settings'
import { readTone, TONE_SETTINGS, type ToneSettings } from '../tone/settings'
import { BARGE_IN_NUMBERS, readBargeIn, type BargeInNumbers } from './bargeInNumbers'
import { FIRST_LISTENER, OWN_TIMING, readListener, readOwnTiming, timingOf, type OwnTiming } from './lightTuning'

type Listening = VoiceSettings['listening']
/** The listening family's numbers: everything in its settings but the clips' wording. */
export type ListeningNumbers = Omit<Listening, 'hums' | 'acknowledging' | 'invitations' | 'directions'>

export type PlaygroundSettingsValue = {
  lead: PlaygroundLead
  adaptiveVoice: boolean
  listening: ListeningNumbers
  /** The light model as the picker names it; null until one is chosen. */
  listenerModel: string | null
  listener: ListenerSettings
  ownTiming: OwnTiming
  /** How the light model's own lines are spoken. */
  lineDirection: LineDirection
  /** The backchannel's rules. */
  backchannel: BackchannelSettings
  /** The hum service's model as the picker names it; null until one is chosen (DeepSeek Flash when offered). */
  humModel: string | null
  /** The tones' steering as changed in "Hear the sounds", for this page: voice starts with it. */
  humSteering: SteeringChanges
  /** Adaptive pacing's switch and numbers. */
  pacing: PacingSettings
  /** Tone: its switch and the voice profile's bars. */
  tone: ToneSettings
  /** When a reply talked over waits for the person's words. */
  bargeIn: BargeInNumbers
  /** The backchannel's first values this page took last (`BACKCHANNEL_VALUES`): older ones are reset once. */
  backchannelValues: number
}

export type PlaygroundSettings = {
  get: () => PlaygroundSettingsValue
  patch: (p: Partial<PlaygroundSettingsValue>) => void
  subscribe: (fn: () => void) => () => void
  /** The listening settings a voice session runs on: the same object while the page is open. */
  listening: () => Listening
  /** The light model's timing a voice session runs on: the same object while the page is open. */
  listenerTiming: () => ListenerTiming
  /** The backchannel's rules a voice session runs on: the same object while the page is open. */
  backchannel: () => BackchannelSettings
  /** Adaptive pacing's numbers a voice session runs on: the same object while the page is open. */
  pacing: () => PacingSettings
  /** Tone's settings a voice session runs on: the same object while the page is open. */
  tone: () => ToneSettings
  /** Barge-in's settings a voice session runs on, with the numbers tuned: the same object while the page is open. */
  bargeIn: () => VoiceSettings['bargeIn']
}

const KEY = 'voice-playground.settings'

const LISTENING_NUMBERS = Object.fromEntries(
  Object.entries(VOICE_SETTINGS.listening).filter(([, v]) => typeof v === 'number'),
) as ListeningNumbers

/**
 * The hum spacing and the sounds' steering moved after the owner's playtest of 19 Nov (hums 6 s apart, reactions 3 s,
 * never two in a row within 8 s; calm with no direction, no speed word). A page that kept the values from before takes
 * the new ones once, whatever it had chosen, with its steering changes cleared; after that, its choices are kept.
 */
export const BACKCHANNEL_VALUES = 2

export const DEFAULT_SETTINGS: PlaygroundSettingsValue = {
  lead: { kind: 'fake', delayMs: 1_500 }, adaptiveVoice: true, listening: LISTENING_NUMBERS,
  listenerModel: null, listener: FIRST_LISTENER, ownTiming: OWN_TIMING, lineDirection: 'plain',
  backchannel: BACKCHANNEL_SETTINGS, humModel: null, humSteering: {}, pacing: PACING_SETTINGS,
  tone: TONE_SETTINGS, bargeIn: BARGE_IN_NUMBERS, backchannelValues: BACKCHANNEL_VALUES,
}

function isLead(value: unknown): value is PlaygroundLead {
  const v = value as Partial<{ kind: unknown; delayMs: unknown; model: unknown }> | null
  return !!v && ((v.kind === 'fake' && typeof v.delayMs === 'number') || (v.kind === 'model' && typeof v.model === 'string'))
}

/** Each kept number that is a finite number; the default for the rest. */
function readListening(value: unknown): ListeningNumbers {
  const v = (value ?? {}) as Record<string, unknown>
  const out = { ...LISTENING_NUMBERS }
  for (const key of Object.keys(out) as (keyof ListeningNumbers)[]) {
    const n = v[key]
    if (typeof n === 'number' && Number.isFinite(n)) out[key] = n
  }
  return out
}

/**
 * The backchannel's first values moved after the owner's playtest (0.6 to 0.8 s and 9 s of speech became 0.4 to 1.2 s
 * and 4 s). A page that kept the old three untouched, as every change of setting keeps them all, takes the new ones;
 * any of them chosen otherwise is kept.
 */
function firstValuesMoved(value: unknown): unknown {
  const v = value as Partial<BackchannelSettings> | null | undefined
  if (v?.pauseMs !== 600 || v.latestPauseMs !== 800 || v.speechMs !== 9_000) return value
  const { pauseMs, latestPauseMs, speechMs } = BACKCHANNEL_SETTINGS
  return { ...v, pauseMs, latestPauseMs, speechMs }
}

function valuesMoved(value: Partial<PlaygroundSettingsValue> | null): Partial<PlaygroundSettingsValue> | null {
  if (!value || value.backchannelValues === BACKCHANNEL_VALUES) return value
  const kept = (firstValuesMoved(value.backchannel) ?? {}) as Partial<BackchannelSettings>
  const { speechMs, reactionSpeechMs, reactionGapSpeechMs } = BACKCHANNEL_SETTINGS
  return { ...value, backchannel: { ...kept, speechMs, reactionSpeechMs, reactionGapSpeechMs } as BackchannelSettings, humSteering: {} }
}

/** Kept steering: each a known tone, to a bracketed direction. */
function readSteering(value: unknown): SteeringChanges {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([tone, v]) => isHumTone(tone) && typeof v === 'string' && /^\[[^\]]+\]$/.test(v.trim())))
}

/** What was kept, made safe: anything of another shape falls back to the defaults. */
export function readSettings(raw: string | null): PlaygroundSettingsValue {
  try {
    const v = valuesMoved(JSON.parse(raw ?? 'null') as Partial<PlaygroundSettingsValue> | null)
    return {
      lead: isLead(v?.lead) ? v.lead : DEFAULT_SETTINGS.lead,
      adaptiveVoice: typeof v?.adaptiveVoice === 'boolean' ? v.adaptiveVoice : DEFAULT_SETTINGS.adaptiveVoice,
      listening: readListening(v?.listening),
      listenerModel: typeof v?.listenerModel === 'string' && v.listenerModel ? v.listenerModel : null,
      listener: readListener(v?.listener),
      ownTiming: readOwnTiming(v?.ownTiming),
      lineDirection: v?.lineDirection === 'stored' ? 'stored' : 'plain',
      backchannel: readBackchannel(firstValuesMoved(v?.backchannel)),
      humModel: typeof v?.humModel === 'string' && v.humModel ? v.humModel : null,
      humSteering: readSteering(v?.humSteering),
      pacing: readPacing(v?.pacing),
      tone: readTone(v?.tone),
      bargeIn: readBargeIn(v?.bargeIn),
      backchannelValues: BACKCHANNEL_VALUES,
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function createPlaygroundSettings(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): PlaygroundSettings {
  let value = readSettings(read(storage))
  const live: Listening = { ...VOICE_SETTINGS.listening, ...value.listening }
  const timing: ListenerTiming = timingOf(value.listener, value.ownTiming)
  const backchannel: BackchannelSettings = { ...value.backchannel }
  const pacing: PacingSettings = { ...value.pacing }
  const tone: ToneSettings = { ...value.tone }
  const bargeIn: VoiceSettings['bargeIn'] = { ...VOICE_SETTINGS.bargeIn, ...value.bargeIn }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    patch(p) {
      value = { ...value, ...p }
      Object.assign(live, value.listening)
      Object.assign(timing, timingOf(value.listener, value.ownTiming))
      Object.assign(backchannel, readBackchannel(value.backchannel))
      Object.assign(pacing, readPacing(value.pacing))
      Object.assign(tone, readTone(value.tone))
      Object.assign(bargeIn, readBargeIn(value.bargeIn))
      try { storage?.setItem(KEY, JSON.stringify(value)) } catch { /* not kept: fine */ }
      listeners.forEach(l => l())
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    listening: () => live,
    listenerTiming: () => timing,
    backchannel: () => backchannel,
    pacing: () => pacing,
    tone: () => tone,
    bargeIn: () => bargeIn,
  }
}

function read(storage: Pick<Storage, 'getItem'> | null): string | null {
  try { return storage?.getItem(KEY) ?? null } catch { return null }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}
