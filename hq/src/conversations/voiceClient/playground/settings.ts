/**
 * The playground's own settings: the mode shown, who answers in Live, the models Scenarios compares, the person's
 * Adaptive voice as the playground has it (the switch is the page's own, not the person's setting), and the listening
 * family's numbers, to tune them live. Kept for this browser between visits when it can be; fine when not.
 *
 * The listening numbers are also kept in one object (`listening()`) that the voice session runs on: a slider moved
 * while voice is on changes it in place, and the listening component reads it at its next step.
 */
import type { PlaygroundLead } from '../../../shared/voicePlayground'
import { VOICE_SETTINGS, type VoiceSettings } from '../settings'

type Listening = VoiceSettings['listening']
/** The listening family's numbers: everything in its settings but the clips' wording. */
export type ListeningNumbers = Omit<Listening, 'hums' | 'acknowledging' | 'invitations' | 'directions'>

export type PlaygroundMode = 'live' | 'scenarios'

export type PlaygroundSettingsValue = {
  mode: PlaygroundMode
  lead: PlaygroundLead
  /** The models Scenarios compares, as the model picker names them. */
  compare: string[]
  /** True once the person has added or removed a model there: until then Scenarios opens with the first two working ones. */
  compareChosen: boolean
  adaptiveVoice: boolean
  listening: ListeningNumbers
}

export type PlaygroundSettings = {
  get: () => PlaygroundSettingsValue
  patch: (p: Partial<PlaygroundSettingsValue>) => void
  subscribe: (fn: () => void) => () => void
  /** The listening settings a voice session runs on: the same object while the page is open. */
  listening: () => Listening
}

const KEY = 'voice-playground.settings'

const LISTENING_NUMBERS = Object.fromEntries(
  Object.entries(VOICE_SETTINGS.listening).filter(([, v]) => typeof v === 'number'),
) as ListeningNumbers

export const DEFAULT_SETTINGS: PlaygroundSettingsValue = {
  mode: 'live', lead: { kind: 'fake', delayMs: 1_500 }, compare: [], compareChosen: false, adaptiveVoice: true, listening: LISTENING_NUMBERS,
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

/** What was kept, made safe: anything of another shape falls back to the defaults. */
export function readSettings(raw: string | null): PlaygroundSettingsValue {
  try {
    const v = JSON.parse(raw ?? 'null') as Partial<PlaygroundSettingsValue> | null
    return {
      mode: v?.mode === 'scenarios' ? 'scenarios' : 'live',
      lead: isLead(v?.lead) ? v.lead : DEFAULT_SETTINGS.lead,
      compare: Array.isArray(v?.compare) ? v.compare.filter((m): m is string => typeof m === 'string') : [],
      compareChosen: v?.compareChosen === true,
      adaptiveVoice: typeof v?.adaptiveVoice === 'boolean' ? v.adaptiveVoice : DEFAULT_SETTINGS.adaptiveVoice,
      listening: readListening(v?.listening),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function createPlaygroundSettings(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): PlaygroundSettings {
  let value = readSettings(read(storage))
  const live: Listening = { ...VOICE_SETTINGS.listening, ...value.listening }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    patch(p) {
      value = { ...value, ...p }
      Object.assign(live, value.listening)
      try { storage?.setItem(KEY, JSON.stringify(value)) } catch { /* not kept: fine */ }
      listeners.forEach(l => l())
    },
    subscribe(fn) { listeners.add(fn); return () => { listeners.delete(fn) } },
    listening: () => live,
  }
}

function read(storage: Pick<Storage, 'getItem'> | null): string | null {
  try { return storage?.getItem(KEY) ?? null } catch { return null }
}

function safeStorage(): Storage | null {
  try { return typeof localStorage === 'undefined' ? null : localStorage } catch { return null }
}
