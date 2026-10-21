/**
 * A switch of the host service to a new version (ADR-0118), written down in its state folder as it goes. The host
 * service writes it once it has checked the new image; the launcher reads it, refuses anything it does not hold,
 * and writes each step before taking it, so a launcher Docker starts again (after the machine restarts, say)
 * carries on from where the last one stopped. It is also how the host service, and `status`, learn how it ended.
 */
import type { StateFolder } from '../state/folder'

/** How long a new host service has to answer as its version before the one it replaced is put back. */
export const ANSWER_WITHIN_MS = 3 * 60_000

export type SwitchPhase = 'ready' | 'switching' | 'puttingBack' | 'done' | 'failed' | 'refused'

export type HostSwitch = {
  from: string
  to: string
  /** The image whose signature the host service checked, fixed by its digest: `<repository>@sha256:…`. */
  ref: string
  /** The same image as Docker holds it, by its id: what the launcher runs, and nothing else. */
  imageId: string
  /** The host service set this only after the signature check passed. */
  checked: boolean
  /** The container being replaced, by its id. */
  oldContainer: string
  answerWithinMs: number
  startedAt: string
  phase: SwitchPhase
  /** How many times a launcher took it up; a launcher that keeps stopping partway puts the old one back. */
  attempts: number
  /** When the new host service was started, so a launcher started again waits no longer than the first would have. */
  waitingSince: string | null
  endedAt: string | null
  /** Why it was refused or failed, in words. */
  reason: string | null
}

const FILE = ['launcher', 'switch.json']
export const ENDED = new Set<SwitchPhase>(['done', 'failed', 'refused'])

const PHASES = new Set<SwitchPhase>(['ready', 'switching', 'puttingBack', 'done', 'failed', 'refused'])
const text = (v: unknown) => typeof v === 'string'
const maybe = (v: unknown) => v === null || typeof v === 'string'

/** The switch written down, checked field by field; null when there is none, or it is not one. */
export function readSwitch(state: StateFolder): HostSwitch | null {
  const raw = state.readJson(...FILE) as Record<string, unknown> | null
  if (!raw || typeof raw !== 'object') return null
  const ok = text(raw.from) && text(raw.to) && text(raw.ref) && text(raw.imageId) && typeof raw.checked === 'boolean'
    && text(raw.oldContainer) && typeof raw.answerWithinMs === 'number' && text(raw.startedAt)
    && PHASES.has(raw.phase as SwitchPhase) && typeof raw.attempts === 'number'
    && maybe(raw.waitingSince) && maybe(raw.endedAt) && maybe(raw.reason)
  return ok ? (raw as unknown as HostSwitch) : null
}

export function writeSwitch(state: StateFolder, s: HostSwitch): HostSwitch {
  state.writeJson(FILE, s)
  return s
}

export function endSwitch(state: StateFolder, s: HostSwitch, phase: 'done' | 'failed' | 'refused', reason: string | null, now: Date): HostSwitch {
  return writeSwitch(state, { ...s, phase, reason, endedAt: now.toISOString() })
}
