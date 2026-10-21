/** How a machine's fields turn into the words on its card (board *Fleet*): its state, in words, never colour alone. */
import { HOST_SILENT_AFTER_MS, type HostFigures } from '@agenthix/core'
import type { PillTone } from '@agenthix/ui/primitives'
import type { FleetHost } from './types'

export type HostState = 'healthy' | 'starting' | 'attention' | 'notAnswering' | 'notHeard' | 'stopped' | 'left' | 'moving' | 'empty'

export type HostWords = {
  state: HostState
  tone: PillTone
  label: string
  /** The one line under the name. */
  sentence: string
  /** Why it needs attention, short, for the overview; null when it does not. */
  attention: string | null
}

/** From this share of the disk or memory used, the machine needs attention. */
export const NEAR_CAPACITY = 90

/** Disk and file sizes are decimal, 1 GB = 10^9 bytes, as HQ gives them. */
export const GB = 1000 ** 3
export const MB = 1000 ** 2
/** Memory is binary, 1 GB = 2^30 bytes, as Docker and HQ count a run's memory, so a limit of 8 GB reads 8 everywhere. */
export const MEMORY_GB = 1024 ** 3

const clock = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
const dayOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
const DAY = 24 * 60 * 60 * 1000

/** A moment in plain words: "today 02:00", "yesterday 18:02", "11 Oct 02:00". */
export function whenIs(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'at an unknown time'
  const days = Math.round((dayOf(now) - dayOf(d)) / DAY)
  if (days === 0) return `today ${clock(d)}`
  if (days === 1) return `yesterday ${clock(d)}`
  return `${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} ${clock(d)}`
}

/** How long, in the largest whole unit: "5 minutes", "12 days". */
export function spanOf(fromIso: string, now: Date): string {
  const ms = Math.max(0, now.getTime() - new Date(fromIso).getTime())
  const minutes = Math.floor(ms / 60_000)
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  if (minutes < 60) return unit(minutes, 'minute')
  if (minutes < 60 * 24) return unit(Math.floor(minutes / 60), 'hour')
  return unit(Math.floor(minutes / (60 * 24)), 'day')
}

/** A moment after "at": "at 18:02" today, "yesterday at 18:02", "on 11 Oct at 02:00". */
export function atWhen(iso: string, now: Date): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'at an unknown time'
  const days = Math.round((dayOf(now) - dayOf(d)) / DAY)
  if (days === 0) return `at ${clock(d)}`
  if (days === 1) return `yesterday at ${clock(d)}`
  return `on ${d.getDate()} ${d.toLocaleString('en-GB', { month: 'short' })} at ${clock(d)}`
}

/**
 * How a machine that is not answering is read (the owner's decision replacing "Asleep · Nothing to do"): stopped on
 * purpose, said by its host service; *not answering*, silent for 10 minutes (as HQ counts its notice) when its fleet
 * admins asked to be told; otherwise only *not heard from* — a restart, or a machine allowed to be switched off. Null
 * while it answers.
 */
export type Silence =
  | { kind: 'stopped'; at: string }
  | { kind: 'notAnswering'; since: string }
  | { kind: 'notHeard'; since: string | null }

export const notifies = (h: Pick<FleetHost, 'hqMachine' | 'notifyIfSilent'>): boolean => h.hqMachine || h.notifyIfSilent !== false

export function silenceOf(h: FleetHost, now: Date): Silence | null {
  if (h.online) return null
  if (h.stoppedAt) return { kind: 'stopped', at: h.stoppedAt }
  if (h.since && notifies(h) && now.getTime() - Date.parse(h.since) >= HOST_SILENT_AFTER_MS) return { kind: 'notAnswering', since: h.since }
  return { kind: 'notHeard', since: h.since }
}

/** The silence in a sentence. */
export function silenceSentence(s: Silence, now: Date): string {
  if (s.kind === 'stopped') return `Stopped on its machine ${atWhen(s.at, now)}.`
  if (s.kind === 'notAnswering') return `Not answering since ${whenIs(s.since, now)}.`
  return s.since ? `Not heard from since ${whenIs(s.since, now)}.` : 'Not heard from yet.'
}

const SILENCE_WORDS: Record<Silence['kind'], Pick<HostWords, 'state' | 'tone' | 'label' | 'attention'>> = {
  stopped: { state: 'stopped', tone: 'neutral', label: 'Stopped', attention: null },
  notAnswering: { state: 'notAnswering', tone: 'warning', label: 'Not answering', attention: 'not answering' },
  notHeard: { state: 'notHeard', tone: 'neutral', label: 'Not heard from', attention: null },
}

export const percent = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 100) : 0)

export function diskUsedPercent(f: HostFigures): number {
  const { freeBytes, totalBytes } = f.resources.disk
  return percent(totalBytes - freeBytes, totalBytes)
}

export function memoryUsedPercent(f: HostFigures): number {
  return percent(f.resources.memory.usedBytes, f.resources.memory.totalBytes)
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s).replace(/\.$/, '')

function trouble(f: HostFigures): { sentence: string; attention: string; tone: PillTone } | null {
  // A part that is still starting is not unwell; only one stopped or failing, past its start, is.
  const bad = f.installs.find(i => !i.healthy && i.state !== 'starting')
  if (bad) {
    const sentence = bad.problem ?? `The ${bad.target} is ${bad.state}.`
    return { sentence, attention: lowerFirst(sentence), tone: 'danger' }
  }
  if (!f.protections.holding) {
    const sentence = f.protections.problem ?? "The agent protections do not hold on this machine."
    return { sentence, attention: lowerFirst(sentence), tone: 'danger' }
  }
  const disk = diskUsedPercent(f)
  if (disk >= NEAR_CAPACITY) {
    const left = Math.round(f.resources.disk.freeBytes / GB)
    return {
      sentence: `Disk ${disk}% full, ${left} GB left. Free space before it fills, or the site stops taking runs.`,
      attention: `disk ${disk}% full`,
      tone: 'warning',
    }
  }
  const memory = memoryUsedPercent(f)
  if (memory >= NEAR_CAPACITY) {
    return { sentence: `Memory ${memory}% in use. Agents may be refused until some finish.`, attention: `memory ${memory}% in use`, tone: 'warning' }
  }
  return null
}

/**
 * Whether the machine runs a site — or HQ, with its default site — by what it says in its figures; before its first
 * figures, by whether HQ registered its site. Never by a name a join or a move gave its record. A machine receiving a
 * site does not run it until the move finishes.
 */
export function runsSite(h: FleetHost): boolean {
  if (h.move?.role === 'receiving') return false
  if (h.hqMachine) return true
  if (h.figures) return h.figures.installs.length > 0
  return h.siteRegistered
}

/** The name a machine's card goes by: its site's, or the machine's own when it runs none. */
export const cardName = (h: FleetHost): string => (runsSite(h) && h.siteName ? h.siteName : h.machineName)

export function describeHost(h: FleetHost, now: Date): HostWords {
  if (h.leftByItself) {
    return {
      state: 'left', tone: 'warning', label: 'Disconnected on its machine',
      sentence: `This machine disconnected itself ${h.leftAt ? whenIs(h.leftAt, now) : 'earlier'}. It stays listed until you remove it from the list: HQ then forgets it and its site, and nothing on the machine changes.`,
      attention: 'disconnected itself',
    }
  }
  if (h.move) {
    if (h.move.role === 'receiving') {
      const waiting = h.move.state === 'waitingForMachine'
      return {
        state: 'moving', tone: 'neutral',
        label: waiting ? `Waiting to receive ${h.move.siteName}` : `Receiving ${h.move.siteName}`,
        sentence: waiting ? `${h.move.siteName} will run here once this machine is confirmed.` : `${h.move.siteName} is moving to this machine.`,
        attention: null,
      }
    }
    return { state: 'moving', tone: 'neutral', label: 'Moving', sentence: `${h.move.siteName} is moving to another machine.`, attention: null }
  }
  if (h.online && !h.figures) {
    return { state: 'starting', tone: 'neutral', label: 'Online', sentence: 'Waiting for its first figures.', attention: null }
  }
  const silence = silenceOf(h, now)
  if (!runsSite(h)) {
    const ended = h.endedMove ? `The move of ${h.endedMove.siteName} to it did not happen. ` : ''
    const heard = silence ? ` ${silenceSentence(silence, now)}` : ''
    const attention = silence ? SILENCE_WORDS[silence.kind].attention : null
    return { state: 'empty', tone: attention ? 'warning' : 'neutral', label: 'No site', sentence: `${ended}Nothing runs here but its host service.${heard}`, attention }
  }
  if (silence) return { ...SILENCE_WORDS[silence.kind], sentence: silenceSentence(silence, now) }
  if (!h.figures) {
    return { state: 'starting', tone: 'neutral', label: 'Online', sentence: 'Waiting for its first figures.', attention: null }
  }
  const t = trouble(h.figures)
  if (t) return { state: 'attention', tone: t.tone, label: 'Needs attention', sentence: t.sentence, attention: t.attention }
  const starting = h.figures.installs.find(i => i.state === 'starting')
  if (starting) {
    return { state: 'starting', tone: 'neutral', label: 'Starting…', sentence: `The ${starting.target} is starting.`, attention: null }
  }
  // The site's own time running (its install's `since`), never when the machine connected.
  const running = h.figures.installs.find(i => i.target === 'site') ?? h.figures.installs[0]
  return {
    state: 'healthy', tone: 'healthy', label: 'Healthy',
    sentence: running ? `Up ${spanOf(running.since, now)}.` : 'Answering.',
    attention: null,
  }
}

/** "Acme Robotics' HQ", "Fernhill's HQ". */
export const possessive = (name: string): string => (/s$/i.test(name) ? `${name}'` : `${name}'s`)
